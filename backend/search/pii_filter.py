"""
search/pii_filter.py — PII detection and sanitization for audit logs.

Search queries are logged to audit_logs for compliance review. However,
if a query contains PII (names, ID numbers, phone numbers), we must
not store the raw PII in the audit log itself. Instead, we hash the
detected PII tokens so the log records that a PII-containing query
was made without preserving the sensitive data.

This is a regex-based implementation — fast, zero-dependency, no ML.
For production at scale, consider a dedicated PII detection library.
"""

import hashlib
import re

# Patterns for common PII types found in Indian legal/investigation contexts
PII_PATTERNS = [
    # Phone numbers: +91-XXXXX-XXXXX, 10-digit mobile, etc.
    (re.compile(r'\b(?:\+91[-\s]?)?[6-9]\d{9}\b'), "PHONE"),
    # Aadhaar number: 12-digit with optional spaces (XXXX XXXX XXXX)
    (re.compile(r'\b\d{4}\s?\d{4}\s?\d{4}\b'), "AADHAAR"),
    # Email addresses
    (re.compile(r'\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b'), "EMAIL"),
    # PAN number: AAAAA9999A format
    (re.compile(r'\b[A-Z]{5}[0-9]{4}[A-Z]\b'), "PAN"),
    # Passport number: A-Z followed by 7 digits
    (re.compile(r'\b[A-Z]\d{7}\b'), "PASSPORT"),
    # Voter ID: 3 letters + 7 digits
    (re.compile(r'\b[A-Z]{3}\d{7}\b'), "VOTER_ID"),
    # Date of birth patterns: DD/MM/YYYY or DD-MM-YYYY
    (re.compile(r'\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}\b'), "DOB"),
]


def contains_pii(text: str) -> bool:
    """Returns True if the text contains any detected PII pattern."""
    for pattern, _ in PII_PATTERNS:
        if pattern.search(text):
            return True
    return False


def sanitize_for_audit(query_text: str) -> str:
    """
    Replace detected PII tokens with their SHA-256 hashes.

    Example:
        "assault by John near 9876543210" ->
        "assault by John near [PHONE:abc123...]"

    The hash allows correlation queries in the audit log without
    storing the sensitive value itself.

    Args:
        query_text: The raw search query from the user

    Returns:
        Sanitized query string safe to store in audit_logs
    """
    sanitized = query_text
    for pattern, pii_type in PII_PATTERNS:
        def _hash_match(m: re.Match) -> str:
            value = m.group(0)
            hashed = hashlib.sha256(value.encode()).hexdigest()[:12]
            return f"[{pii_type}:{hashed}]"
        sanitized = pattern.sub(_hash_match, sanitized)
    return sanitized
