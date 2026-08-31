"""
search/queries.py — Parameterized SQL query builders for full-text search.

Key security principles:
  - All queries use parameterized inputs ($1, :param) — no string concatenation.
  - Access control is enforced IN the SQL query via JOIN/EXISTS on access_control,
    not as a post-filter. This prevents count-based information leakage.
  - Classification filtering is also done in SQL.
  - websearch_to_tsquery() is used instead of to_tsquery() because it handles
    user-supplied free-text input safely (no syntax errors from special chars).
"""

from typing import Any, Optional
from uuid import UUID


# Classification rank mapping for SQL CASE expression
_CLASSIFICATION_RANK_SQL = """
    CASE c.classification_level
        WHEN 'UNCLASSIFIED' THEN 0
        WHEN 'RESTRICTED'   THEN 1
        WHEN 'CONFIDENTIAL' THEN 2
        WHEN 'SECRET'       THEN 3
        ELSE 0
    END
"""

_USER_MAX_CLASSIFICATION_RANK_SQL = """
    CASE :max_classification
        WHEN 'UNCLASSIFIED' THEN 0
        WHEN 'RESTRICTED'   THEN 1
        WHEN 'CONFIDENTIAL' THEN 2
        WHEN 'SECRET'       THEN 3
        ELSE 0
    END
"""


def _build_access_control_clause(is_admin: bool) -> str:
    """Return the SQL EXISTS clause for access control check."""
    if is_admin:
        return "TRUE"  # Admins/auditors bypass access control
    return """
        EXISTS (
            SELECT 1 FROM access_control ac
            WHERE ac.is_active = TRUE
              AND (ac.expires_at IS NULL OR ac.expires_at > NOW())
              AND (
                  ac.user_id = :user_id
                  OR ac.role_id = (SELECT id FROM roles WHERE name = :user_role LIMIT 1)
              )
              AND (
                  ac.document_id = d.id
                  OR ac.case_id = d.case_id
              )
        )
    """


def build_search_query(
    query_text: str,
    filters: Any,
    user_id: UUID,
    user_role: str,
    department_id: UUID,
    max_classification: str,
    page: int = 1,
    page_size: int = 20,
    count_only: bool = False,
) -> tuple[str, dict]:
    """
    Build a parameterized PostgreSQL full-text search query.

    Returns:
        (sql_string, params_dict) ready for SQLAlchemy text() execution.
    """
    is_admin = user_role in ("SUPER_ADMIN", "AUDITOR")
    access_clause = _build_access_control_clause(is_admin)
    offset = (page - 1) * page_size

    params: dict[str, Any] = {
        "query_text": query_text,
        "user_id": str(user_id),
        "user_role": user_role,
        "department_id": str(department_id),
        "max_classification": max_classification,
        "limit": page_size,
        "offset": offset,
    }

    # Build WHERE filter clauses dynamically
    filter_clauses = [
        # Access control (either admin bypass or explicit grant)
        f"({access_clause})",
        # Classification clearance
        f"""
        ({_CLASSIFICATION_RANK_SQL}) <= ({_USER_MAX_CLASSIFICATION_RANK_SQL})
        """.replace("c.classification_level", "d.classification_level"),
    ]

    if filters.case_type:
        params["case_types"] = filters.case_type
        filter_clauses.append("c.type = ANY(:case_types)")

    if filters.doc_type:
        params["doc_types"] = filters.doc_type
        filter_clauses.append("d.doc_type = ANY(:doc_types)")

    if filters.date_from:
        params["date_from"] = filters.date_from
        filter_clauses.append("d.created_at >= :date_from")

    if filters.date_to:
        params["date_to"] = filters.date_to
        filter_clauses.append("d.created_at <= :date_to + INTERVAL '1 day'")

    if filters.department_id:
        params["filter_dept"] = str(filters.department_id)
        filter_clauses.append("c.department_id = :filter_dept")

    if filters.case_status:
        params["case_statuses"] = filters.case_status
        filter_clauses.append("c.status = ANY(:case_statuses)")

    if filters.classification_level:
        params["filter_classifications"] = filters.classification_level
        filter_clauses.append("d.classification_level = ANY(:filter_classifications)")

    where_clause = " AND ".join(filter_clauses)

    if count_only:
        sql = f"""
            SELECT COUNT(DISTINCT d.id) AS total
            FROM documents d
            JOIN cases c ON c.id = d.case_id
            LEFT JOIN document_versions dv ON dv.id = d.current_version_id
            WHERE
                (
                    d.metadata_tsv @@ websearch_to_tsquery('english', :query_text)
                    OR c.search_tsv @@ websearch_to_tsquery('english', :query_text)
                    OR dv.ocr_tsv @@ websearch_to_tsquery('english', :query_text)
                )
                AND {where_clause}
        """
        return sql, params

    sql = f"""
        SELECT
            d.id          AS document_id,
            d.title       AS title,
            c.case_number AS case_number,
            d.doc_type    AS doc_type,
            d.classification_level AS classification_level,
            d.created_at  AS created_at,
            -- Relevance score: weight title match highest, then case, then OCR
            (
                COALESCE(ts_rank_cd(d.metadata_tsv, websearch_to_tsquery('english', :query_text)), 0) * 4.0
                + COALESCE(ts_rank_cd(c.search_tsv,   websearch_to_tsquery('english', :query_text)), 0) * 2.0
                + COALESCE(ts_rank_cd(dv.ocr_tsv,     websearch_to_tsquery('english', :query_text)), 0) * 1.0
            ) AS rank,
            -- Highlighted snippet from best matching source
            COALESCE(
                ts_headline(
                    'english',
                    COALESCE(dv.ocr_text, d.description, d.title),
                    websearch_to_tsquery('english', :query_text),
                    'StartSel=<mark>, StopSel=</mark>, MaxWords=35, MinWords=15, ShortWord=3'
                ),
                d.title
            ) AS snippet
        FROM documents d
        JOIN cases c ON c.id = d.case_id
        LEFT JOIN document_versions dv ON dv.id = d.current_version_id
        WHERE
            (
                d.metadata_tsv @@ websearch_to_tsquery('english', :query_text)
                OR c.search_tsv @@ websearch_to_tsquery('english', :query_text)
                OR dv.ocr_tsv  @@ websearch_to_tsquery('english', :query_text)
            )
            AND {where_clause}
        ORDER BY rank DESC, d.created_at DESC
        LIMIT :limit
        OFFSET :offset
    """
    return sql, params


def build_facet_counts_query(
    user_id: UUID,
    user_role: str,
    department_id: UUID,
    max_classification: str,
    query_text: Optional[str] = None,
) -> tuple[str, dict]:
    """
    Build a query that returns facet counts for the search sidebar.
    Respects access control — counts only what the user can see.
    """
    is_admin = user_role in ("SUPER_ADMIN", "AUDITOR")
    access_clause = _build_access_control_clause(is_admin)

    params: dict[str, Any] = {
        "user_id": str(user_id),
        "user_role": user_role,
        "department_id": str(department_id),
        "max_classification": max_classification,
    }

    ts_filter = ""
    if query_text:
        params["query_text"] = query_text
        ts_filter = "AND d.metadata_tsv @@ websearch_to_tsquery('english', :query_text)"

    sql = f"""
        SELECT 'case_types'           AS facet_group, c.type::text  AS facet_value, COUNT(*) AS facet_count
        FROM documents d JOIN cases c ON c.id = d.case_id
        WHERE ({access_clause}) {ts_filter}
        GROUP BY c.type

        UNION ALL

        SELECT 'doc_types'            AS facet_group, d.doc_type::text, COUNT(*)
        FROM documents d JOIN cases c ON c.id = d.case_id
        WHERE ({access_clause}) {ts_filter}
        GROUP BY d.doc_type

        UNION ALL

        SELECT 'case_statuses'        AS facet_group, c.status::text, COUNT(*)
        FROM documents d JOIN cases c ON c.id = d.case_id
        WHERE ({access_clause}) {ts_filter}
        GROUP BY c.status

        UNION ALL

        SELECT 'classification_levels' AS facet_group, d.classification_level::text, COUNT(*)
        FROM documents d JOIN cases c ON c.id = d.case_id
        WHERE ({access_clause}) {ts_filter}
        GROUP BY d.classification_level
        ORDER BY facet_group, facet_count DESC
    """
    return sql, params
