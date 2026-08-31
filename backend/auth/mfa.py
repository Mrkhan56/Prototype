"""
auth/mfa.py — TOTP-based MFA using pyotp.

TOTP secrets are encrypted with AES-256-GCM before storage in the
database. The raw secret is never stored in plaintext anywhere.

Key choices:
  - AES-256-GCM: authenticated encryption (both confidentiality and integrity)
  - 12-byte nonce prepended to ciphertext for storage
  - valid_window=1 allows ±30s clock skew between user's device and server
"""

import base64
import os
from typing import Optional

import pyotp
import qrcode
import qrcode.image.svg
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from io import BytesIO

from config import get_settings

settings = get_settings()


class SecretVault:
    """
    AES-256-GCM encryption/decryption for TOTP secrets.
    The key comes from AES_SECRET_KEY_BASE64 config (32 bytes / 256 bits).
    """

    @staticmethod
    def _get_key() -> bytes:
        return base64.b64decode(settings.AES_SECRET_KEY_BASE64)

    @classmethod
    def encrypt(cls, plaintext: str) -> str:
        """Encrypt a string and return base64(nonce + ciphertext)."""
        aesgcm = AESGCM(cls._get_key())
        nonce = os.urandom(12)                             # 96-bit nonce for GCM
        ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
        return base64.b64encode(nonce + ciphertext).decode("utf-8")

    @classmethod
    def decrypt(cls, encoded: str) -> str:
        """Decrypt a base64(nonce + ciphertext) string."""
        raw = base64.b64decode(encoded.encode("utf-8"))
        nonce, ciphertext = raw[:12], raw[12:]
        aesgcm = AESGCM(cls._get_key())
        return aesgcm.decrypt(nonce, ciphertext, None).decode("utf-8")


def generate_mfa_setup(email: str, app_name: Optional[str] = None) -> tuple[str, str, str]:
    """
    Generate a new TOTP secret for a user during MFA enrollment.

    Returns:
        (encrypted_secret, provisioning_uri, qr_code_svg_str)
        - encrypted_secret: store this in users.mfa_secret_encrypted
        - provisioning_uri: for apps that accept URI directly
        - qr_code_svg_str: SVG string for rendering QR code in UI
    """
    raw_secret = pyotp.random_base32()
    encrypted_secret = SecretVault.encrypt(raw_secret)

    totp = pyotp.TOTP(raw_secret)
    provisioning_uri = totp.provisioning_uri(
        name=email,
        issuer_name=app_name or settings.APP_NAME,
    )

    # Generate SVG QR code (no external network call — purely local)
    qr = qrcode.QRCode(image_factory=qrcode.image.svg.SvgImage)
    qr.add_data(provisioning_uri)
    qr.make(fit=True)
    img = qr.make_image()
    buf = BytesIO()
    img.save(buf)
    qr_svg = buf.getvalue().decode("utf-8")

    return encrypted_secret, provisioning_uri, qr_svg


def verify_totp_code(encrypted_secret: str, code: str) -> bool:
    """
    Verify a 6-digit TOTP code against the stored encrypted secret.

    Args:
        encrypted_secret: From users.mfa_secret_encrypted
        code:             6-digit code entered by the user

    Returns:
        True if the code is valid; False otherwise.
    """
    try:
        raw_secret = SecretVault.decrypt(encrypted_secret)
    except Exception:
        # Decryption failure indicates corrupted/tampered data — deny
        return False

    totp = pyotp.TOTP(raw_secret)
    # valid_window=1 allows codes from the previous and next 30s window
    # to handle minor clock skew between server and authenticator app
    return totp.verify(code.strip(), valid_window=1)
