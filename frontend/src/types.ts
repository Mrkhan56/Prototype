/**
 * types.ts — TypeScript interfaces for all API types.
 *
 * Every type mirrors the backend Pydantic/SQLAlchemy models exactly,
 * ensuring end-to-end type safety across the API boundary.
 */

// ── Enums ─────────────────────────────────────────────────────────────────────

export enum UserRole {
  SUPER_ADMIN = "SUPER_ADMIN",
  DEPT_ADMIN = "DEPT_ADMIN",
  INVESTIGATING_OFFICER = "INVESTIGATING_OFFICER",
  SUPERVISOR = "SUPERVISOR",
  PROSECUTOR = "PROSECUTOR",
  FORENSIC_ANALYST = "FORENSIC_ANALYST",
  COURT_CLERK = "COURT_CLERK",
  AUDITOR = "AUDITOR",
  EXTERNAL_COUNSEL = "EXTERNAL_COUNSEL",
}

export enum ClassificationLevel {
  UNCLASSIFIED = "UNCLASSIFIED",
  RESTRICTED = "RESTRICTED",
  CONFIDENTIAL = "CONFIDENTIAL",
  SECRET = "SECRET",
}

export enum CustodyAction {
  UPLOADED = "UPLOADED",
  VIEWED = "VIEWED",
  DOWNLOADED = "DOWNLOADED",
  PRINTED = "PRINTED",
  TRANSFERRED = "TRANSFERRED",
  SEALED = "SEALED",
  UNSEALED = "UNSEALED",
  REDACTED = "REDACTED",
}

export enum AuditResult {
  SUCCESS = "SUCCESS",
  FAILURE = "FAILURE",
  DENIED = "DENIED",
  ERROR = "ERROR",
}

export enum CaseStatus {
  OPEN = "OPEN",
  UNDER_INVESTIGATION = "UNDER_INVESTIGATION",
  CHARGE_SHEETED = "CHARGE_SHEETED",
  IN_TRIAL = "IN_TRIAL",
  CLOSED = "CLOSED",
  ARCHIVED = "ARCHIVED",
}

export enum DocType {
  FIR = "FIR",
  CHARGE_SHEET = "CHARGE_SHEET",
  WITNESS_STATEMENT = "WITNESS_STATEMENT",
  FORENSIC_REPORT = "FORENSIC_REPORT",
  COURT_ORDER = "COURT_ORDER",
  EVIDENCE_PHOTO = "EVIDENCE_PHOTO",
  LEGAL_BRIEF = "LEGAL_BRIEF",
  MEMO = "MEMO",
  OTHER = "OTHER",
}

export enum PermissionType {
  VIEW = "VIEW",
  DOWNLOAD = "DOWNLOAD",
  PRINT = "PRINT",
  EDIT = "EDIT",
  TRANSFER = "TRANSFER",
  FULL = "FULL",
}

// ── Core Domain Types ─────────────────────────────────────────────────────────

export interface Department {
  id: string;
  name: string;
  portal_type: string;
}

export interface Role {
  id: string;
  name: UserRole;
  description: string;
  permissions_json: RolePermissions;
}

export interface RolePermissions {
  allowed_doc_types: string[];
  allowed_actions: string[];
  max_classification: string;
  can_manage_users: boolean;
  can_manage_cases: boolean;
  can_manage_access: boolean;
  can_view_audit_logs: boolean;
  can_approve_workflows: boolean;
  redacted_fields: string[];
  is_time_boxed: boolean;
  default_access_duration_days: number | null;
}

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  department_id: string;
  badge_id: string | null;
  mfa_enabled: boolean;
  status: string;
}

export interface Case {
  id: string;
  case_number: string;
  fir_number: string | null;
  type: string;
  status: CaseStatus;
  title: string;
  description: string | null;
  jurisdiction: string | null;
  created_by: string;
  created_at: string;
}

export interface Document {
  id: string;
  case_id: string;
  doc_type: DocType;
  title: string;
  description: string | null;
  current_version_id: string | null;
  uploaded_by: string;
  uploaded_by_name: string;
  uploaded_by_badge_id: string | null;
  classification_level: ClassificationLevel;
  workflow_status: string;
  case_number: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentVersion {
  id: string;
  document_id: string;
  version_number: number;
  file_path: string;
  file_size_bytes: number;
  file_hash_sha256: string;
  mime_type: string;
  uploaded_by: string;
  uploaded_by_name: string;
  change_reason: string | null;
  ocr_text: string | null;
  thumbnail_path: string | null;
  is_immutable: boolean;
  created_at: string;
}

export interface ChainOfCustodyEntry {
  id: string;
  document_id: string;
  version_id: string | null;
  action: CustodyAction;
  performed_by: string;
  performed_by_name: string;
  performed_by_role: UserRole;
  performed_by_badge_id: string | null;
  from_user: string | null;
  from_user_name: string | null;
  to_user: string | null;
  to_user_name: string | null;
  timestamp: string;
  hash_at_action: string;
  hash_verified: boolean | null; // null = verification pending
  notes: string | null;
}

export interface AuditLogEntry {
  id: number;
  event_id: string;
  user_id: string | null;
  user_name: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  details: Record<string, unknown>;
  timestamp: string;
  result: AuditResult;
  previous_log_hash: string;
  current_log_hash: string;
}

export interface AccessControlEntry {
  id: string;
  document_id: string | null;
  case_id: string | null;
  role_id: string | null;
  user_id: string | null;
  permission_type: PermissionType;
  granted_by: string;
  granted_at: string;
  expires_at: string | null;
  is_active: boolean;
}

export interface Notification {
  id: string;
  user_id: string;
  message: string;
  notification_type: string;
  related_case_id: string | null;
  related_document_id: string | null;
  read_status: boolean;
  created_at: string;
}

// ── Search Types ──────────────────────────────────────────────────────────────

export interface SearchFilters {
  case_type?: string[];
  doc_type?: string[];
  date_from?: string;
  date_to?: string;
  department_id?: string;
  case_status?: string[];
  classification_level?: string[];
}

export interface SearchResultItem {
  document_id: string;
  title: string;
  case_number: string;
  doc_type: string;
  classification_level: string;
  snippet: string;
  rank: number;
  created_at: string;
}

export interface SearchResponse {
  results: SearchResultItem[];
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
  query: string;
}

export interface SearchFacets {
  case_types: Record<string, number>;
  doc_types: Record<string, number>;
  case_statuses: Record<string, number>;
  classification_levels: Record<string, number>;
}

// ── Workflow Types ────────────────────────────────────────────────────────────

export interface WorkflowState {
  name: string;
  display_name: string;
  is_initial: boolean;
  is_terminal: boolean;
  sla_hours: number | null;
  escalation_role: string | null;
}

export interface WorkflowTransition {
  from_state: string;
  to_state: string;
  required_role: string;
  display_name: string;
  requires_comment: boolean;
  description?: string;
}

export interface WorkflowConfig {
  name: string;
  display_name: string;
  description: string;
  states: WorkflowState[];
  transitions: WorkflowTransition[];
}

export interface WorkflowStatus {
  document_id: string;
  current_status: string;
  current_status_display: string;
  is_terminal: boolean;
  available_transitions: WorkflowTransition[];
}

// ── API Utility Types ─────────────────────────────────────────────────────────

export interface ApiError {
  detail: string;
  status_code: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

/** Sentinel value — the backend replaces redacted fields with this string. */
export const REDACTED_PLACEHOLDER = "[REDACTED — insufficient clearance]";

/** Type guard: returns true if a value is the redaction placeholder. */
export function isRedacted(value: unknown): boolean {
  return value === REDACTED_PLACEHOLDER;
}
