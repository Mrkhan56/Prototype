"""
models.py — SQLAlchemy 2.0 ORM models mapping to V001_initial_schema.sql

All models use the modern mapped_column / Mapped type-annotation style
for full type-checker support and runtime validation.
"""

import enum
from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    BigInteger,
    Boolean,
    Date,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    CheckConstraint,
)
from sqlalchemy.dialects.postgresql import INET, JSONB, TIMESTAMP, UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base

TIMESTAMPTZ = TIMESTAMP(timezone=True)



# ────────────────────────────────────────────────────────────────────────────
# Python Enums (mirrors the PostgreSQL ENUM types)
# ────────────────────────────────────────────────────────────────────────────

class DepartmentPortalType(str, enum.Enum):
    POLICE = "POLICE"
    PROSECUTION = "PROSECUTION"
    FORENSIC = "FORENSIC"
    COURT = "COURT"
    ADMIN = "ADMIN"


class UserStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    LOCKED = "LOCKED"
    SUSPENDED = "SUSPENDED"


class CaseStatus(str, enum.Enum):
    OPEN = "OPEN"
    UNDER_INVESTIGATION = "UNDER_INVESTIGATION"
    CHARGE_SHEETED = "CHARGE_SHEETED"
    IN_TRIAL = "IN_TRIAL"
    CLOSED = "CLOSED"
    ARCHIVED = "ARCHIVED"


class CaseType(str, enum.Enum):
    FIR = "FIR"
    COMPLAINT = "COMPLAINT"
    SUO_MOTO = "SUO_MOTO"
    TRANSFER = "TRANSFER"
    APPEAL = "APPEAL"


class ClassificationLevel(str, enum.Enum):
    UNCLASSIFIED = "UNCLASSIFIED"
    RESTRICTED = "RESTRICTED"
    CONFIDENTIAL = "CONFIDENTIAL"
    SECRET = "SECRET"


class DocType(str, enum.Enum):
    FIR = "FIR"
    CHARGE_SHEET = "CHARGE_SHEET"
    WITNESS_STATEMENT = "WITNESS_STATEMENT"
    FORENSIC_REPORT = "FORENSIC_REPORT"
    COURT_ORDER = "COURT_ORDER"
    EVIDENCE_PHOTO = "EVIDENCE_PHOTO"
    LEGAL_BRIEF = "LEGAL_BRIEF"
    MEMO = "MEMO"
    OTHER = "OTHER"


class CustodyAction(str, enum.Enum):
    UPLOADED = "UPLOADED"
    VIEWED = "VIEWED"
    DOWNLOADED = "DOWNLOADED"
    PRINTED = "PRINTED"
    TRANSFERRED = "TRANSFERRED"
    SEALED = "SEALED"
    UNSEALED = "UNSEALED"
    REDACTED = "REDACTED"


class AuditResult(str, enum.Enum):
    SUCCESS = "SUCCESS"
    FAILURE = "FAILURE"
    DENIED = "DENIED"
    ERROR = "ERROR"


class PermissionType(str, enum.Enum):
    VIEW = "VIEW"
    DOWNLOAD = "DOWNLOAD"
    PRINT = "PRINT"
    EDIT = "EDIT"
    TRANSFER = "TRANSFER"
    FULL = "FULL"


class AssetCategory(str, enum.Enum):
    HARDWARE = "HARDWARE"
    SOFTWARE = "SOFTWARE"
    VEHICLE = "VEHICLE"
    EQUIPMENT = "EQUIPMENT"
    OTHER = "OTHER"


class AssetStatus(str, enum.Enum):
    AVAILABLE = "AVAILABLE"
    ASSIGNED = "ASSIGNED"
    MAINTENANCE = "MAINTENANCE"
    RETIRED = "RETIRED"


# ────────────────────────────────────────────────────────────────────────────
# ORM Models
# ────────────────────────────────────────────────────────────────────────────

class Department(Base):
    __tablename__ = "departments"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    portal_type: Mapped[DepartmentPortalType] = mapped_column(
        SAEnum(DepartmentPortalType, name="department_portal_type"), nullable=False
    )
    description: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)

    # Relationships
    users: Mapped[list["User"]] = relationship("User", back_populates="department")
    cases: Mapped[list["Case"]] = relationship("Case", back_populates="department")


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    permissions_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    is_system_role: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)

    # Relationships
    users: Mapped[list["User"]] = relationship("User", back_populates="role")
    access_controls: Mapped[list["AccessControl"]] = relationship("AccessControl", back_populates="role")


class User(Base):
    __tablename__ = "users"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("roles.id", ondelete="RESTRICT"), nullable=False)
    department_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("departments.id", ondelete="RESTRICT"), nullable=False)
    badge_id: Mapped[Optional[str]] = mapped_column(String(50), unique=True)
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    mfa_secret_encrypted: Mapped[Optional[str]] = mapped_column(Text)
    mfa_recovery_codes: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[UserStatus] = mapped_column(
        SAEnum(UserStatus, name="user_status"), nullable=False, default=UserStatus.ACTIVE
    )
    failed_login_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    locked_until: Mapped[Optional[datetime]] = mapped_column(TIMESTAMPTZ)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMPTZ)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)

    # Relationships
    role: Mapped["Role"] = relationship("Role", back_populates="users")
    department: Mapped["Department"] = relationship("Department", back_populates="users")
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship("RefreshToken", back_populates="user")


class Case(Base):
    __tablename__ = "cases"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    case_number: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    fir_number: Mapped[Optional[str]] = mapped_column(String(50))
    type: Mapped[CaseType] = mapped_column(SAEnum(CaseType, name="case_type"), nullable=False)
    status: Mapped[CaseStatus] = mapped_column(
        SAEnum(CaseStatus, name="case_status"), nullable=False, default=CaseStatus.OPEN
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    jurisdiction: Mapped[Optional[str]] = mapped_column(String(200))
    created_by: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    department_id: Mapped[Optional[UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("departments.id"))
    created_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)

    # Relationships
    department: Mapped[Optional["Department"]] = relationship("Department", back_populates="cases")
    documents: Mapped[list["Document"]] = relationship("Document", back_populates="case")
    access_controls: Mapped[list["AccessControl"]] = relationship("AccessControl", back_populates="case")


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    case_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("cases.id", ondelete="RESTRICT"), nullable=False)
    doc_type: Mapped[DocType] = mapped_column(SAEnum(DocType, name="doc_type_enum"), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    current_version_id: Mapped[Optional[UUID]] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("document_versions.id", use_alter=True, name="fk_documents_current_version", deferrable=True, initially="DEFERRED"),
    )
    uploaded_by: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    classification_level: Mapped[ClassificationLevel] = mapped_column(
        SAEnum(ClassificationLevel, name="classification_level"),
        nullable=False,
        default=ClassificationLevel.RESTRICTED,
    )
    workflow_status: Mapped[Optional[str]] = mapped_column(String(50), default="DRAFT")
    created_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)

    # Relationships
    case: Mapped["Case"] = relationship("Case", back_populates="documents")
    versions: Mapped[list["DocumentVersion"]] = relationship(
        "DocumentVersion",
        back_populates="document",
        foreign_keys="DocumentVersion.document_id",
        order_by="DocumentVersion.version_number",
    )
    custody_chain: Mapped[list["ChainOfCustody"]] = relationship("ChainOfCustody", back_populates="document")
    access_controls: Mapped[list["AccessControl"]] = relationship("AccessControl", back_populates="document")


class DocumentVersion(Base):
    __tablename__ = "document_versions"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    document_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("documents.id", ondelete="RESTRICT"), nullable=False)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    file_path: Mapped[str] = mapped_column(Text, nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    file_hash_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    uploaded_by: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    change_reason: Mapped[Optional[str]] = mapped_column(Text)
    ocr_text: Mapped[Optional[str]] = mapped_column(Text)
    thumbnail_path: Mapped[Optional[str]] = mapped_column(Text)
    is_immutable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    embedding: Mapped[Optional[list[float]]] = mapped_column(Vector(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)

    # Relationships
    document: Mapped["Document"] = relationship(
        "Document", back_populates="versions", foreign_keys=[document_id]
    )

    __table_args__ = (
        UniqueConstraint("document_id", "version_number", name="uq_document_version"),
    )


class ChainOfCustody(Base):
    __tablename__ = "chain_of_custody"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    document_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("documents.id", ondelete="RESTRICT"), nullable=False)
    version_id: Mapped[Optional[UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("document_versions.id"))
    action: Mapped[CustodyAction] = mapped_column(SAEnum(CustodyAction, name="custody_action"), nullable=False)
    performed_by: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    from_user: Mapped[Optional[UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    to_user: Mapped[Optional[UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    ip_address: Mapped[Optional[str]] = mapped_column(INET)
    user_agent: Mapped[Optional[str]] = mapped_column(Text)
    timestamp: Mapped[datetime] = mapped_column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)
    hash_at_action: Mapped[str] = mapped_column(String(64), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    # Relationships
    document: Mapped["Document"] = relationship("Document", back_populates="custody_chain")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    event_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False, default=uuid4)
    user_id: Mapped[Optional[UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)
    resource_id: Mapped[Optional[UUID]] = mapped_column(PGUUID(as_uuid=True))
    ip_address: Mapped[Optional[str]] = mapped_column(INET)
    user_agent: Mapped[Optional[str]] = mapped_column(Text)
    details: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    timestamp: Mapped[datetime] = mapped_column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)
    result: Mapped[AuditResult] = mapped_column(
        SAEnum(AuditResult, name="audit_result"), nullable=False, default=AuditResult.SUCCESS
    )
    # Hash chain — computed by DB trigger, set to placeholder before INSERT
    previous_log_hash: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    current_log_hash: Mapped[str] = mapped_column(String(64), nullable=False, default="")


class AccessControl(Base):
    __tablename__ = "access_control"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    document_id: Mapped[Optional[UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"))
    case_id: Mapped[Optional[UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"))
    role_id: Mapped[Optional[UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("roles.id", ondelete="CASCADE"))
    user_id: Mapped[Optional[UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    permission_type: Mapped[PermissionType] = mapped_column(
        SAEnum(PermissionType, name="permission_type_enum"), nullable=False
    )
    granted_by: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    granted_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)
    expires_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMPTZ)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Relationships
    document: Mapped[Optional["Document"]] = relationship("Document", back_populates="access_controls")
    case: Mapped[Optional["Case"]] = relationship("Case", back_populates="access_controls")
    role: Mapped[Optional["Role"]] = relationship("Role", back_populates="access_controls")


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    notification_type: Mapped[str] = mapped_column(String(50), nullable=False, default="INFO")
    related_case_id: Mapped[Optional[UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("cases.id"))
    related_document_id: Mapped[Optional[UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("documents.id"))
    read_status: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)


class AssetRegistry(Base):
    __tablename__ = "asset_registry"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    asset_tag: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    category: Mapped[AssetCategory] = mapped_column(SAEnum(AssetCategory, name="asset_category"), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[AssetStatus] = mapped_column(
        SAEnum(AssetStatus, name="asset_status"), nullable=False, default=AssetStatus.AVAILABLE
    )
    assigned_to: Mapped[Optional[UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"))
    linked_case_id: Mapped[Optional[UUID]] = mapped_column(PGUUID(as_uuid=True), ForeignKey("cases.id"))
    serial_number: Mapped[Optional[str]] = mapped_column(String(100))
    purchase_date: Mapped[Optional[datetime]] = mapped_column(Date)
    last_maintenance_date: Mapped[Optional[datetime]] = mapped_column(Date)
    next_maintenance_date: Mapped[Optional[datetime]] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    family_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(TIMESTAMPTZ)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="refresh_tokens")


class DocumentWorkflowHistory(Base):
    __tablename__ = "document_workflow_history"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    document_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("documents.id", ondelete="RESTRICT"), nullable=False)
    from_status: Mapped[Optional[str]] = mapped_column(String(50))
    to_status: Mapped[str] = mapped_column(String(50), nullable=False)
    transitioned_by: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    comments: Mapped[Optional[str]] = mapped_column(Text)
    workflow_name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(TIMESTAMPTZ, nullable=False, default=datetime.utcnow)
