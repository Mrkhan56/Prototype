"""
workflow/engine.py — Config-driven state machine for document approval workflows.

Design philosophy:
  - Zero code changes required for new document types — just add a YAML config.
  - The engine validates: (a) transition is valid from current state,
    (b) user's role is authorized, (c) comments provided when required.
  - Every transition is logged to audit_logs and document_workflow_history.
  - State config drives SLA monitoring via sla_hours per state.
"""

import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from uuid import UUID

import yaml
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from models import (
    AuditLog,
    AuditResult,
    Document,
    DocumentWorkflowHistory,
    Notification,
    User,
)


# ── Config Dataclasses ────────────────────────────────────────────────────────

@dataclass
class StateConfig:
    name: str
    display_name: str
    is_initial: bool
    is_terminal: bool
    description: str = ""
    sla_hours: Optional[int] = None
    escalation_role: Optional[str] = None


@dataclass
class TransitionConfig:
    from_state: str
    to_state: str
    required_role: str
    display_name: str
    requires_comment: bool = False
    description: str = ""


@dataclass
class WorkflowConfig:
    name: str
    display_name: str
    description: str
    states: list[StateConfig] = field(default_factory=list)
    transitions: list[TransitionConfig] = field(default_factory=list)

    def get_state(self, name: str) -> Optional[StateConfig]:
        return next((s for s in self.states if s.name == name), None)

    def get_transitions_from(self, state_name: str, user_role: str) -> list[TransitionConfig]:
        """Return available transitions from a given state for a given role."""
        return [
            t for t in self.transitions
            if t.from_state == state_name and t.required_role == user_role
        ]

    def find_transition(self, from_state: str, to_state: str) -> Optional[TransitionConfig]:
        return next(
            (t for t in self.transitions
             if t.from_state == from_state and t.to_state == to_state),
            None,
        )


@dataclass
class TransitionResult:
    success: bool
    from_status: str
    to_status: str
    timestamp: datetime
    message: str = ""


# ── Workflow Engine ────────────────────────────────────────────────────────────

class WorkflowEngine:
    """
    Config-driven state machine engine.
    Loads workflow YAML configs from a directory at startup and
    executes transitions with full audit logging.
    """

    def __init__(self, config_dir: Optional[str] = None):
        if config_dir is None:
            config_dir = str(Path(__file__).parent / "configs")
        self._configs: dict[str, WorkflowConfig] = {}
        self._load_all_configs(config_dir)

    def _load_all_configs(self, config_dir: str) -> None:
        """Load all YAML workflow configs from the config directory."""
        config_path = Path(config_dir)
        if not config_path.exists():
            return
        for yaml_file in config_path.glob("*.yaml"):
            with open(yaml_file, "r") as f:
                raw = yaml.safe_load(f)
            config = self._parse_config(raw)
            self._configs[config.name] = config

    def _parse_config(self, raw: dict) -> WorkflowConfig:
        states = [StateConfig(**{k: v for k, v in s.items()}) for s in raw.get("states", [])]
        transitions = [TransitionConfig(**{k: v for k, v in t.items()}) for t in raw.get("transitions", [])]
        return WorkflowConfig(
            name=raw["name"],
            display_name=raw["display_name"],
            description=raw.get("description", ""),
            states=states,
            transitions=transitions,
        )

    def get_workflow(self, workflow_name: str) -> WorkflowConfig:
        """Return a workflow config by name, or raise ValueError."""
        config = self._configs.get(workflow_name)
        if config is None:
            raise ValueError(f"Unknown workflow: '{workflow_name}'. Available: {list(self._configs.keys())}")
        return config

    def list_workflows(self) -> list[dict]:
        return [
            {"name": c.name, "display_name": c.display_name, "description": c.description}
            for c in self._configs.values()
        ]

    async def get_available_transitions(
        self,
        document_id: UUID,
        user_role: str,
        workflow_name: str,
        db: AsyncSession,
    ) -> list[dict]:
        """
        Returns the list of transitions available to the user from the
        document's current state.
        """
        doc = await db.get(Document, document_id)
        if doc is None:
            return []

        config = self.get_workflow(workflow_name)
        current_state = doc.workflow_status or "DRAFT"
        transitions = config.get_transitions_from(current_state, user_role)

        return [
            {
                "from_state": t.from_state,
                "to_state": t.to_state,
                "display_name": t.display_name,
                "requires_comment": t.requires_comment,
                "description": t.description,
            }
            for t in transitions
        ]

    async def execute_transition(
        self,
        document_id: UUID,
        target_status: str,
        user_id: UUID,
        user_role: str,
        workflow_name: str,
        db: AsyncSession,
        comments: Optional[str] = None,
        ip_address: Optional[str] = None,
    ) -> TransitionResult:
        """
        Execute a workflow state transition with full validation and logging.

        Steps:
          1. Fetch document and determine current state
          2. Validate transition exists in config
          3. Validate user's role is authorized
          4. Validate comment provided if required
          5. Update document.workflow_status
          6. Insert workflow history record
          7. Write audit_log entry
          8. Fire notification hook
        """
        now = datetime.now(timezone.utc)
        config = self.get_workflow(workflow_name)

        # Fetch document
        doc = await db.get(Document, document_id)
        if doc is None:
            return TransitionResult(success=False, from_status="", to_status=target_status,
                                    timestamp=now, message="Document not found")

        current_status = doc.workflow_status or config.states[0].name

        # Validate transition exists
        transition = config.find_transition(current_status, target_status)
        if transition is None:
            return TransitionResult(
                success=False, from_status=current_status, to_status=target_status,
                timestamp=now,
                message=f"Transition from '{current_status}' to '{target_status}' is not defined",
            )

        # Validate role authorization
        if transition.required_role != user_role:
            return TransitionResult(
                success=False, from_status=current_status, to_status=target_status,
                timestamp=now,
                message=f"Role '{user_role}' is not authorized for this transition (requires '{transition.required_role}')",
            )

        # Validate comment if required
        if transition.requires_comment and not (comments or "").strip():
            return TransitionResult(
                success=False, from_status=current_status, to_status=target_status,
                timestamp=now,
                message=f"A comment is required for this transition ('{transition.display_name}')",
            )

        # Validate target state exists
        if config.get_state(target_status) is None:
            return TransitionResult(
                success=False, from_status=current_status, to_status=target_status,
                timestamp=now, message=f"Unknown target state: '{target_status}'",
            )

        # ── Execute the transition ────────────────────────────────────────────
        doc.workflow_status = target_status

        # Insert history record
        history = DocumentWorkflowHistory(
            document_id=document_id,
            from_status=current_status,
            to_status=target_status,
            transitioned_by=user_id,
            comments=comments,
            workflow_name=workflow_name,
            created_at=now,
        )
        db.add(history)

        # Write audit log (hash computed by DB trigger)
        audit = AuditLog(
            user_id=user_id,
            action="WORKFLOW_TRANSITION",
            resource_type="DOCUMENT",
            resource_id=document_id,
            ip_address=ip_address,
            details={
                "workflow": workflow_name,
                "from_status": current_status,
                "to_status": target_status,
                "transition": transition.display_name,
                "comments": comments,
            },
            result=AuditResult.SUCCESS,
            previous_log_hash="",
            current_log_hash="",
        )
        db.add(audit)

        # Fire notifications
        await _notify_on_transition(
            db=db,
            document=doc,
            from_status=current_status,
            to_status=target_status,
            actor_id=user_id,
            transition=transition,
            config=config,
            comments=comments,
        )

        await db.commit()

        return TransitionResult(
            success=True,
            from_status=current_status,
            to_status=target_status,
            timestamp=now,
            message=f"Successfully transitioned to '{target_status}'",
        )


async def _notify_on_transition(
    db: AsyncSession,
    document: Document,
    from_status: str,
    to_status: str,
    actor_id: UUID,
    transition: TransitionConfig,
    config: WorkflowConfig,
    comments: Optional[str],
) -> None:
    """
    Create in-app notifications for the relevant parties on a state transition.
    """
    # Notify document owner if they're not the actor
    if document.uploaded_by != actor_id:
        notif = Notification(
            user_id=document.uploaded_by,
            message=(
                f"Document '{document.title}' has moved from '{from_status}' "
                f"to '{to_status}' ({transition.display_name})."
                + (f" Comment: {comments}" if comments else "")
            ),
            notification_type="WORKFLOW",
            related_document_id=document.id,
            related_case_id=document.case_id,
        )
        db.add(notif)


# Singleton engine instance (loaded once at startup)
_engine_instance: Optional[WorkflowEngine] = None


def get_workflow_engine() -> WorkflowEngine:
    global _engine_instance
    if _engine_instance is None:
        _engine_instance = WorkflowEngine()
    return _engine_instance
