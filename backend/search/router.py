"""
search/router.py — Full-text and semantic search endpoints.

Access control is enforced in the SQL query itself (via JOIN on access_control),
not as a post-filter. This guarantees that the count of results also never
leaks information about documents the user cannot see.
"""

from datetime import date
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from auth.guards import UserContext, get_current_user, write_audit_log
from database import get_db
from models import AuditResult
from search.pii_filter import sanitize_for_audit
from search.queries import (
    build_facet_counts_query,
    build_search_query,
)

router = APIRouter(prefix="/search", tags=["Search"])


# ── Request / Response models ──────────────────────────────────────────────────

class SearchFilters(BaseModel):
    case_type: Optional[list[str]] = None
    doc_type: Optional[list[str]] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    department_id: Optional[UUID] = None
    case_status: Optional[list[str]] = None
    classification_level: Optional[list[str]] = None


class SearchRequest(BaseModel):
    query: str
    filters: SearchFilters = SearchFilters()
    page: int = 1
    page_size: int = 20
    use_semantic: bool = False


class SearchResultItem(BaseModel):
    document_id: str
    title: str
    case_number: str
    doc_type: str
    classification_level: str
    snippet: str
    rank: float
    created_at: str


class SearchResponse(BaseModel):
    results: list[SearchResultItem]
    total_count: int
    page: int
    page_size: int
    total_pages: int
    query: str


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("", response_model=SearchResponse)
async def search_documents(
    body: SearchRequest,
    request: Request,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SearchResponse:
    """
    Full-text search across document titles, OCR text, and case metadata.
    Access control is enforced in SQL — results never include unauthorized documents.
    Search query (with PII sanitized) is logged to audit_logs for compliance.
    """
    if not body.query.strip():
        return SearchResponse(
            results=[], total_count=0, page=body.page,
            page_size=body.page_size, total_pages=0, query=body.query
        )

    # Build parameterized SQL query
    sql, params = build_search_query(
        query_text=body.query,
        filters=body.filters,
        user_id=user.user_id,
        user_role=user.role,
        department_id=user.department_id,
        max_classification=user.max_classification,
        page=body.page,
        page_size=body.page_size,
    )

    from sqlalchemy import text
    result = await db.execute(text(sql), params)
    rows = result.fetchall()

    # Get total count with a separate count query
    count_sql, count_params = build_search_query(
        query_text=body.query,
        filters=body.filters,
        user_id=user.user_id,
        user_role=user.role,
        department_id=user.department_id,
        max_classification=user.max_classification,
        page=1,
        page_size=100000,  # large limit for count
        count_only=True,
    )
    count_result = await db.execute(text(count_sql), count_params)
    total_count = count_result.scalar() or 0

    results = [
        SearchResultItem(
            document_id=str(row.document_id),
            title=row.title,
            case_number=row.case_number,
            doc_type=row.doc_type,
            classification_level=row.classification_level,
            snippet=row.snippet or "",
            rank=float(row.rank or 0),
            created_at=str(row.created_at),
        )
        for row in rows
    ]

    # Log search query with PII sanitized (compliance requirement)
    sanitized_query = sanitize_for_audit(body.query)
    await write_audit_log(
        db=db,
        action="SEARCH_EXECUTED",
        resource_type="DOCUMENT",
        result=AuditResult.SUCCESS,
        user_id=user.user_id,
        ip_address=request.client.host if request.client else None,
        details={
            "query": sanitized_query,
            "result_count": len(results),
            "filters": body.filters.model_dump(exclude_none=True),
        },
    )

    total_pages = max(1, (total_count + body.page_size - 1) // body.page_size)
    return SearchResponse(
        results=results,
        total_count=total_count,
        page=body.page,
        page_size=body.page_size,
        total_pages=total_pages,
        query=body.query,
    )


@router.get("/facets")
async def get_facets(
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Returns available filter values with counts for the faceted search sidebar.
    Counts respect the requesting user's access control — no leakage.
    """
    sql, params = build_facet_counts_query(
        user_id=user.user_id,
        user_role=user.role,
        department_id=user.department_id,
        max_classification=user.max_classification,
    )
    from sqlalchemy import text
    result = await db.execute(text(sql), params)
    rows = result.fetchall()

    facets: dict = {
        "case_types": {},
        "doc_types": {},
        "case_statuses": {},
        "classification_levels": {},
    }
    for row in rows:
        facets[row.facet_group] = facets.get(row.facet_group, {})
        facets[row.facet_group][row.facet_value] = row.facet_count

    return facets
