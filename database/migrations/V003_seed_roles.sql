-- ============================================================================
-- V003_seed_roles.sql
-- Seed Data: System Roles and Default Departments
--
-- Each role has a permissions_json object that the application reads to
-- determine:
--   - allowed_doc_types: which document types this role can access
--   - allowed_actions: what actions (VIEW, DOWNLOAD, etc.) are permitted
--   - max_classification: highest classification level the role can see
--   - can_manage_users: whether the role can create/edit user accounts
--   - can_manage_cases: whether the role can create/edit cases
--   - can_manage_access: whether the role can grant/revoke access
--   - can_view_audit_logs: whether raw audit logs are visible
--   - can_approve_workflows: whether the role can approve workflow steps
--   - is_time_boxed: whether access grants auto-expire (EXTERNAL_COUNSEL)
--   - default_access_duration_days: default expiry for time-boxed grants
-- ============================================================================

-- ============================================================================
-- DEPARTMENTS
-- ============================================================================
INSERT INTO departments (id, name, portal_type, description) VALUES
    ('d0000001-0000-0000-0000-000000000001', 'Police Headquarters', 'POLICE',
     'Central police command and investigation coordination'),
    ('d0000001-0000-0000-0000-000000000002', 'Cyber Crime Unit', 'POLICE',
     'Specialized cyber crime investigation division'),
    ('d0000001-0000-0000-0000-000000000003', 'District Prosecution Office', 'PROSECUTION',
     'Public prosecution and legal proceedings'),
    ('d0000001-0000-0000-0000-000000000004', 'Forensic Science Laboratory', 'FORENSIC',
     'Evidence analysis and forensic reporting'),
    ('d0000001-0000-0000-0000-000000000005', 'District Court', 'COURT',
     'Judicial proceedings and case management'),
    ('d0000001-0000-0000-0000-000000000006', 'System Administration', 'ADMIN',
     'IT and system administration')
ON CONFLICT (name) DO NOTHING;


-- ============================================================================
-- ROLES
-- ============================================================================

-- 1. SUPER_ADMIN — Full system access, manages users and configuration
INSERT INTO roles (id, name, description, is_system_role, permissions_json) VALUES
('r0000001-0000-0000-0000-000000000001', 'SUPER_ADMIN', 'Full system administrator with unrestricted access', TRUE, '{
    "allowed_doc_types": ["FIR", "CHARGE_SHEET", "WITNESS_STATEMENT", "FORENSIC_REPORT", "COURT_ORDER", "EVIDENCE_PHOTO", "LEGAL_BRIEF", "MEMO", "OTHER"],
    "allowed_actions": ["VIEW", "DOWNLOAD", "PRINT", "EDIT", "TRANSFER", "FULL"],
    "max_classification": "SECRET",
    "can_manage_users": true,
    "can_manage_cases": true,
    "can_manage_access": true,
    "can_view_audit_logs": true,
    "can_approve_workflows": true,
    "is_time_boxed": false,
    "default_access_duration_days": null,
    "redacted_fields": []
}'::jsonb);

-- 2. DEPT_ADMIN — Department-level administration
INSERT INTO roles (id, name, description, is_system_role, permissions_json) VALUES
('r0000001-0000-0000-0000-000000000002', 'DEPT_ADMIN', 'Department administrator — manages users and cases within their department', TRUE, '{
    "allowed_doc_types": ["FIR", "CHARGE_SHEET", "WITNESS_STATEMENT", "FORENSIC_REPORT", "COURT_ORDER", "EVIDENCE_PHOTO", "LEGAL_BRIEF", "MEMO", "OTHER"],
    "allowed_actions": ["VIEW", "DOWNLOAD", "PRINT", "EDIT", "TRANSFER"],
    "max_classification": "SECRET",
    "can_manage_users": true,
    "can_manage_cases": true,
    "can_manage_access": true,
    "can_view_audit_logs": true,
    "can_approve_workflows": true,
    "is_time_boxed": false,
    "default_access_duration_days": null,
    "redacted_fields": []
}'::jsonb);

-- 3. INVESTIGATING_OFFICER — Primary case investigator
INSERT INTO roles (id, name, description, is_system_role, permissions_json) VALUES
('r0000001-0000-0000-0000-000000000003', 'INVESTIGATING_OFFICER', 'Police investigating officer — manages FIRs, evidence, and case documents', TRUE, '{
    "allowed_doc_types": ["FIR", "CHARGE_SHEET", "WITNESS_STATEMENT", "EVIDENCE_PHOTO", "MEMO", "OTHER"],
    "allowed_actions": ["VIEW", "DOWNLOAD", "PRINT", "EDIT", "TRANSFER"],
    "max_classification": "CONFIDENTIAL",
    "can_manage_users": false,
    "can_manage_cases": true,
    "can_manage_access": false,
    "can_view_audit_logs": false,
    "can_approve_workflows": false,
    "is_time_boxed": false,
    "default_access_duration_days": null,
    "redacted_fields": ["informant_id"]
}'::jsonb);

-- 4. SUPERVISOR — Oversees investigations, approves charge sheets
INSERT INTO roles (id, name, description, is_system_role, permissions_json) VALUES
('r0000001-0000-0000-0000-000000000004', 'SUPERVISOR', 'Senior officer supervising investigations and approving documents', TRUE, '{
    "allowed_doc_types": ["FIR", "CHARGE_SHEET", "WITNESS_STATEMENT", "FORENSIC_REPORT", "COURT_ORDER", "EVIDENCE_PHOTO", "LEGAL_BRIEF", "MEMO", "OTHER"],
    "allowed_actions": ["VIEW", "DOWNLOAD", "PRINT", "EDIT", "TRANSFER"],
    "max_classification": "SECRET",
    "can_manage_users": false,
    "can_manage_cases": true,
    "can_manage_access": true,
    "can_view_audit_logs": true,
    "can_approve_workflows": true,
    "is_time_boxed": false,
    "default_access_duration_days": null,
    "redacted_fields": []
}'::jsonb);

-- 5. PROSECUTOR — Handles legal proceedings and court filings
INSERT INTO roles (id, name, description, is_system_role, permissions_json) VALUES
('r0000001-0000-0000-0000-000000000005', 'PROSECUTOR', 'Public prosecutor handling court filings and legal review', TRUE, '{
    "allowed_doc_types": ["FIR", "CHARGE_SHEET", "WITNESS_STATEMENT", "FORENSIC_REPORT", "COURT_ORDER", "LEGAL_BRIEF", "MEMO"],
    "allowed_actions": ["VIEW", "DOWNLOAD", "PRINT", "EDIT"],
    "max_classification": "CONFIDENTIAL",
    "can_manage_users": false,
    "can_manage_cases": false,
    "can_manage_access": false,
    "can_view_audit_logs": false,
    "can_approve_workflows": true,
    "is_time_boxed": false,
    "default_access_duration_days": null,
    "redacted_fields": ["informant_id"]
}'::jsonb);

-- 6. FORENSIC_ANALYST — Lab analysis and forensic reporting
INSERT INTO roles (id, name, description, is_system_role, permissions_json) VALUES
('r0000001-0000-0000-0000-000000000006', 'FORENSIC_ANALYST', 'Forensic lab analyst — creates and manages forensic reports', TRUE, '{
    "allowed_doc_types": ["FORENSIC_REPORT", "EVIDENCE_PHOTO", "MEMO"],
    "allowed_actions": ["VIEW", "DOWNLOAD", "PRINT", "EDIT"],
    "max_classification": "CONFIDENTIAL",
    "can_manage_users": false,
    "can_manage_cases": false,
    "can_manage_access": false,
    "can_view_audit_logs": false,
    "can_approve_workflows": true,
    "is_time_boxed": false,
    "default_access_duration_days": null,
    "redacted_fields": ["witness_name", "informant_id", "victim_details"]
}'::jsonb);

-- 7. COURT_CLERK — Court administration and filing
INSERT INTO roles (id, name, description, is_system_role, permissions_json) VALUES
('r0000001-0000-0000-0000-000000000007', 'COURT_CLERK', 'Court clerk managing case filings and court orders', TRUE, '{
    "allowed_doc_types": ["CHARGE_SHEET", "COURT_ORDER", "LEGAL_BRIEF", "FIR"],
    "allowed_actions": ["VIEW", "DOWNLOAD", "PRINT"],
    "max_classification": "RESTRICTED",
    "can_manage_users": false,
    "can_manage_cases": false,
    "can_manage_access": false,
    "can_view_audit_logs": false,
    "can_approve_workflows": false,
    "is_time_boxed": false,
    "default_access_duration_days": null,
    "redacted_fields": ["witness_name", "informant_id", "victim_details", "suspect_address"]
}'::jsonb);

-- 8. AUDITOR — Read-only access to all data including audit logs
INSERT INTO roles (id, name, description, is_system_role, permissions_json) VALUES
('r0000001-0000-0000-0000-000000000008', 'AUDITOR', 'Read-only auditor with access to all data and audit logs for compliance review', TRUE, '{
    "allowed_doc_types": ["FIR", "CHARGE_SHEET", "WITNESS_STATEMENT", "FORENSIC_REPORT", "COURT_ORDER", "EVIDENCE_PHOTO", "LEGAL_BRIEF", "MEMO", "OTHER"],
    "allowed_actions": ["VIEW"],
    "max_classification": "SECRET",
    "can_manage_users": false,
    "can_manage_cases": false,
    "can_manage_access": false,
    "can_view_audit_logs": true,
    "can_approve_workflows": false,
    "is_time_boxed": false,
    "default_access_duration_days": null,
    "redacted_fields": []
}'::jsonb);

-- 9. EXTERNAL_COUNSEL — Time-boxed access for outside legal counsel
INSERT INTO roles (id, name, description, is_system_role, permissions_json) VALUES
('r0000001-0000-0000-0000-000000000009', 'EXTERNAL_COUNSEL', 'External legal counsel with time-limited, scoped access', TRUE, '{
    "allowed_doc_types": ["CHARGE_SHEET", "COURT_ORDER", "LEGAL_BRIEF"],
    "allowed_actions": ["VIEW", "DOWNLOAD"],
    "max_classification": "RESTRICTED",
    "can_manage_users": false,
    "can_manage_cases": false,
    "can_manage_access": false,
    "can_view_audit_logs": false,
    "can_approve_workflows": false,
    "is_time_boxed": true,
    "default_access_duration_days": 30,
    "redacted_fields": ["witness_name", "informant_id", "victim_details", "suspect_address", "officer_notes"]
}'::jsonb)
ON CONFLICT (name) DO NOTHING;
