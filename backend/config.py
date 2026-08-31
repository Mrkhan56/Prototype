"""
config.py — Application configuration via Pydantic Settings.
All values are loaded from environment variables with sensible defaults
for local development. Production MUST override all secrets via env vars.
"""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # ---------- Application ------------------------------------------------
    APP_NAME: str = "Secure Legal Document Management System"
    DEBUG: bool = False
    API_VERSION: str = "v1"

    # ---------- Database ---------------------------------------------------
    DATABASE_URL: str = "postgresql+asyncpg://app_service:CHANGE_ME@localhost:5432/legal_dms"

    # ---------- JWT / Auth -------------------------------------------------
    # RS256 PEM keys — generate with:
    #   openssl genrsa -out private.pem 2048
    #   openssl rsa -in private.pem -pubout -out public.pem
    JWT_PRIVATE_KEY: str = "REPLACE_WITH_PEM_PRIVATE_KEY"
    JWT_PUBLIC_KEY: str = "REPLACE_WITH_PEM_PUBLIC_KEY"
    JWT_ALGORITHM: str = "RS256"
    JWT_ISSUER: str = "legal-dms-auth"

    # Access token: 15 min for classified access, 60 min for general
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    CLASSIFIED_SESSION_TIMEOUT_MINUTES: int = 15
    GENERAL_SESSION_TIMEOUT_MINUTES: int = 60

    # Refresh token: 7 days, stored as HttpOnly cookie
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # MFA challenge token: very short-lived (5 min between password and TOTP)
    MFA_TOKEN_EXPIRE_MINUTES: int = 5

    # AES-256-GCM key for encrypting TOTP secrets at rest
    # Generate: python -c "import os,base64; print(base64.b64encode(os.urandom(32)).decode())"
    AES_SECRET_KEY_BASE64: str = "REPLACE_WITH_32_BYTE_BASE64_KEY"

    # ---------- Rate Limiting ----------------------------------------------
    MAX_LOGIN_ATTEMPTS: int = 5
    LOCKOUT_DURATION_MINUTES: int = 30

    # ---------- File Storage (S3-compatible) --------------------------------
    S3_BUCKET: str = "legal-documents"
    S3_ENDPOINT: str = "https://s3.amazonaws.com"
    S3_ACCESS_KEY: str = "REPLACE"
    S3_SECRET_KEY: str = "REPLACE"
    S3_REGION: str = "ap-south-1"
    # WORM retention in days (2555 = 7 years)
    S3_WORM_RETENTION_DAYS: int = 2555

    # ---------- File Upload ------------------------------------------------
    MAX_UPLOAD_SIZE_MB: int = 100

    @property
    def MAX_UPLOAD_SIZE_BYTES(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    # ---------- ClamAV (antivirus) -----------------------------------------
    CLAMAV_HOST: str = "localhost"
    CLAMAV_PORT: int = 3310
    CLAMAV_STRICT_MODE: bool = True  # False = warn, don't block if ClamAV is down

    # ---------- CORS -------------------------------------------------------
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    # ---------- Notifications ----------------------------------------------
    SECURITY_ADMIN_EMAIL: str = "security-admin@example.com"  # For lockout alerts


@lru_cache
def get_settings() -> Settings:
    """Return cached settings instance (loaded once at startup)."""
    return Settings()
