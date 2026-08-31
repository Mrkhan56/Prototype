"""
workflow/sla.py — SLA monitoring and auto-escalation for document workflows.

Runs as a background task (every 15 minutes by default), checking for
documents that have been stuck in a state past their SLA limit.
On breach, creates escalation notifications and logs a WORKFLOW_SLA_BREACH
audit event.
"""

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from database import AsyncSessionFactory
from models import (
    AuditLog,
    AuditResult,
    Document,
    DocumentWorkflowHistory,
    Notification,
    Role,
    User,
)
from workflow.engine import get_workflow_engine


@dataclass
class OverdueDocument:
    document_id: UUID
    document_title: str
    case_id: UUID
    current_status: str
    hours_overdue: float
    workflow_name: str
    last_transitioned_by: UUID
    sla_hours: int


class SLAMonitor:
    """Monitors document workflow SLA timers and auto-escalates breaches."""

    async def check_overdue_documents(
        self, db: AsyncSession
    ) -> list[OverdueDocument]:
        """
        Find all documents currently past their state's SLA limit.
        Queries document_workflow_history for the latest transition timestamp
        per document and compares against the state's sla_hours config.
        """
        engine = get_workflow_engine()
        overdue: list[OverdueDocument] = []
        now = datetime.now(timezone.utc)

        # Get all documents that are not in terminal states
        docs_result = await db.execute(
            select(Document, DocumentWorkflowHistory).join(
                DocumentWorkflowHistory,
                DocumentWorkflowHistory.document_id == Document.id,
            ).where(
                Document.workflow_status.notin_(["ARCHIVED"])  # Skip terminal
            ).order_by(
                Document.id, DocumentWorkflowHistory.created_at.desc()
            ).distinct(Document.id)
        )

        seen_docs: set[UUID] = set()
        for doc, latest_history in docs_result.fetchall():
            if doc.id in seen_docs:
                continue
            seen_docs.add(doc.id)

            workflow_name = latest_history.workflow_name
            current_state = doc.workflow_status or "DRAFT"

            try:
                config = engine.get_workflow(workflow_name)
                state = config.get_state(current_state)
            except (ValueError, AttributeError):
                continue

            if state is None or state.sla_hours is None:
                continue

            # Calculate how long the document has been in this state
            entered_at = latest_history.created_at
            if entered_at.tzinfo is None:
                entered_at = entered_at.replace(tzinfo=timezone.utc)

            hours_in_state = (now - entered_at).total_seconds() / 3600
            if hours_in_state > state.sla_hours:
                overdue.append(OverdueDocument(
                    document_id=doc.id,
                    document_title=doc.title,
                    case_id=doc.case_id,
                    current_status=current_state,
                    hours_overdue=hours_in_state - state.sla_hours,
                    workflow_name=workflow_name,
                    last_transitioned_by=latest_history.transitioned_by,
                    sla_hours=state.sla_hours,
                ))

        return overdue

    async def escalate(
        self,
        overdue: OverdueDocument,
        db: AsyncSession,
    ) -> None:
        """
        Create escalation notifications and log SLA breach to audit_logs.
        """
        engine = get_workflow_engine()
        config = engine.get_workflow(overdue.workflow_name)
        state = config.get_state(overdue.current_status)
        escalation_role = state.escalation_role if state else None

        message = (
            f"⚠️ SLA BREACH: Document '{overdue.document_title}' has been in "
            f"'{overdue.current_status}' for {overdue.hours_overdue:.1f} hours past the "
            f"{overdue.sla_hours}h SLA limit. Immediate action required."
        )

        # Notify all users with the escalation role
        if escalation_role:
            admins_result = await db.execute(
                select(User).join(User.role).where(
                    Role.name == escalation_role,
                    User.status == "ACTIVE",
                )
            )
            for admin in admins_result.scalars().all():
                notif = Notification(
                    user_id=admin.id,
                    message=message,
                    notification_type="WARNING",
                    related_document_id=overdue.document_id,
                    related_case_id=overdue.case_id,
                )
                db.add(notif)

        # Also notify the last person who touched the document
        responsible_notif = Notification(
            user_id=overdue.last_transitioned_by,
            message=f"ACTION REQUIRED: {message}",
            notification_type="WARNING",
            related_document_id=overdue.document_id,
            related_case_id=overdue.case_id,
        )
        db.add(responsible_notif)

        # Audit log for the SLA breach
        audit = AuditLog(
            user_id=None,  # System-generated event
            action="WORKFLOW_SLA_BREACH",
            resource_type="DOCUMENT",
            resource_id=overdue.document_id,
            details={
                "workflow": overdue.workflow_name,
                "state": overdue.current_status,
                "sla_hours": overdue.sla_hours,
                "hours_overdue": round(overdue.hours_overdue, 2),
                "escalated_to_role": escalation_role,
            },
            result=AuditResult.SUCCESS,
            previous_log_hash="",
            current_log_hash="",
        )
        db.add(audit)

    async def run_check(self, db: AsyncSession) -> int:
        """
        Run a full SLA check cycle.
        Returns the number of escalations triggered.
        """
        overdue_docs = await self.check_overdue_documents(db)
        for overdue in overdue_docs:
            await self.escalate(overdue, db)
        if overdue_docs:
            await db.commit()
        return len(overdue_docs)


async def sla_check_loop(interval_seconds: int = 900) -> None:
    """
    Background coroutine that runs SLA checks every interval_seconds (default 15 min).
    Integrate with FastAPI lifespan or asyncio.create_task().
    """
    monitor = SLAMonitor()
    while True:
        try:
            async with AsyncSessionFactory() as db:
                count = await monitor.run_check(db)
                if count > 0:
                    print(f"SLA Monitor: escalated {count} overdue document(s)")
        except Exception as exc:
            print(f"SLA Monitor error: {exc}")
        await asyncio.sleep(interval_seconds)
