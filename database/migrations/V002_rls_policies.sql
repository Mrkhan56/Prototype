-- ============================================================================
-- V002_rls_policies.sql
-- Row-Level Security (RLS) Policies
--
-- Design:
--   - RLS is enabled AND forced on sensitive tables so even table owners
--     cannot bypass policies.
--   - The application sets session variables via SET LOCAL (transaction-scoped)
--     to identify the current user and their roles. This is safe with
--     connection poolers in transaction mode.
--   - Helper functions (SECURITY DEFINER) read these session variables and
--     return typed values for use in policy expressions.
--   - Access model:
--     a) SUPER_ADMIN bypasses all policies
--     b) Users see documents/cases where they have explicit access_control entry
--     c) Users with department-level clearance see their department's cases
--     d) Expired access grants are automatically excluded
-- ============================================================================

-- ============================================================================
-- HELPER FUNCTIONS
-- These run as SECURITY DEFINER so they can read session config regardless
-- of the calling role's privileges.
-- ============================================================================

-- Returns the current user's UUID from the session variable
CREATE OR REPLACE FUNCTION current_app_user_id()
RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_user_id', true), '')::UUID;
EXCEPTION
    WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION current_app_user_id() IS
    'Returns the authenticated user UUID from transaction-scoped session variable';

-- Returns the current user's role name from the session variable
CREATE OR REPLACE FUNCTION current_app_user_role()
RETURNS TEXT AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_user_role', true), '');
EXCEPTION
    WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION current_app_user_role() IS
    'Returns the authenticated user role name from transaction-scoped session variable';

-- Returns the current user's department UUID from the session variable
CREATE OR REPLACE FUNCTION current_app_user_department()
RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_user_department', true), '')::UUID;
EXCEPTION
    WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

COMMENT ON FUNCTION current_app_user_department() IS
    'Returns the authenticated user department UUID from transaction-scoped session variable';

-- Returns the current user's maximum allowed classification level
CREATE OR REPLACE FUNCTION current_app_max_classification()
RETURNS TEXT AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_max_classification', true), '');
EXCEPTION
    WHEN OTHERS THEN RETURN 'UNCLASSIFIED';
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Helper: Check if user has active (non-expired) access to a specific case
CREATE OR REPLACE FUNCTION user_has_case_access(p_case_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM access_control ac
        WHERE ac.case_id = p_case_id
          AND ac.is_active = TRUE
          AND (
              ac.user_id = current_app_user_id()
              OR ac.role_id = (
                  SELECT role_id FROM users WHERE id = current_app_user_id()
              )
          )
          AND (ac.expires_at IS NULL OR ac.expires_at > NOW())
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Helper: Check if user has active access to a specific document
CREATE OR REPLACE FUNCTION user_has_document_access(p_document_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM access_control ac
        WHERE ac.is_active = TRUE
          AND (ac.expires_at IS NULL OR ac.expires_at > NOW())
          AND (
              ac.user_id = current_app_user_id()
              OR ac.role_id = (
                  SELECT role_id FROM users WHERE id = current_app_user_id()
              )
          )
          AND (
              -- Direct document access
              ac.document_id = p_document_id
              OR
              -- Case-level access (covers all documents in the case)
              ac.case_id = (
                  SELECT case_id FROM documents WHERE id = p_document_id
              )
          )
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Helper: Classification level ordering for comparison
-- Returns numeric rank: higher = more classified
CREATE OR REPLACE FUNCTION classification_rank(level TEXT)
RETURNS INTEGER AS $$
BEGIN
    RETURN CASE level
        WHEN 'UNCLASSIFIED' THEN 0
        WHEN 'RESTRICTED'   THEN 1
        WHEN 'CONFIDENTIAL' THEN 2
        WHEN 'SECRET'       THEN 3
        ELSE 0
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- ============================================================================
-- ENABLE AND FORCE RLS ON SENSITIVE TABLES
-- FORCE ensures policies apply even to table owners, preventing accidental
-- bypasses during maintenance or migration operations.
-- ============================================================================
ALTER TABLE cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE cases FORCE ROW LEVEL SECURITY;

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;

ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions FORCE ROW LEVEL SECURITY;

ALTER TABLE chain_of_custody ENABLE ROW LEVEL SECURITY;
ALTER TABLE chain_of_custody FORCE ROW LEVEL SECURITY;

ALTER TABLE access_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_control FORCE ROW LEVEL SECURITY;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;


-- ============================================================================
-- POLICIES: cases
-- Users can see cases if:
--   1. They are SUPER_ADMIN or AUDITOR (full visibility for oversight), OR
--   2. They have explicit access_control entry for the case, OR
--   3. The case belongs to their department (department-level clearance)
-- ============================================================================

-- SELECT: Read access
CREATE POLICY cases_select_policy ON cases
    FOR SELECT
    USING (
        -- Super admins and auditors can see all cases
        current_app_user_role() IN ('SUPER_ADMIN', 'AUDITOR')
        OR
        -- Explicit case access grant (active, non-expired)
        user_has_case_access(id)
        OR
        -- Department-level clearance: user can see cases owned by their department
        department_id = current_app_user_department()
        OR
        -- Case creator always has access
        created_by = current_app_user_id()
    );

-- INSERT: Only certain roles can create cases
CREATE POLICY cases_insert_policy ON cases
    FOR INSERT
    WITH CHECK (
        current_app_user_role() IN (
            'SUPER_ADMIN', 'DEPT_ADMIN', 'INVESTIGATING_OFFICER', 'SUPERVISOR'
        )
    );

-- UPDATE: Case owner, supervisor, or admin
CREATE POLICY cases_update_policy ON cases
    FOR UPDATE
    USING (
        current_app_user_role() IN ('SUPER_ADMIN', 'DEPT_ADMIN')
        OR created_by = current_app_user_id()
        OR (
            current_app_user_role() = 'SUPERVISOR'
            AND department_id = current_app_user_department()
        )
    );

COMMENT ON POLICY cases_select_policy ON cases IS
    'Users see cases via explicit access grant, department membership, or admin/auditor role';


-- ============================================================================
-- POLICIES: documents
-- Users can access documents if:
--   1. They are SUPER_ADMIN or AUDITOR, OR
--   2. They have explicit access to the document OR its parent case, OR
--   3. Their classification clearance is >= the document's classification level
--      AND they have case access
-- ============================================================================

-- SELECT: Read access with classification check
CREATE POLICY documents_select_policy ON documents
    FOR SELECT
    USING (
        -- Admin and auditor bypass
        current_app_user_role() IN ('SUPER_ADMIN', 'AUDITOR')
        OR
        (
            -- Must have case or document access
            (
                user_has_document_access(id)
                OR uploaded_by = current_app_user_id()
            )
            AND
            -- AND classification level must not exceed clearance
            classification_rank(classification_level::text) <=
                classification_rank(current_app_max_classification())
        )
    );

-- INSERT: Users with case access and appropriate role
CREATE POLICY documents_insert_policy ON documents
    FOR INSERT
    WITH CHECK (
        current_app_user_role() IN ('SUPER_ADMIN', 'DEPT_ADMIN')
        OR
        (
            current_app_user_role() IN (
                'INVESTIGATING_OFFICER', 'SUPERVISOR', 'PROSECUTOR',
                'FORENSIC_ANALYST', 'COURT_CLERK'
            )
            AND user_has_case_access(case_id)
        )
    );

-- UPDATE: Document owner, case supervisor, or admin
CREATE POLICY documents_update_policy ON documents
    FOR UPDATE
    USING (
        current_app_user_role() IN ('SUPER_ADMIN', 'DEPT_ADMIN')
        OR uploaded_by = current_app_user_id()
        OR (
            current_app_user_role() = 'SUPERVISOR'
            AND user_has_case_access(case_id)
        )
    );

COMMENT ON POLICY documents_select_policy ON documents IS
    'Enforces both access control AND classification clearance checks';


-- ============================================================================
-- POLICIES: document_versions
-- Inherits access from the parent document — if you can see the document,
-- you can see its versions.
-- ============================================================================

CREATE POLICY docver_select_policy ON document_versions
    FOR SELECT
    USING (
        current_app_user_role() IN ('SUPER_ADMIN', 'AUDITOR')
        OR user_has_document_access(document_id)
        OR uploaded_by = current_app_user_id()
    );

-- INSERT: Must have access to the parent document's case
CREATE POLICY docver_insert_policy ON document_versions
    FOR INSERT
    WITH CHECK (
        current_app_user_role() IN ('SUPER_ADMIN', 'DEPT_ADMIN')
        OR EXISTS (
            SELECT 1 FROM documents d
            WHERE d.id = document_id
              AND (
                  d.uploaded_by = current_app_user_id()
                  OR user_has_case_access(d.case_id)
              )
        )
    );

-- UPDATE and DELETE are blocked by the immutability trigger,
-- but we add deny-all policies as defense-in-depth
CREATE POLICY docver_deny_update ON document_versions
    FOR UPDATE USING (FALSE);

CREATE POLICY docver_deny_delete ON document_versions
    FOR DELETE USING (FALSE);


-- ============================================================================
-- POLICIES: chain_of_custody
-- Viewable by anyone with document access. Only insertable by system/app.
-- ============================================================================

CREATE POLICY custody_select_policy ON chain_of_custody
    FOR SELECT
    USING (
        current_app_user_role() IN ('SUPER_ADMIN', 'AUDITOR', 'SUPERVISOR')
        OR user_has_document_access(document_id)
        OR performed_by = current_app_user_id()
    );

CREATE POLICY custody_insert_policy ON chain_of_custody
    FOR INSERT
    WITH CHECK (
        -- Any authenticated user can have custody actions recorded for them
        current_app_user_id() IS NOT NULL
    );

-- No updates or deletes on custody records
CREATE POLICY custody_deny_update ON chain_of_custody
    FOR UPDATE USING (FALSE);

CREATE POLICY custody_deny_delete ON chain_of_custody
    FOR DELETE USING (FALSE);


-- ============================================================================
-- POLICIES: access_control
-- Users can see their own access grants. Admins can see and manage all.
-- ============================================================================

CREATE POLICY ac_select_policy ON access_control
    FOR SELECT
    USING (
        current_app_user_role() IN ('SUPER_ADMIN', 'DEPT_ADMIN', 'AUDITOR')
        OR user_id = current_app_user_id()
    );

CREATE POLICY ac_insert_policy ON access_control
    FOR INSERT
    WITH CHECK (
        current_app_user_role() IN ('SUPER_ADMIN', 'DEPT_ADMIN', 'SUPERVISOR')
    );

CREATE POLICY ac_update_policy ON access_control
    FOR UPDATE
    USING (
        current_app_user_role() IN ('SUPER_ADMIN', 'DEPT_ADMIN')
    );

CREATE POLICY ac_delete_policy ON access_control
    FOR DELETE
    USING (
        current_app_user_role() IN ('SUPER_ADMIN', 'DEPT_ADMIN')
    );


-- ============================================================================
-- POLICIES: notifications
-- Users can only see their own notifications.
-- ============================================================================

CREATE POLICY notif_select_policy ON notifications
    FOR SELECT
    USING (
        user_id = current_app_user_id()
        OR current_app_user_role() = 'SUPER_ADMIN'
    );

CREATE POLICY notif_insert_policy ON notifications
    FOR INSERT
    WITH CHECK (
        -- System can insert notifications for any user
        current_app_user_id() IS NOT NULL
    );

CREATE POLICY notif_update_policy ON notifications
    FOR UPDATE
    USING (
        -- Users can mark their own notifications as read
        user_id = current_app_user_id()
    );


-- ============================================================================
-- APPLICATION SESSION SETUP EXAMPLE
-- The application MUST call this at the beginning of each DB transaction
-- to set the user context for RLS policy evaluation.
--
-- Usage (Python/SQLAlchemy):
--   await session.execute(text("""
--       SELECT set_config('app.current_user_id', :uid, true),
--              set_config('app.current_user_role', :role, true),
--              set_config('app.current_user_department', :dept, true),
--              set_config('app.current_max_classification', :classification, true)
--   """), {
--       "uid": str(user.id),
--       "role": user_role.name,
--       "dept": str(user.department_id),
--       "classification": role_permissions.get("max_classification", "UNCLASSIFIED")
--   })
--
-- The `true` parameter makes these LOCAL to the current transaction,
-- ensuring they are automatically cleared when the transaction ends.
-- This is critical for connection pooling safety.
-- ============================================================================
