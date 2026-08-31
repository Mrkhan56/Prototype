"""
middleware/redaction.py — Response body redaction middleware.

Intercepts outgoing JSON responses and replaces sensitive field values
with a visible placeholder for users who lack the required clearance.

Design decisions:
  - Redaction happens at the response layer (not at DB query layer) so the
    application code doesn't need to think about it per-endpoint.
  - Fields to redact are determined by the role's permissions_json['redacted_fields'].
  - We replace the VALUE with a placeholder rather than removing the key,
    so the client can display "[REDACTED — insufficient clearance]" instead
    of a confusing missing field.
  - The middleware only activates for JSON responses to avoid touching
    file downloads, SSE streams, etc.
  - Nested objects and arrays are handled recursively.
"""

import json
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


REDACTION_PLACEHOLDER = "[REDACTED \u2014 insufficient clearance]"

# Fields that are always potentially sensitive.
# The actual list for each user comes from their role's permissions_json.
ALL_SENSITIVE_FIELDS = {
    "witness_name",
    "informant_id",
    "victim_details",
    "suspect_address",
    "officer_notes",
    "home_address",
    "personal_phone",
    "national_id",
    "aadhaar_number",
}


def _redact_value(obj: Any, fields_to_redact: set[str]) -> Any:
    """
    Recursively traverse a parsed JSON object and replace values of
    matching field names with the redaction placeholder.
    """
    if isinstance(obj, dict):
        return {
            key: (
                REDACTION_PLACEHOLDER
                if key in fields_to_redact
                else _redact_value(value, fields_to_redact)
            )
            for key, value in obj.items()
        }
    elif isinstance(obj, list):
        return [_redact_value(item, fields_to_redact) for item in obj]
    else:
        return obj


class RedactionMiddleware(BaseHTTPMiddleware):
    """
    Starlette middleware that redacts sensitive fields in JSON responses
    based on the authenticated user's role permissions.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        # Only process JSON responses
        content_type = response.headers.get("content-type", "")
        if "application/json" not in content_type:
            return response

        # Get user context attached by the auth guard
        user = getattr(request.state, "user", None)
        if user is None:
            # No authenticated user — no redaction needed (will be caught by auth)
            return response

        # Get the fields this role should have redacted
        role_redacted = set(user.permissions.get("redacted_fields", []))
        if not role_redacted:
            return response  # Nothing to redact for this role

        # Read and re-encode the response body
        body = b""
        body_iterator = getattr(response, "body_iterator", None)
        if body_iterator is not None:
            async for chunk in body_iterator:
                body += chunk
        elif hasattr(response, "body"):
            body = response.body  # type: ignore[attr-defined]


        try:
            body_bytes = bytes(body)
            parsed = json.loads(body_bytes)
            redacted = _redact_value(parsed, role_redacted)
            new_body = json.dumps(redacted, default=str).encode("utf-8")
        except (json.JSONDecodeError, Exception):
            # If parsing fails, return the original unmodified response
            new_body = bytes(body)


        # Rebuild response with the redacted body
        return Response(
            content=new_body,
            status_code=response.status_code,
            headers=dict(response.headers),
            media_type=response.media_type,
        )
