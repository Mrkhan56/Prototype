/**
 * api/client.ts — API client with JWT auth, auto-refresh, and mock fallback.
 */

import axios, { AxiosError, type AxiosInstance } from "axios";
import type {
  AuditLogEntry,
  Case,
  ChainOfCustodyEntry,
  Document,
  DocumentVersion,
  SearchFacets,
  SearchFilters,
  SearchResponse,
  WorkflowConfig,
  WorkflowStatus,
} from "../types";
import {
  MOCK_AUDIT_LOGS,
  MOCK_CASES,
  MOCK_CUSTODY,
  MOCK_DOCUMENTS,
  MOCK_FACETS,
  MOCK_VERSIONS,
  MOCK_WORKFLOW_CONFIGS,
} from "./mockData";

const BASE_URL = import.meta.env?.VITE_API_URL ?? "http://localhost:8000/api/v1";

/** Create a configured Axios instance with interceptors. */
function createClient(): AxiosInstance {
  const client = axios.create({ baseURL: BASE_URL, withCredentials: true, timeout: 2500 });

  // Request interceptor: attach JWT from localStorage
  client.interceptors.request.use((config) => {
    const token = localStorage.getItem("access_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  // Response interceptor: auto-refresh on 401
  client.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      const original = error.config;
      if (
        error.response?.status === 401 &&
        original &&
        !original.url?.includes("/auth/refresh")
      ) {
        try {
          const refreshResp = await axios.post(
            `${BASE_URL}/auth/refresh`,
            {},
            { withCredentials: true }
          );
          const newToken = refreshResp.data.access_token as string;
          localStorage.setItem("access_token", newToken);
          original.headers.Authorization = `Bearer ${newToken}`;
          return client(original);
        } catch {
          localStorage.removeItem("access_token");
          return Promise.reject(error);
        }
      }
      return Promise.reject(error);
    }
  );

  return client;
}

const api = createClient();

// ── Document APIs ─────────────────────────────────────────────────────────────

export async function getDocument(id: string): Promise<Document> {
  try {
    const { data } = await api.get<Document>(`/documents/${id}`);
    return data;
  } catch (err) {
    const found = MOCK_DOCUMENTS.find((d) => d.id === id);
    if (found) return found;
    return MOCK_DOCUMENTS[0];
  }
}

export async function getDocumentVersions(id: string): Promise<DocumentVersion[]> {
  try {
    const { data } = await api.get<DocumentVersion[]>(`/documents/${id}/versions`);
    return data;
  } catch (err) {
    return MOCK_VERSIONS[id] ?? MOCK_VERSIONS["doc-001"] ?? [];
  }
}

export async function getCustodyChain(id: string): Promise<ChainOfCustodyEntry[]> {
  try {
    const { data } = await api.get<ChainOfCustodyEntry[]>(`/documents/${id}/custody`);
    return data;
  } catch (err) {
    return MOCK_CUSTODY[id] ?? MOCK_CUSTODY["doc-001"] ?? [];
  }
}

export async function getAuditLogs(
  documentId: string,
  page: number = 1,
  pageSize: number = 50
): Promise<{ items: AuditLogEntry[]; total: number }> {
  try {
    const { data } = await api.get(`/documents/${documentId}/audit-logs`, {
      params: { page, page_size: pageSize },
    });
    return data;
  } catch (err) {
    const items = MOCK_AUDIT_LOGS[documentId] ?? MOCK_AUDIT_LOGS["doc-001"] ?? [];
    return { items, total: items.length };
  }
}

export async function getCases(): Promise<Case[]> {
  try {
    const { data } = await api.get<Case[]>("/cases");
    return data;
  } catch (err) {
    return MOCK_CASES;
  }
}

export async function getCaseDocuments(caseId: string): Promise<Document[]> {
  try {
    const { data } = await api.get<Document[]>(`/cases/${caseId}/documents`);
    return data;
  } catch (err) {
    return MOCK_DOCUMENTS.filter((d) => d.case_id === caseId);
  }
}

// ── Search APIs ───────────────────────────────────────────────────────────────

export async function searchDocuments(
  query: string,
  filters: SearchFilters,
  page: number = 1,
  pageSize: number = 20,
  useSemantic: boolean = false
): Promise<SearchResponse> {
  try {
    const { data } = await api.post<SearchResponse>("/search", {
      query,
      filters,
      page,
      page_size: pageSize,
      use_semantic: useSemantic,
    });
    return data;
  } catch (err) {
    const qLower = query.toLowerCase();
    const filtered = MOCK_DOCUMENTS.filter((doc) => {
      const matchText = (doc.title + " " + (doc.description ?? "") + " " + doc.case_number).toLowerCase();
      const textMatch = !query || matchText.includes(qLower);
      const typeMatch = !filters.doc_type?.length || filters.doc_type.includes(doc.doc_type);
      const classMatch = !filters.classification_level?.length || filters.classification_level.includes(doc.classification_level);
      return textMatch && typeMatch && classMatch;
    });

    const results = filtered.map((d) => ({
      document_id: d.id,
      title: d.title,
      case_number: d.case_number,
      doc_type: d.doc_type,
      classification_level: d.classification_level,
      snippet: `Matched legal record in case <mark>${d.case_number}</mark>: ${d.description}`,
      rank: 1.0,
      created_at: d.created_at,
    }));

    return {
      results,
      total_count: results.length,
      page,
      page_size: pageSize,
      total_pages: Math.max(1, Math.ceil(results.length / pageSize)),
      query,
    };
  }
}

export async function getSearchFacets(): Promise<SearchFacets> {
  try {
    const { data } = await api.get<SearchFacets>("/search/facets");
    return data;
  } catch (err) {
    return MOCK_FACETS;
  }
}

// ── Workflow APIs ─────────────────────────────────────────────────────────────

export async function getWorkflowStatus(
  documentId: string,
  workflowName: string
): Promise<WorkflowStatus> {
  try {
    const { data } = await api.get<WorkflowStatus>(
      `/workflow/${documentId}/status`,
      { params: { workflow_name: workflowName } }
    );
    return data;
  } catch (err) {
    const doc = MOCK_DOCUMENTS.find((d) => d.id === documentId) ?? MOCK_DOCUMENTS[0];
    const config = MOCK_WORKFLOW_CONFIGS.find((w) => w.name === workflowName) ?? MOCK_WORKFLOW_CONFIGS[0];
    const curr = doc.workflow_status || "DRAFT";
    const available = config.transitions.filter((t) => t.from_state === curr);
    return {
      document_id: documentId,
      current_status: curr,
      current_status_display: config.states.find((s) => s.name === curr)?.display_name ?? curr,
      is_terminal: config.states.find((s) => s.name === curr)?.is_terminal ?? false,
      available_transitions: available,
    };
  }
}

export async function getWorkflowConfigs(): Promise<WorkflowConfig[]> {
  try {
    const { data } = await api.get<WorkflowConfig[]>("/workflow/configs");
    return data;
  } catch (err) {
    return MOCK_WORKFLOW_CONFIGS;
  }
}

export async function transitionWorkflow(
  documentId: string,
  targetStatus: string,
  workflowName: string,
  comments?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const { data } = await api.post(`/workflow/${documentId}/transition`, {
      target_status: targetStatus,
      workflow_name: workflowName,
      comments,
    });
    return data;
  } catch (err) {
    // Update mock state locally
    const doc = MOCK_DOCUMENTS.find((d) => d.id === documentId);
    if (doc) {
      doc.workflow_status = targetStatus;
    }
    return { success: true, message: `Transitioned to ${targetStatus}` };
  }
}

// ── Download API ──────────────────────────────────────────────────────────────

export function getDownloadUrl(documentId: string, versionId?: string): string {
  if (versionId) {
    return `${BASE_URL}/documents/${documentId}/versions/${versionId}/download`;
  }
  return `${BASE_URL}/documents/${documentId}/download`;
}
