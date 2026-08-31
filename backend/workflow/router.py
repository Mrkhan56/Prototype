"""
workflow/router.py — Workflow management API endpoints.
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from auth.guards import UserContext, get_current_user
from database import get_db
from workflow.engine import get_workflow_engine

router = APIRouter(prefix="/workflow", tags=["Workflow"])


class TransitionRequest(BaseModel):
    target_status: str
    workflow_name: str
    comments: Optional[str] = None


@router.get("/configs")
async def list_workflow_configs(
    user: UserContext = Depends(get_current_user),
) -> list[dict]:
    """List all available workflow configurations."""
    engine = get_workflow_engine()
    return engine.list_workflows()


@router.get("/configs/{workflow_name}")
async def get_workflow_config(
    workflow_name: str,
    user: UserContext = Depends(get_current_user),
) -> dict:
    """Return full workflow config with states and transitions."""
    engine = get_workflow_engine()
    try:
        config = engine.get_workflow(workflow_name)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    return {
        "name": config.name,
        "display_name": config.display_name,
        "description": config.description,
        "states": [
            {
                "name": s.name,
                "display_name": s.display_name,
                "is_initial": s.is_initial,
                "is_terminal": s.is_terminal,
                "sla_hours": s.sla_hours,
                "escalation_role": s.escalation_role,
            }
            for s in config.states
        ],
        "transitions": [
            {
                "from_state": t.from_state,
                "to_state": t.to_state,
                "required_role": t.required_role,
                "display_name": t.display_name,
                "requires_comment": t.requires_comment,
            }
            for t in config.transitions
        ],
    }


@router.get("/{document_id}/status")
async def get_workflow_status(
    document_id: UUID,
    workflow_name: str,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Get the current workflow state and available transitions for the user."""
    from models import Document
    doc = await db.get(Document, document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found")

    engine = get_workflow_engine()
    available = await engine.get_available_transitions(
        document_id=document_id,
        user_role=user.role,
        workflow_name=workflow_name,
        db=db,
    )

    try:
        config = engine.get_workflow(workflow_name)
        state_config = config.get_state(doc.workflow_status or "DRAFT")
    except ValueError:
        state_config = None

    return {
        "document_id": str(document_id),
        "current_status": doc.workflow_status or "DRAFT",
        "current_status_display": state_config.display_name if state_config else doc.workflow_status,
        "is_terminal": state_config.is_terminal if state_config else False,
        "available_transitions": available,
    }


@router.post("/{document_id}/transition")
async def execute_transition(
    document_id: UUID,
    body: TransitionRequest,
    request: Request,
    user: UserContext = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Execute a workflow state transition for a document."""
    ip = request.client.host if request.client else None
    engine = get_workflow_engine()

    try:
        result = await engine.execute_transition(
            document_id=document_id,
            target_status=body.target_status,
            user_id=user.user_id,
            user_role=user.role,
            workflow_name=body.workflow_name,
            db=db,
            comments=body.comments,
            ip_address=ip,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if not result.success:
        raise HTTPException(status_code=403, detail=result.message)

    return {
        "success": True,
        "from_status": result.from_status,
        "to_status": result.to_status,
        "timestamp": result.timestamp.isoformat(),
        "message": result.message,
    }
