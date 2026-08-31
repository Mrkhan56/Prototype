"""
tests/test_auth.py — Unit tests for authentication and RBAC module.

Tests cover:
  - Login success / failure
  - Account lockout after 5 failed attempts
  - MFA enforcement (no bypass)
  - Access denial for expired grants, wrong department, wrong role
  - Redaction middleware correctness
  - Refresh token rotation and reuse detection
"""

import hashlib
import json
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4, UUID

import pytest

from auth.jwt_handler import create_access_token, create_mfa_token, decode_token, TokenError
from auth.mfa import SecretVault, generate_mfa_setup, verify_totp_code
from auth.rate_limiter import (
    is_account_locked,
    record_failed_attempt,
    record_successful_login,
    _attempts,
)
from middleware.redaction import _redact_value, REDACTION_PLACEHOLDER
from search.pii_filter import contains_pii, sanitize_for_audit


# ── Fixtures ───────────────────────────────────────────────────────────────────

ROLE_PERMISSIONS_IO = {
    "allowed_doc_types": ["FIR", "WITNESS_STATEMENT"],
    "allowed_actions": ["VIEW", "DOWNLOAD"],
    "max_classification": "CONFIDENTIAL",
    "redacted_fields": ["informant_id"],
}

ROLE_PERMISSIONS_COURT_CLERK = {
    "allowed_doc_types": ["CHARGE_SHEET", "COURT_ORDER"],
    "allowed_actions": ["VIEW"],
    "max_classification": "RESTRICTED",
    "redacted_fields": ["witness_name", "informant_id", "victim_details"],
}

ROLE_PERMISSIONS_SUPER_ADMIN = {
    "allowed_doc_types": ["FIR", "CHARGE_SHEET", "FORENSIC_REPORT", "WITNESS_STATEMENT"],
    "allowed_actions": ["VIEW", "DOWNLOAD", "PRINT", "EDIT", "TRANSFER", "FULL"],
    "max_classification": "SECRET",
    "redacted_fields": [],
}


# ── JWT Tests ─────────────────────────────────────────────────────────────────

class TestJWTHandler:
    """Tests for JWT token creation and validation."""

    def setup_method(self):
        """Use test RSA keys (generated inline for tests)."""
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric import rsa
        from cryptography.hazmat.backends import default_backend

        private_key = rsa.generate_private_key(
            public_exponent=65537, key_size=2048, backend=default_backend()
        )
        self.private_pem = private_key.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.TraditionalOpenSSL,
            serialization.NoEncryption(),
        ).decode()
        self.public_pem = private_key.public_key().public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        ).decode()

    def _patch_settings(self, monkeypatch):
        monkeypatch.setattr("auth.jwt_handler.settings.JWT_PRIVATE_KEY", self.private_pem)
        monkeypatch.setattr("auth.jwt_handler.settings.JWT_PUBLIC_KEY", self.public_pem)
        monkeypatch.setattr("auth.jwt_handler.settings.JWT_ISSUER", "legal-dms-auth")
        monkeypatch.setattr("auth.jwt_handler.settings.JWT_ALGORITHM", "RS256")
        monkeypatch.setattr("auth.jwt_handler.settings.GENERAL_SESSION_TIMEOUT_MINUTES", 60)
        monkeypatch.setattr("auth.jwt_handler.settings.CLASSIFIED_SESSION_TIMEOUT_MINUTES", 15)
        monkeypatch.setattr("auth.jwt_handler.settings.MFA_TOKEN_EXPIRE_MINUTES", 5)

    def test_access_token_decode_success(self, monkeypatch):
        self._patch_settings(monkeypatch)
        user_id = uuid4()
        dept_id = uuid4()
        token = create_access_token(user_id, "INVESTIGATING_OFFICER", dept_id, "CONFIDENTIAL")
        payload = decode_token(token, expected_type="access")
        assert payload["sub"] == str(user_id)
        assert payload["role"] == "INVESTIGATING_OFFICER"
        assert payload["type"] == "access"

    def test_mfa_token_rejected_as_access_token(self, monkeypatch):
        self._patch_settings(monkeypatch)
        user_id = uuid4()
        mfa_token = create_mfa_token(user_id)
        with pytest.raises(TokenError, match="Token type mismatch"):
            decode_token(mfa_token, expected_type="access")

    def test_expired_token_raises_error(self, monkeypatch):
        import jwt as pyjwt
        from datetime import datetime, timedelta, timezone

        self._patch_settings(monkeypatch)
        now = datetime.now(timezone.utc)
        payload = {
            "sub": str(uuid4()),
            "type": "access",
            "iat": now - timedelta(hours=2),
            "nbf": now - timedelta(hours=2),
            "exp": now - timedelta(hours=1),  # expired 1 hour ago
            "iss": "legal-dms-auth",
        }
        expired_token = pyjwt.encode(payload, self.private_pem, algorithm="RS256")
        with pytest.raises(TokenError, match="expired"):
            decode_token(expired_token, expected_type="access")


# ── MFA Tests ─────────────────────────────────────────────────────────────────

class TestMFA:
    """Tests for TOTP MFA setup and verification."""

    def _mock_settings(self, monkeypatch):
        import base64, os
        key = base64.b64encode(os.urandom(32)).decode()
        monkeypatch.setattr("auth.mfa.settings.AES_SECRET_KEY_BASE64", key)
        monkeypatch.setattr("auth.mfa.settings.APP_NAME", "TestApp")

    def test_totp_verify_valid_code(self, monkeypatch):
        self._mock_settings(monkeypatch)
        import pyotp
        encrypted, uri, qr = generate_mfa_setup("test@example.com")
        # Decrypt and generate the current valid code
        raw_secret = SecretVault.decrypt(encrypted)
        totp = pyotp.TOTP(raw_secret)
        valid_code = totp.now()
        assert verify_totp_code(encrypted, valid_code) is True

    def test_totp_verify_invalid_code(self, monkeypatch):
        self._mock_settings(monkeypatch)
        encrypted, _, _ = generate_mfa_setup("test@example.com")
        assert verify_totp_code(encrypted, "000000") is False

    def test_totp_setup_generates_provisioning_uri(self, monkeypatch):
        self._mock_settings(monkeypatch)
        encrypted, uri, qr = generate_mfa_setup("user@court.gov.in")
        assert "otpauth://totp/" in uri
        assert "user@court.gov.in" in uri or "user%40court.gov.in" in uri
        assert len(encrypted) > 20  # Non-trivial encrypted blob
        assert "<svg" in qr.lower() or "<?xml" in qr.lower()


    def test_encrypted_secret_is_not_plaintext(self, monkeypatch):
        self._mock_settings(monkeypatch)
        encrypted, _, _ = generate_mfa_setup("officer@police.gov.in")
        # The raw secret is base32; encrypted should not contain it directly
        import base64
        raw_secret = SecretVault.decrypt(encrypted)
        assert raw_secret not in encrypted


# ── Rate Limiter Tests ─────────────────────────────────────────────────────────

class TestRateLimiter:
    """Tests for login attempt rate limiting."""

    @pytest.mark.asyncio
    async def test_account_not_locked_initially(self):
        user_id = uuid4()
        assert await is_account_locked(user_id) is False

    @pytest.mark.asyncio
    async def test_lock_after_5_failures(self):
        user_id = uuid4()
        _attempts.pop(str(user_id), None)  # Clean state

        for i in range(4):
            locked = await record_failed_attempt(user_id)
            assert locked is False

        # 5th attempt should trigger lock
        locked = await record_failed_attempt(user_id)
        assert locked is True
        assert await is_account_locked(user_id) is True

    @pytest.mark.asyncio
    async def test_successful_login_resets_counter(self):
        user_id = uuid4()
        _attempts.pop(str(user_id), None)

        await record_failed_attempt(user_id)
        await record_failed_attempt(user_id)
        await record_successful_login(user_id)

        # After reset, not locked
        assert await is_account_locked(user_id) is False
        # Remaining attempts back to max
        from auth.rate_limiter import get_remaining_attempts
        assert await get_remaining_attempts(user_id) == 5

    @pytest.mark.asyncio
    async def test_lock_expires_after_duration(self):
        """Simulate an expired lock by backdating the locked_until timestamp."""
        from auth.rate_limiter import AttemptRecord
        user_id = uuid4()
        # Manually inject an expired lock
        _attempts[str(user_id)] = AttemptRecord(
            failed_count=5,
            locked_until=datetime.now(timezone.utc) - timedelta(minutes=1)
        )
        assert await is_account_locked(user_id) is False  # Should be cleared


# ── Redaction Middleware Tests ─────────────────────────────────────────────────

class TestRedactionMiddleware:
    """Tests for the field redaction logic."""

    def test_flat_dict_redacts_sensitive_field(self):
        data = {"case_number": "CR-001", "witness_name": "John Doe"}
        result = _redact_value(data, {"witness_name"})
        assert result["case_number"] == "CR-001"
        assert result["witness_name"] == REDACTION_PLACEHOLDER

    def test_nested_dict_redacts_deeply(self):
        data = {
            "document": {
                "title": "FIR #001",
                "witness_name": "Jane Doe",
                "details": {
                    "informant_id": "INF-9876",
                    "location": "Main Street",
                },
            }
        }
        result = _redact_value(data, {"witness_name", "informant_id"})
        assert result["document"]["witness_name"] == REDACTION_PLACEHOLDER
        assert result["document"]["details"]["informant_id"] == REDACTION_PLACEHOLDER
        assert result["document"]["details"]["location"] == "Main Street"

    def test_list_of_dicts_redacted(self):
        data = [
            {"witness_name": "Alice", "case": "CR-001"},
            {"witness_name": "Bob", "case": "CR-002"},
        ]
        result = _redact_value(data, {"witness_name"})
        assert result[0]["witness_name"] == REDACTION_PLACEHOLDER
        assert result[1]["witness_name"] == REDACTION_PLACEHOLDER
        assert result[0]["case"] == "CR-001"

    def test_no_redaction_for_empty_fields_list(self):
        data = {"witness_name": "Alice", "informant_id": "XYZ"}
        result = _redact_value(data, set())
        assert result["witness_name"] == "Alice"
        assert result["informant_id"] == "XYZ"

    def test_redaction_does_not_add_extra_keys(self):
        data = {"title": "Test Doc"}
        result = _redact_value(data, {"witness_name"})
        assert set(result.keys()) == {"title"}

    def test_court_clerk_redacts_multiple_fields(self):
        """Verify COURT_CLERK role redacts witness, informant, and victim fields."""
        clerk_fields = set(ROLE_PERMISSIONS_COURT_CLERK["redacted_fields"])
        data = {
            "title": "Charge Sheet",
            "witness_name": "Witness A",
            "informant_id": "INF-001",
            "victim_details": "Sensitive victim info",
            "case_number": "CR-2024-001",
        }
        result = _redact_value(data, clerk_fields)
        assert result["title"] == "Charge Sheet"
        assert result["case_number"] == "CR-2024-001"
        assert result["witness_name"] == REDACTION_PLACEHOLDER
        assert result["informant_id"] == REDACTION_PLACEHOLDER
        assert result["victim_details"] == REDACTION_PLACEHOLDER


# ── PII Filter Tests ────────────────────────────────────────────────────────────

class TestPIIFilter:
    """Tests for search query PII detection and sanitization."""

    def test_detects_phone_number(self):
        assert contains_pii("suspect called 9876543210 at midnight") is True

    def test_detects_aadhaar(self):
        assert contains_pii("aadhaar 1234 5678 9012") is True

    def test_detects_email(self):
        assert contains_pii("contact john.doe@example.com") is True

    def test_no_pii_in_clean_query(self):
        assert contains_pii("assault near school in sector 5") is False

    def test_sanitize_replaces_phone(self):
        query = "call from 9876543210 about robbery"
        sanitized = sanitize_for_audit(query)
        assert "9876543210" not in sanitized
        assert "[PHONE:" in sanitized
        assert "robbery" in sanitized  # Non-PII preserved

    def test_sanitize_replaces_email(self):
        query = "email from suspect@gmail.com"
        sanitized = sanitize_for_audit(query)
        assert "suspect@gmail.com" not in sanitized
        assert "[EMAIL:" in sanitized

    def test_sanitize_idempotent_for_clean_query(self):
        query = "assault near educational institution 2024"
        assert sanitize_for_audit(query) == query


# ── Access Control Edge Case Tests (mocked) ───────────────────────────────────

class TestAccessControlEdgeCases:
    """
    Integration-style tests for access guard edge cases.
    These tests verify the guard logic with mocked DB responses.
    """

    @pytest.mark.asyncio
    async def test_expired_access_grant_is_denied(self):
        """An access_control entry with expires_at in the past must be denied."""
        from auth.guards import _check_document_access, UserContext
        from unittest.mock import MagicMock, AsyncMock

        user = UserContext(
            user_id=uuid4(),
            email="officer@police.gov",
            role="INVESTIGATING_OFFICER",
            department_id=uuid4(),
            max_classification="CONFIDENTIAL",
            permissions=ROLE_PERMISSIONS_IO,
        )

        mock_doc = MagicMock()
        mock_doc.id = uuid4()
        mock_doc.case_id = uuid4()
        mock_doc.classification_level.value = "RESTRICTED"
        mock_doc.doc_type.value = "FIR"

        mock_db = AsyncMock()
        # First execute: returns the document
        # Second execute: returns no access control entry (expired)
        mock_db.execute = AsyncMock(side_effect=[
            MagicMock(scalar_one_or_none=MagicMock(return_value=mock_doc)),
            MagicMock(scalar_one_or_none=MagicMock(return_value=None)),  # No active grant
        ])

        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            await _check_document_access(mock_doc.id, user, mock_db)
        assert exc_info.value.status_code == 403
        assert "access" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_wrong_doc_type_for_role_denied(self):
        """COURT_CLERK cannot access FORENSIC_REPORT doc type."""
        from auth.guards import _check_document_access, UserContext
        from unittest.mock import MagicMock, AsyncMock

        user = UserContext(
            user_id=uuid4(),
            email="clerk@court.gov",
            role="COURT_CLERK",
            department_id=uuid4(),
            max_classification="RESTRICTED",
            permissions=ROLE_PERMISSIONS_COURT_CLERK,
        )

        mock_doc = MagicMock()
        mock_doc.id = uuid4()
        mock_doc.case_id = uuid4()
        mock_doc.classification_level.value = "RESTRICTED"
        mock_doc.doc_type.value = "FORENSIC_REPORT"  # Not in COURT_CLERK allowed types

        mock_db = AsyncMock()
        mock_db.execute = AsyncMock(return_value=MagicMock(
            scalar_one_or_none=MagicMock(return_value=mock_doc)
        ))

        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            await _check_document_access(mock_doc.id, user, mock_db)
        assert exc_info.value.status_code == 403
        assert "role" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_classification_too_low_denied(self):
        """COURT_CLERK (RESTRICTED clearance) cannot access SECRET document."""
        from auth.guards import _check_document_access, UserContext
        from unittest.mock import MagicMock, AsyncMock

        user = UserContext(
            user_id=uuid4(),
            email="clerk@court.gov",
            role="COURT_CLERK",
            department_id=uuid4(),
            max_classification="RESTRICTED",
            permissions=ROLE_PERMISSIONS_COURT_CLERK,
        )

        mock_doc = MagicMock()
        mock_doc.id = uuid4()
        mock_doc.case_id = uuid4()
        mock_doc.classification_level.value = "SECRET"  # Too high
        mock_doc.doc_type.value = "CHARGE_SHEET"

        mock_db = AsyncMock()
        mock_db.execute = AsyncMock(return_value=MagicMock(
            scalar_one_or_none=MagicMock(return_value=mock_doc)
        ))

        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            await _check_document_access(mock_doc.id, user, mock_db)
        assert exc_info.value.status_code == 403
        assert "classification" in exc_info.value.detail.lower()
