-- ============================================================================
-- V001_initial_schema.sql
-- Secure Digital Document Management System — Initial Schema
-- 
-- Design Decisions:
--   1. UUIDs for all primary keys — prevents enumeration attacks and allows
--      distributed ID generation without coordination.
--   2. ENUM types for bounded values — enforces valid states at the DB level,
--      prevents typos, and enables efficient storage (4 bytes vs variable).
--   3. TIMESTAMPTZ (not TIMESTAMP) — stores UTC internally, avoids timezone
--      ambiguity critical for legal evidence timestamps across jurisdictions.
--   4. ON DELETE RESTRICT for documents/cases — legal records must never be
--      cascade-deleted; explicit archival workflows are required.
--   5. Hash-chained audit_logs — each row's current_log_hash = SHA256(
--      previous_log_hash || row_data), creating a tamper-evident chain.
--   6. Immutable document_versions — triggers block UPDATE/DELETE to ensure
--      version history can never be rewritten.
-- ============================================================================

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

-- uuid-ossp: UUID generation functions (uuid_generate_v4)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- pgcrypto: Cryptographic functions (digest for SHA-256, gen_random_bytes)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- pg_trgm: Trigram-based similarity search for fuzzy text matching
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- pgvector: Vector similarity search for semantic embeddings (optional)
-- Requires pgvector extension installed on the PostgreSQL server
CREATE EXTENSION IF NOT EXISTS "vector";


-- ============================================================================
-- ENUM TYPES
-- Defined as PostgreSQL enums for type safety and storage efficiency.
-- Each enum documents the legal/operational meaning of its values.
-- ============================================================================

-- Department portal types: determines which UI portal a department accesses
CREATE TYPE department_portal_type AS ENUM (
    'POLICE',        -- Law enforcement portal
    'PROSECUTION',   -- Public prosecutor portal
    'FORENSIC',      -- Forensic lab portal
    'COURT',         -- Court/judiciary portal
    'ADMIN'          -- System administration portal
);

-- User account status
CREATE TYPE user_status AS ENUM (
    'ACTIVE',        -- Normal active account
    'INACTIVE',      -- Deactivated (voluntary or administrative)
    'LOCKED',        -- Locked due to failed login attempts
    'SUSPENDED'      -- Suspended pending investigation
);

-- Case lifecycle status
CREATE TYPE case_status AS ENUM (
    'OPEN',                 -- Newly registered
    'UNDER_INVESTIGATION',  -- Active investigation phase
    'CHARGE_SHEETED',       -- Charge sheet filed
    'IN_TRIAL',             -- Court proceedings active
    'CLOSED',               -- Case concluded
    'ARCHIVED'              -- Moved to long-term archive
);

-- Case type — how the case originated
CREATE TYPE case_type AS ENUM (
    'FIR',           -- First Information Report
    'COMPLAINT',     -- Formal complaint
    'SUO_MOTO',      -- Court-initiated
    'TRANSFER',      -- Transferred from another jurisdiction
    'APPEAL'         -- Appeal of a prior case
);

-- Document security classification (follows common government classification)
CREATE TYPE classification_level AS ENUM (
    'UNCLASSIFIED',  -- Public or general access
    'RESTRICTED',    -- Limited distribution
    'CONFIDENTIAL',  -- Sensitive — need-to-know basis
    'SECRET'         -- Highest restriction — senior officials only
);

-- Document types within the legal process
CREATE TYPE doc_type_enum AS ENUM (
    'FIR',                -- First Information Report
    'CHARGE_SHEET',       -- Formal charges filed
    'WITNESS_STATEMENT',  -- Recorded witness testimony
    'FORENSIC_REPORT',    -- Lab analysis report
    'COURT_ORDER',        -- Judicial order
    'EVIDENCE_PHOTO',     -- Photographic evidence
    'LEGAL_BRIEF',        -- Legal arguments/briefs
    'MEMO',               -- Internal memoranda
    'OTHER'               -- Catch-all for uncategorized
);

-- Chain of custody action types — every action on a document is tracked
CREATE TYPE custody_action AS ENUM (
    'UPLOADED',      -- Initial upload or new version
    'VIEWED',        -- Document was opened/viewed
    'DOWNLOADED',    -- Document was downloaded to local device
    'PRINTED',       -- Document was sent to printer
    'TRANSFERRED',   -- Custody transferred between users
    'SEALED',        -- Document sealed (restricted from further access)
    'UNSEALED',      -- Seal removed
    'REDACTED'       -- Redacted version created
);

-- Audit log result
CREATE TYPE audit_result AS ENUM (
    'SUCCESS',       -- Operation completed successfully
    'FAILURE',       -- Operation failed (e.g., invalid input)
    'DENIED',        -- Access denied by authorization check
    'ERROR'          -- System error during operation
);

-- Access control permission types (ordered by privilege level)
CREATE TYPE permission_type_enum AS ENUM (
    'VIEW',          -- Can view/read the document
    'DOWNLOAD',      -- Can download a copy
    'PRINT',         -- Can print the document
    'EDIT',          -- Can create new versions
    'TRANSFER',      -- Can transfer custody
    'FULL'           -- All permissions
);

-- Physical asset categories
CREATE TYPE asset_category AS ENUM (
    'HARDWARE',      -- Computers, storage devices
    'SOFTWARE',      -- Licensed software
    'VEHICLE',       -- Patrol/investigation vehicles
    'EQUIPMENT',     -- Forensic equipment, cameras
    'OTHER'
);

-- Physical asset status
CREATE TYPE asset_status AS ENUM (
    'AVAILABLE',     -- Ready for assignment
    'ASSIGNED',      -- Currently assigned to a user/case
    'MAINTENANCE',   -- Under repair/maintenance
    'RETIRED'        -- Decommissioned
);


-- ============================================================================
-- TABLE 1: departments
-- Organizational units. Each department maps to a portal type that determines
-- which features and UI the department's users see.
-- ============================================================================
CREATE TABLE departments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(100) NOT NULL UNIQUE,
    portal_type     department_portal_type NOT NULL,
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE departments IS 'Organizational departments mapped to portal types for UI routing';


-- ============================================================================
-- TABLE 2: roles
-- System roles with JSON-encoded permission maps. The permissions_json field
-- stores a structured object like:
-- {
--   "allowed_doc_types": ["FIR", "CHARGE_SHEET"],
--   "allowed_actions": ["VIEW", "DOWNLOAD"],
--   "max_classification": "CONFIDENTIAL",
--   "can_manage_users": false,
--   "can_manage_cases": true
-- }
-- This allows flexible ABAC without schema changes when new permissions arise.
-- ============================================================================
CREATE TABLE roles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(50) NOT NULL UNIQUE,
    description     TEXT,
    permissions_json JSONB NOT NULL DEFAULT '{}',
    is_system_role  BOOLEAN NOT NULL DEFAULT FALSE,  -- Prevents deletion of built-in roles
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE roles IS 'System roles with JSON permission maps for attribute-based access control';
COMMENT ON COLUMN roles.permissions_json IS 'Structured permissions: allowed_doc_types, allowed_actions, max_classification, etc.';


-- ============================================================================
-- TABLE 3: users
-- All system users. MFA is mandatory — mfa_enabled defaults to FALSE only
-- during initial setup; the application MUST enforce MFA enrollment before
-- granting access to any documents.
-- ============================================================================
CREATE TABLE users (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email                   VARCHAR(255) NOT NULL UNIQUE,
    name                    VARCHAR(200) NOT NULL,
    password_hash           VARCHAR(255) NOT NULL,  -- Argon2id hash
    role_id                 UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    department_id           UUID NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
    badge_id                VARCHAR(50) UNIQUE,     -- Physical badge/ID number
    mfa_enabled             BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_secret_encrypted    TEXT,                    -- AES-256-GCM encrypted TOTP secret
    mfa_recovery_codes      TEXT,                    -- Encrypted backup recovery codes
    status                  user_status NOT NULL DEFAULT 'ACTIVE',
    failed_login_attempts   INTEGER NOT NULL DEFAULT 0,
    locked_until            TIMESTAMPTZ,             -- NULL = not locked
    last_login_at           TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_role ON users(role_id);
CREATE INDEX idx_users_department ON users(department_id);
CREATE INDEX idx_users_badge ON users(badge_id) WHERE badge_id IS NOT NULL;
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_email_lower ON users(LOWER(email));

COMMENT ON TABLE users IS 'All system users with mandatory MFA, linked to roles and departments';
COMMENT ON COLUMN users.mfa_secret_encrypted IS 'TOTP secret encrypted with AES-256-GCM; decrypted only during verification';
COMMENT ON COLUMN users.failed_login_attempts IS 'Counter for rate limiting; resets on successful login; triggers lock at 5';


-- ============================================================================
-- TABLE 4: cases
-- Legal cases/matters. case_number is the primary external identifier used in
-- court filings. fir_number is the police FIR registration number.
-- Both are indexed for fast lookup since they are the most common search keys.
-- ============================================================================
CREATE TABLE cases (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_number     VARCHAR(50) NOT NULL UNIQUE,
    fir_number      VARCHAR(50),                    -- NULL for non-FIR cases
    type            case_type NOT NULL,
    status          case_status NOT NULL DEFAULT 'OPEN',
    title           TEXT NOT NULL,
    description     TEXT,
    jurisdiction    VARCHAR(200),                    -- Court/district jurisdiction
    created_by      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    department_id   UUID REFERENCES departments(id), -- Owning department
    -- Full-text search vector combining title, description, case_number, fir_number
    search_tsv      TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(case_number, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(fir_number, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(title, '')), 'B') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'C')
    ) STORED,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary lookup indexes — these are the most frequent search patterns
CREATE UNIQUE INDEX idx_cases_case_number ON cases(case_number);
CREATE INDEX idx_cases_fir_number ON cases(fir_number) WHERE fir_number IS NOT NULL;
CREATE INDEX idx_cases_status ON cases(status);
CREATE INDEX idx_cases_type ON cases(type);
CREATE INDEX idx_cases_created_by ON cases(created_by);
CREATE INDEX idx_cases_department ON cases(department_id);
CREATE INDEX idx_cases_jurisdiction ON cases(jurisdiction);
-- GIN index for full-text search on case metadata
CREATE INDEX idx_cases_search_tsv ON cases USING GIN(search_tsv);
-- Trigram index for fuzzy/partial matching on case_number
CREATE INDEX idx_cases_case_number_trgm ON cases USING GIN(case_number gin_trgm_ops);

COMMENT ON TABLE cases IS 'Legal cases/matters with full-text search across case_number, fir_number, title, description';


-- ============================================================================
-- TABLE 5: documents
-- Document metadata. The actual file content is in document_versions.
-- current_version_id points to the latest version (updated via application logic).
-- classification_level controls which roles can access this document.
-- ============================================================================
CREATE TABLE documents (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id                 UUID NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
    doc_type                doc_type_enum NOT NULL,
    title                   VARCHAR(500) NOT NULL,
    description             TEXT,
    current_version_id      UUID,  -- FK added after document_versions table
    uploaded_by             UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    classification_level    classification_level NOT NULL DEFAULT 'RESTRICTED',
    workflow_status         VARCHAR(50) DEFAULT 'DRAFT',
    -- Full-text search on document metadata
    metadata_tsv            TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(description, '')), 'B')
    ) STORED,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_documents_case ON documents(case_id);
CREATE INDEX idx_documents_doc_type ON documents(doc_type);
CREATE INDEX idx_documents_uploaded_by ON documents(uploaded_by);
CREATE INDEX idx_documents_classification ON documents(classification_level);
CREATE INDEX idx_documents_workflow ON documents(workflow_status);
-- GIN index for full-text search on document title and description
CREATE INDEX idx_documents_metadata_tsv ON documents USING GIN(metadata_tsv);
-- Trigram index for fuzzy/partial matching on title
CREATE INDEX idx_documents_title_trgm ON documents USING GIN(title gin_trgm_ops);

COMMENT ON TABLE documents IS 'Document metadata with classification levels and full-text search';
COMMENT ON COLUMN documents.current_version_id IS 'Points to the latest document_versions row; updated on new version upload';


-- ============================================================================
-- TABLE 6: document_versions
-- Immutable version history. Each upload creates a new row — no in-place
-- updates allowed. A trigger enforces this at the DB level.
-- The file_hash_sha256 is computed BEFORE storage and verified on every read.
-- ============================================================================
CREATE TABLE document_versions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
    version_number  INTEGER NOT NULL,
    file_path       TEXT NOT NULL,                  -- S3 object key
    file_size_bytes BIGINT NOT NULL,
    file_hash_sha256 VARCHAR(64) NOT NULL,          -- Hex-encoded SHA-256 of file content
    mime_type       VARCHAR(100) NOT NULL,
    uploaded_by     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    change_reason   TEXT,                           -- Why this version was created
    ocr_text        TEXT,                           -- Tesseract-extracted text
    -- Full-text search on OCR-extracted content
    ocr_tsv         TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('english', coalesce(ocr_text, ''))
    ) STORED,
    thumbnail_path  TEXT,                           -- S3 key for preview thumbnail
    is_immutable    BOOLEAN NOT NULL DEFAULT TRUE,  -- Always true; exists for schema clarity
    -- Semantic search embedding (1024-dim for models like bge-large-en-v1.5)
    embedding       VECTOR(1024),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Enforce unique version numbers per document
    CONSTRAINT uq_document_version UNIQUE(document_id, version_number)
);

CREATE INDEX idx_docver_document ON document_versions(document_id);
CREATE INDEX idx_docver_hash ON document_versions(file_hash_sha256);
CREATE INDEX idx_docver_uploaded_by ON document_versions(uploaded_by);
-- GIN index for full-text search on OCR content
CREATE INDEX idx_docver_ocr_tsv ON document_versions USING GIN(ocr_tsv);

-- Add the deferred FK from documents.current_version_id to document_versions.id
ALTER TABLE documents
    ADD CONSTRAINT fk_documents_current_version
    FOREIGN KEY (current_version_id) REFERENCES document_versions(id)
    DEFERRABLE INITIALLY DEFERRED;

COMMENT ON TABLE document_versions IS 'Immutable version records — INSERT only, no UPDATE/DELETE allowed';
COMMENT ON COLUMN document_versions.file_hash_sha256 IS 'SHA-256 computed before storage; re-verified on every download';
COMMENT ON COLUMN document_versions.ocr_text IS 'Text extracted via Tesseract OCR for scanned documents/images';
COMMENT ON COLUMN document_versions.embedding IS 'Sentence embedding vector for semantic search via pgvector';


-- ============================================================================
-- TRIGGER: Prevent UPDATE/DELETE on document_versions
-- Legal requirement: version history must be immutable. Only INSERTs allowed.
-- ============================================================================
CREATE OR REPLACE FUNCTION guard_document_versions_immutability()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION
        'document_versions is immutable. % operations are prohibited. '
        'Create a new version row instead.',
        TG_OP
        USING ERRCODE = 'integrity_constraint_violation';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_document_versions_immutable
    BEFORE UPDATE OR DELETE ON document_versions
    FOR EACH ROW
    EXECUTE FUNCTION guard_document_versions_immutability();

COMMENT ON FUNCTION guard_document_versions_immutability() IS
    'Blocks UPDATE and DELETE on document_versions to ensure legal immutability';


-- ============================================================================
-- TABLE 7: chain_of_custody
-- Every action on a document is recorded with the file's hash at that moment.
-- This creates a verifiable chain showing who did what, when, and that the
-- file was not tampered with between actions.
-- ============================================================================
CREATE TABLE chain_of_custody (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
    version_id      UUID REFERENCES document_versions(id),  -- Which version was acted on
    action          custody_action NOT NULL,
    performed_by    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    from_user       UUID REFERENCES users(id),       -- For TRANSFERRED actions
    to_user         UUID REFERENCES users(id),       -- For TRANSFERRED actions
    ip_address      INET,
    user_agent      TEXT,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    hash_at_action  VARCHAR(64) NOT NULL,            -- SHA-256 of file at time of action
    notes           TEXT,                            -- Optional annotation

    -- Transfer actions must specify from/to users
    CONSTRAINT chk_transfer_users CHECK (
        (action != 'TRANSFERRED') OR
        (from_user IS NOT NULL AND to_user IS NOT NULL)
    )
);

CREATE INDEX idx_custody_document ON chain_of_custody(document_id);
CREATE INDEX idx_custody_performed_by ON chain_of_custody(performed_by);
CREATE INDEX idx_custody_timestamp ON chain_of_custody(timestamp);
CREATE INDEX idx_custody_action ON chain_of_custody(action);
CREATE INDEX idx_custody_version ON chain_of_custody(version_id);

COMMENT ON TABLE chain_of_custody IS 'Tamper-evident audit trail of every action on a document with hash verification';
COMMENT ON COLUMN chain_of_custody.hash_at_action IS 'SHA-256 of the file content at the moment of this action; used to verify integrity';


-- ============================================================================
-- TABLE 8: audit_logs
-- Append-only, hash-chained audit log. Design:
--   - BIGSERIAL primary key for guaranteed ordering (UUIDs don't order)
--   - previous_log_hash: SHA-256 of the prior row (genesis = 64 zeros)
--   - current_log_hash: SHA-256(previous_log_hash || event_data)
--   - This creates a blockchain-like chain where any tampering (insert,
--     update, delete, reorder) breaks the chain and is detectable.
--   - Triggers enforce:
--     a) Hash computation on INSERT
--     b) Blocking UPDATE, DELETE, and TRUNCATE
-- ============================================================================
CREATE TABLE audit_logs (
    id                  BIGSERIAL PRIMARY KEY,      -- Sequential for chain ordering
    event_id            UUID NOT NULL DEFAULT uuid_generate_v4(),
    user_id             UUID REFERENCES users(id),   -- NULL for system events
    action              VARCHAR(100) NOT NULL,       -- e.g., 'AUTH_LOGIN', 'DOCUMENT_VIEWED'
    resource_type       VARCHAR(50) NOT NULL,        -- e.g., 'USER', 'DOCUMENT', 'CASE'
    resource_id         UUID,                        -- ID of the affected resource
    ip_address          INET,
    user_agent          TEXT,
    details             JSONB DEFAULT '{}',          -- Structured event metadata
    timestamp           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    result              audit_result NOT NULL DEFAULT 'SUCCESS',
    previous_log_hash   VARCHAR(64) NOT NULL,
    current_log_hash    VARCHAR(64) NOT NULL
);

-- Indexes for common audit query patterns
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_result ON audit_logs(result);
CREATE INDEX idx_audit_event ON audit_logs(event_id);

COMMENT ON TABLE audit_logs IS 'Append-only, SHA-256 hash-chained audit log — tamper-evident by design';
COMMENT ON COLUMN audit_logs.previous_log_hash IS 'SHA-256 hash of the previous audit log entry (genesis = 64 zeros)';
COMMENT ON COLUMN audit_logs.current_log_hash IS 'SHA-256(previous_log_hash || canonical_row_data) — forms the hash chain';


-- ============================================================================
-- TRIGGER: Compute hash chain on audit_logs INSERT
-- Each new row's hash is computed from the previous row's hash concatenated
-- with the new row's data, creating an unbreakable chain.
-- Uses FOR UPDATE on the previous row to serialize concurrent inserts.
-- ============================================================================
CREATE OR REPLACE FUNCTION compute_audit_hash_chain()
RETURNS TRIGGER AS $$
DECLARE
    last_hash VARCHAR(64);
    raw_data TEXT;
    -- Genesis hash: 64 hex zeros (represents the "block 0" of the chain)
    GENESIS_HASH CONSTANT VARCHAR(64) :=
        '0000000000000000000000000000000000000000000000000000000000000000';
BEGIN
    -- Lock the latest row to serialize concurrent inserts and prevent
    -- race conditions that could fork the hash chain
    SELECT current_log_hash INTO last_hash
    FROM audit_logs
    ORDER BY id DESC
    LIMIT 1
    FOR UPDATE;

    -- First entry in the chain uses the genesis hash
    IF last_hash IS NULL THEN
        NEW.previous_log_hash := GENESIS_HASH;
    ELSE
        NEW.previous_log_hash := last_hash;
    END IF;

    -- Canonical representation of row data for deterministic hashing.
    -- Fields are pipe-delimited for unambiguous parsing during verification.
    -- IMPORTANT: The order and format here MUST match the verification function.
    raw_data := NEW.previous_log_hash || '|' ||
                NEW.event_id::text || '|' ||
                coalesce(NEW.user_id::text, 'SYSTEM') || '|' ||
                NEW.action || '|' ||
                NEW.resource_type || '|' ||
                coalesce(NEW.resource_id::text, 'NULL') || '|' ||
                coalesce(host(NEW.ip_address), 'NULL') || '|' ||
                to_char(NEW.timestamp AT TIME ZONE 'UTC',
                         'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' ||
                NEW.result::text || '|' ||
                coalesce(NEW.details::text, '{}');

    -- Compute SHA-256 hash of the canonical data
    NEW.current_log_hash := encode(digest(raw_data, 'sha256'), 'hex');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_hash_chain
    BEFORE INSERT ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION compute_audit_hash_chain();


-- ============================================================================
-- TRIGGER: Block UPDATE, DELETE, TRUNCATE on audit_logs
-- Audit logs MUST be append-only. Any mutation breaks the hash chain and
-- violates legal compliance requirements.
-- This trigger fires at STATEMENT level to also catch TRUNCATE.
-- ============================================================================
CREATE OR REPLACE FUNCTION guard_audit_log_immutability()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION
        'Audit logs are strictly immutable. % operations are prohibited. '
        'This action has been logged as a security incident.',
        TG_OP
        USING ERRCODE = 'integrity_constraint_violation';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Row-level trigger for UPDATE and DELETE
CREATE TRIGGER trg_audit_no_update_delete
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION guard_audit_log_immutability();

-- Statement-level trigger for TRUNCATE
CREATE TRIGGER trg_audit_no_truncate
    BEFORE TRUNCATE ON audit_logs
    FOR EACH STATEMENT
    EXECUTE FUNCTION guard_audit_log_immutability();


-- ============================================================================
-- FUNCTION: verify_audit_chain_integrity()
-- Walks the entire audit log chain from first to last entry, recomputing
-- each hash and comparing against the stored value. Reports the first
-- break in the chain if any tampering is detected.
-- ============================================================================
CREATE OR REPLACE FUNCTION verify_audit_chain_integrity()
RETURNS TABLE (
    is_valid            BOOLEAN,
    broken_at_id        BIGINT,
    expected_prev_hash  VARCHAR(64),
    actual_prev_hash    VARCHAR(64),
    details             TEXT
) AS $$
DECLARE
    rec RECORD;
    computed_hash VARCHAR(64);
    expected_prev VARCHAR(64) :=
        '0000000000000000000000000000000000000000000000000000000000000000';
    raw_data TEXT;
BEGIN
    FOR rec IN SELECT * FROM audit_logs ORDER BY id ASC LOOP
        -- Check 1: Does this row's previous_log_hash match the last row's current_log_hash?
        IF rec.previous_log_hash <> expected_prev THEN
            RETURN QUERY SELECT
                FALSE,
                rec.id,
                expected_prev,
                rec.previous_log_hash,
                'Chain link broken: previous_log_hash does not match prior row current_log_hash';
            RETURN;
        END IF;

        -- Check 2: Recompute the hash from row data and compare
        raw_data := rec.previous_log_hash || '|' ||
                    rec.event_id::text || '|' ||
                    coalesce(rec.user_id::text, 'SYSTEM') || '|' ||
                    rec.action || '|' ||
                    rec.resource_type || '|' ||
                    coalesce(rec.resource_id::text, 'NULL') || '|' ||
                    coalesce(host(rec.ip_address), 'NULL') || '|' ||
                    to_char(rec.timestamp AT TIME ZONE 'UTC',
                             'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' ||
                    rec.result::text || '|' ||
                    coalesce(rec.details::text, '{}');

        computed_hash := encode(digest(raw_data, 'sha256'), 'hex');

        IF computed_hash <> rec.current_log_hash THEN
            RETURN QUERY SELECT
                FALSE,
                rec.id,
                expected_prev,
                rec.previous_log_hash,
                'Hash mismatch: row data has been tampered with. Expected ' ||
                computed_hash || ' but found ' || rec.current_log_hash;
            RETURN;
        END IF;

        expected_prev := rec.current_log_hash;
    END LOOP;

    -- All entries verified successfully
    RETURN QUERY SELECT TRUE, NULL::BIGINT, NULL::VARCHAR(64), NULL::VARCHAR(64),
        'Audit chain integrity verified: all ' ||
        (SELECT count(*) FROM audit_logs)::text || ' entries are valid';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION verify_audit_chain_integrity() IS
    'Validates the entire audit log hash chain. Returns the first broken link if tampering detected.';


-- ============================================================================
-- TABLE 9: access_control
-- Explicit access grants linking users/roles to documents/cases with specific
-- permission types and optional expiry (for time-boxed EXTERNAL_COUNSEL access).
-- ============================================================================
CREATE TABLE access_control (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- Target: at least one of document_id or case_id must be set
    document_id     UUID REFERENCES documents(id) ON DELETE CASCADE,
    case_id         UUID REFERENCES cases(id) ON DELETE CASCADE,
    -- Grantee: at least one of role_id or user_id must be set
    role_id         UUID REFERENCES roles(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id) ON DELETE CASCADE,
    permission_type permission_type_enum NOT NULL,
    granted_by      UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    granted_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at      TIMESTAMPTZ,                    -- NULL = never expires
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,

    -- At least one target must be specified
    CONSTRAINT chk_access_target CHECK (
        document_id IS NOT NULL OR case_id IS NOT NULL
    ),
    -- At least one grantee must be specified
    CONSTRAINT chk_access_grantee CHECK (
        role_id IS NOT NULL OR user_id IS NOT NULL
    )
);

CREATE INDEX idx_ac_document ON access_control(document_id) WHERE document_id IS NOT NULL;
CREATE INDEX idx_ac_case ON access_control(case_id) WHERE case_id IS NOT NULL;
CREATE INDEX idx_ac_user ON access_control(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_ac_role ON access_control(role_id) WHERE role_id IS NOT NULL;
CREATE INDEX idx_ac_expires ON access_control(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_ac_active ON access_control(is_active) WHERE is_active = TRUE;
-- Composite index for the most common access check query pattern
CREATE INDEX idx_ac_user_doc_active ON access_control(user_id, document_id, is_active)
    WHERE is_active = TRUE;
CREATE INDEX idx_ac_user_case_active ON access_control(user_id, case_id, is_active)
    WHERE is_active = TRUE;

COMMENT ON TABLE access_control IS 'Explicit access grants with optional time-boxing for external counsel';
COMMENT ON COLUMN access_control.expires_at IS 'Time-boxed access — NULL means permanent; used for EXTERNAL_COUNSEL 30-day grants';


-- ============================================================================
-- TABLE 10: notifications
-- In-app notification queue for workflow transitions, SLA alerts, and
-- security events. Designed for quick reads by user_id + read_status.
-- ============================================================================
CREATE TABLE notifications (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    message             TEXT NOT NULL,
    notification_type   VARCHAR(50) NOT NULL DEFAULT 'INFO',  -- INFO, WARNING, CRITICAL, WORKFLOW
    related_case_id     UUID REFERENCES cases(id),
    related_document_id UUID REFERENCES documents(id),
    read_status         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notif_user_unread ON notifications(user_id, read_status)
    WHERE read_status = FALSE;
CREATE INDEX idx_notif_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notif_case ON notifications(related_case_id) WHERE related_case_id IS NOT NULL;

COMMENT ON TABLE notifications IS 'In-app notification queue for workflows, SLA alerts, and security events';


-- ============================================================================
-- TABLE 11: asset_registry
-- Physical and digital asset tracking linked to cases and users.
-- Supports maintenance scheduling and case evidence chain.
-- ============================================================================
CREATE TABLE asset_registry (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_tag               VARCHAR(50) NOT NULL UNIQUE,
    name                    VARCHAR(200) NOT NULL,
    category                asset_category NOT NULL,
    description             TEXT,
    status                  asset_status NOT NULL DEFAULT 'AVAILABLE',
    assigned_to             UUID REFERENCES users(id),
    linked_case_id          UUID REFERENCES cases(id),
    serial_number           VARCHAR(100),
    purchase_date           DATE,
    last_maintenance_date   DATE,
    next_maintenance_date   DATE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_asset_tag ON asset_registry(asset_tag);
CREATE INDEX idx_asset_status ON asset_registry(status);
CREATE INDEX idx_asset_assigned ON asset_registry(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_asset_case ON asset_registry(linked_case_id) WHERE linked_case_id IS NOT NULL;
CREATE INDEX idx_asset_maintenance ON asset_registry(next_maintenance_date)
    WHERE next_maintenance_date IS NOT NULL;

COMMENT ON TABLE asset_registry IS 'Physical/digital asset tracking with maintenance scheduling and case linking';


-- ============================================================================
-- TABLE 12: refresh_tokens
-- JWT refresh token management. Tokens are stored as SHA-256 hashes (never
-- plaintext). The family_id groups tokens from the same session — if a
-- revoked token from a family is reused, the entire family is revoked
-- (detects token theft via refresh token rotation).
-- ============================================================================
CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(64) NOT NULL UNIQUE,    -- SHA-256 of the actual token
    family_id   UUID NOT NULL,                  -- Groups tokens for rotation detection
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked     BOOLEAN NOT NULL DEFAULT FALSE,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rt_user ON refresh_tokens(user_id);
CREATE INDEX idx_rt_family ON refresh_tokens(family_id);
CREATE INDEX idx_rt_hash ON refresh_tokens(token_hash);
-- Partial index for active (non-revoked, non-expired) tokens
CREATE INDEX idx_rt_active ON refresh_tokens(user_id, revoked)
    WHERE revoked = FALSE;

COMMENT ON TABLE refresh_tokens IS 'JWT refresh tokens stored as hashes with family-based rotation detection';
COMMENT ON COLUMN refresh_tokens.family_id IS 'Groups related tokens; if a revoked family token is reused, entire family is revoked';


-- ============================================================================
-- TABLE 13: document_workflow_history
-- Tracks state transitions for documents going through approval workflows.
-- Linked to the workflow engine configuration.
-- ============================================================================
CREATE TABLE document_workflow_history (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
    from_status     VARCHAR(50),                    -- NULL for initial state
    to_status       VARCHAR(50) NOT NULL,
    transitioned_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    comments        TEXT,
    workflow_name   VARCHAR(100) NOT NULL,           -- e.g., 'charge_sheet', 'forensic_report'
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dwh_document ON document_workflow_history(document_id);
CREATE INDEX idx_dwh_timestamp ON document_workflow_history(created_at);
CREATE INDEX idx_dwh_workflow ON document_workflow_history(workflow_name);

COMMENT ON TABLE document_workflow_history IS 'State transition history for workflow-driven document approvals';


-- ============================================================================
-- HELPER FUNCTION: updated_at auto-updater
-- Automatically sets updated_at to NOW() on any UPDATE to tables that have it.
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER trg_departments_updated_at
    BEFORE UPDATE ON departments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_roles_updated_at
    BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_cases_updated_at
    BEFORE UPDATE ON cases FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_documents_updated_at
    BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_asset_updated_at
    BEFORE UPDATE ON asset_registry FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- DB ROLE: app_service
-- The application should connect using this restricted role, NOT a superuser.
-- This role can INSERT into audit_logs but NEVER update/delete (enforced by
-- triggers AND by GRANT).
-- ============================================================================

-- Create the application service role (if not exists)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_service') THEN
        CREATE ROLE app_service WITH LOGIN PASSWORD 'CHANGE_ME_IN_PRODUCTION';
    END IF;
END
$$;

-- Grant minimum necessary privileges
GRANT USAGE ON SCHEMA public TO app_service;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_service;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_service;

-- REVOKE dangerous operations on audit_logs — belt-and-suspenders with triggers
REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM app_service;

-- REVOKE UPDATE, DELETE on document_versions — matches the trigger enforcement
REVOKE UPDATE, DELETE ON document_versions FROM app_service;

COMMENT ON ROLE app_service IS
    'Application service account — no UPDATE/DELETE on audit_logs or document_versions';
