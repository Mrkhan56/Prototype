"""
tests/test_workflow.py — Unit tests for the workflow engine.
"""

import pytest
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from workflow.engine import WorkflowConfig, WorkflowEngine, TransitionResult


class TestWorkflowConfigLoading:
    """Tests for YAML config loading and validation."""

    def test_loads_charge_sheet_config(self):
        engine = WorkflowEngine()
        config = engine.get_workflow("charge_sheet")
        assert config.name == "charge_sheet"
        assert len(config.states) >= 5
        assert len(config.transitions) >= 5

    def test_loads_forensic_report_config(self):
        engine = WorkflowEngine()
        config = engine.get_workflow("forensic_report")
        assert config.name == "forensic_report"
        assert any(s.name == "PEER_REVIEW" for s in config.states)

    def test_unknown_workflow_raises(self):
        engine = WorkflowEngine()
        with pytest.raises(ValueError, match="Unknown workflow"):
            engine.get_workflow("nonexistent_workflow")

    def test_list_workflows(self):
        engine = WorkflowEngine()
        workflows = engine.list_workflows()
        names = [w["name"] for w in workflows]
        assert "charge_sheet" in names
        assert "forensic_report" in names

    def test_initial_state_exists(self):
        engine = WorkflowEngine()
        config = engine.get_workflow("charge_sheet")
        initial_states = [s for s in config.states if s.is_initial]
        assert len(initial_states) == 1
        assert initial_states[0].name == "DRAFT"

    def test_terminal_state_exists(self):
        engine = WorkflowEngine()
        config = engine.get_workflow("charge_sheet")
        terminal_states = [s for s in config.states if s.is_terminal]
        assert len(terminal_states) >= 1
        assert any(s.name == "ARCHIVED" for s in terminal_states)


class TestTransitionValidation:
    """Tests for transition logic without DB."""

    def test_valid_transition_found(self):
        engine = WorkflowEngine()
        config = engine.get_workflow("charge_sheet")
        t = config.find_transition("DRAFT", "SUBMITTED_FOR_REVIEW")
        assert t is not None
        assert t.required_role == "INVESTIGATING_OFFICER"

    def test_invalid_transition_not_found(self):
        engine = WorkflowEngine()
        config = engine.get_workflow("charge_sheet")
        t = config.find_transition("DRAFT", "ARCHIVED")
        assert t is None  # Can't go directly from DRAFT to ARCHIVED

    def test_get_transitions_for_role(self):
        engine = WorkflowEngine()
        config = engine.get_workflow("charge_sheet")
        transitions = config.get_transitions_from("DRAFT", "INVESTIGATING_OFFICER")
        assert len(transitions) == 1
        assert transitions[0].to_state == "SUBMITTED_FOR_REVIEW"

    def test_wrong_role_no_transitions(self):
        engine = WorkflowEngine()
        config = engine.get_workflow("charge_sheet")
        transitions = config.get_transitions_from("DRAFT", "COURT_CLERK")
        assert len(transitions) == 0

    def test_supervisor_approve_transition(self):
        engine = WorkflowEngine()
        config = engine.get_workflow("charge_sheet")
        transitions = config.get_transitions_from("SUBMITTED_FOR_REVIEW", "SUPERVISOR")
        to_states = [t.to_state for t in transitions]
        assert "SUPERVISOR_APPROVED" in to_states
        assert "REJECTED" in to_states

    def test_rejection_requires_comment(self):
        engine = WorkflowEngine()
        config = engine.get_workflow("charge_sheet")
        t = config.find_transition("SUBMITTED_FOR_REVIEW", "REJECTED")
        assert t is not None
        assert t.requires_comment is True


class TestWorkflowExecution:
    """Tests for the execute_transition method with mocked DB."""

    @pytest.mark.asyncio
    async def test_transition_success(self):
        engine = WorkflowEngine()
        doc_id = uuid4()
        user_id = uuid4()

        mock_doc = MagicMock()
        mock_doc.id = doc_id
        mock_doc.workflow_status = "DRAFT"
        mock_doc.uploaded_by = user_id
        mock_doc.title = "Test Charge Sheet"
        mock_doc.case_id = uuid4()

        mock_db = AsyncMock()
        mock_db.get = AsyncMock(return_value=mock_doc)
        mock_db.add = MagicMock()
        mock_db.commit = AsyncMock()

        result = await engine.execute_transition(
            document_id=doc_id,
            target_status="SUBMITTED_FOR_REVIEW",
            user_id=user_id,
            user_role="INVESTIGATING_OFFICER",
            workflow_name="charge_sheet",
            db=mock_db,
        )

        assert result.success is True
        assert result.from_status == "DRAFT"
        assert result.to_status == "SUBMITTED_FOR_REVIEW"
        assert mock_doc.workflow_status == "SUBMITTED_FOR_REVIEW"

    @pytest.mark.asyncio
    async def test_transition_wrong_role_fails(self):
        engine = WorkflowEngine()
        doc_id = uuid4()

        mock_doc = MagicMock()
        mock_doc.id = doc_id
        mock_doc.workflow_status = "DRAFT"

        mock_db = AsyncMock()
        mock_db.get = AsyncMock(return_value=mock_doc)

        result = await engine.execute_transition(
            document_id=doc_id,
            target_status="SUBMITTED_FOR_REVIEW",
            user_id=uuid4(),
            user_role="COURT_CLERK",  # Wrong role
            workflow_name="charge_sheet",
            db=mock_db,
        )

        assert result.success is False
        assert "not authorized" in result.message

    @pytest.mark.asyncio
    async def test_transition_missing_comment_fails(self):
        engine = WorkflowEngine()
        doc_id = uuid4()

        mock_doc = MagicMock()
        mock_doc.id = doc_id
        mock_doc.workflow_status = "SUBMITTED_FOR_REVIEW"

        mock_db = AsyncMock()
        mock_db.get = AsyncMock(return_value=mock_doc)

        result = await engine.execute_transition(
            document_id=doc_id,
            target_status="REJECTED",
            user_id=uuid4(),
            user_role="SUPERVISOR",
            workflow_name="charge_sheet",
            db=mock_db,
            comments="",  # Empty comment when requires_comment=True
        )

        assert result.success is False
        assert "comment is required" in result.message

    @pytest.mark.asyncio
    async def test_transition_invalid_target_fails(self):
        engine = WorkflowEngine()
        doc_id = uuid4()

        mock_doc = MagicMock()
        mock_doc.id = doc_id
        mock_doc.workflow_status = "DRAFT"

        mock_db = AsyncMock()
        mock_db.get = AsyncMock(return_value=mock_doc)

        result = await engine.execute_transition(
            document_id=doc_id,
            target_status="ARCHIVED",  # Can't go directly from DRAFT
            user_id=uuid4(),
            user_role="INVESTIGATING_OFFICER",
            workflow_name="charge_sheet",
            db=mock_db,
        )

        assert result.success is False

    @pytest.mark.asyncio
    async def test_transition_document_not_found(self):
        engine = WorkflowEngine()

        mock_db = AsyncMock()
        mock_db.get = AsyncMock(return_value=None)

        result = await engine.execute_transition(
            document_id=uuid4(),
            target_status="SUBMITTED_FOR_REVIEW",
            user_id=uuid4(),
            user_role="INVESTIGATING_OFFICER",
            workflow_name="charge_sheet",
            db=mock_db,
        )

        assert result.success is False
        assert "not found" in result.message
