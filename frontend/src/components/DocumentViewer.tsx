/**
 * DocumentViewer.tsx — Main container for viewing a document's metadata,
 * chain of custody, version history, and audit logs.
 *
 * Tabbed navigation with conditional audit log tab (AUDITOR/SUPERVISOR only).
 * Uses @tanstack/react-query for data fetching with loading/error states.
 */

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, RefreshCw, FileText, Link2, History, ScrollText } from "lucide-react";
import {
  getDocument,
  getDocumentVersions,
  getCustodyChain,
  getAuditLogs,
  getDownloadUrl,
} from "../api/client";
import { UserRole } from "../types";
import { MetadataPanel } from "./MetadataPanel";
import { CustodyTimeline } from "./CustodyTimeline";
import { VersionHistory } from "./VersionHistory";
import { AuditLogTab } from "./AuditLogTab";
import { CustodyReportExport } from "./CustodyReportExport";

interface DocumentViewerProps {
  documentId: string;
  userRole: UserRole;
  userName: string;
}

type TabId = "metadata" | "custody" | "versions" | "audit";

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ElementType;
  roleRequired?: UserRole[];
}

const TABS: TabDef[] = [
  { id: "metadata", label: "Metadata", icon: FileText },
  { id: "custody",  label: "Chain of Custody", icon: Link2 },
  { id: "versions", label: "Version History", icon: History },
  {
    id: "audit",
    label: "Audit Log",
    icon: ScrollText,
    roleRequired: [UserRole.AUDITOR, UserRole.SUPERVISOR, UserRole.SUPER_ADMIN],
  },
];

// ── Skeleton loader ───────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="animate-pulse space-y-3 rounded-2xl border border-[#E7E3DA] bg-white p-6">
      <div className="h-5 w-2/3 rounded-lg bg-slate-200" />
      <div className="h-4 w-1/2 rounded-lg bg-slate-200" />
      <div className="grid grid-cols-3 gap-4 mt-4">
        <div className="h-4 rounded bg-slate-200" />
        <div className="h-4 rounded bg-slate-200" />
        <div className="h-4 rounded bg-slate-200" />
      </div>
    </div>
  );
}

// ── Error state ───────────────────────────────────────────────────────────────

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center" role="alert">
      <AlertCircle className="mx-auto h-10 w-10 text-red-400" aria-hidden="true" />
      <h3 className="mt-3 text-lg font-semibold text-red-800">Error Loading Document</h3>
      <p className="mt-1 text-sm text-red-600">{message}</p>
      <button
        onClick={onRetry}
        className="btn-amber mt-4 inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-[#152028]"
        aria-label="Retry loading document"
      >
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Retry
      </button>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  documentId,
  userRole,
  userName,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>("metadata");
  const [auditPage, setAuditPage] = useState(1);

  // Data queries
  const docQuery = useQuery({
    queryKey: ["document", documentId],
    queryFn: () => getDocument(documentId),
  });

  const versionsQuery = useQuery({
    queryKey: ["versions", documentId],
    queryFn: () => getDocumentVersions(documentId),
  });

  const custodyQuery = useQuery({
    queryKey: ["custody", documentId],
    queryFn: () => getCustodyChain(documentId),
  });

  const auditQuery = useQuery({
    queryKey: ["audit", documentId, auditPage],
    queryFn: () => getAuditLogs(documentId, auditPage),
    enabled: activeTab === "audit",
  });

  // Filter tabs by role
  const visibleTabs = TABS.filter((tab) => {
    if (!tab.roleRequired) return true;
    return tab.roleRequired.includes(userRole);
  });

  // Loading state
  if (docQuery.isLoading) {
    return (
      <div className="space-y-4" aria-live="polite" aria-busy="true">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  // Error state
  if (docQuery.isError) {
    return (
      <ErrorState
        message={docQuery.error instanceof Error ? docQuery.error.message : "Unknown error"}
        onRetry={() => docQuery.refetch()}
      />
    );
  }

  const doc = docQuery.data;
  if (!doc) return null;

  return (
    <div className="space-y-5" aria-label={`Document viewer: ${doc.title}`}>
      {/* Tab navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-[#E7E3DA] gap-3 pb-1">
        <nav className="flex -mb-px gap-1 overflow-x-auto" role="tablist" aria-label="Document sections">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                aria-controls={`panel-${tab.id}`}
                id={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs sm:text-sm font-semibold transition-all focus:outline-none ${
                  isActive
                    ? "border-[#EAA037] text-slate-950 font-bold"
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? "text-[#EAA037]" : "text-slate-400"}`} aria-hidden="true" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Export button (visible when on custody tab) */}
        {activeTab === "custody" && custodyQuery.data && (
          <CustodyReportExport
            document={doc}
            entries={custodyQuery.data}
            generatedBy={userName}
          />
        )}
      </div>

      {/* Tab panels */}
      <div role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
        {activeTab === "metadata" && <MetadataPanel document={doc} />}

        {activeTab === "custody" && (
          custodyQuery.isLoading ? (
            <SkeletonCard />
          ) : custodyQuery.isError ? (
            <ErrorState message="Failed to load custody chain" onRetry={() => custodyQuery.refetch()} />
          ) : (
            <CustodyTimeline entries={custodyQuery.data ?? []} />
          )
        )}

        {activeTab === "versions" && (
          versionsQuery.isLoading ? (
            <SkeletonCard />
          ) : versionsQuery.isError ? (
            <ErrorState message="Failed to load versions" onRetry={() => versionsQuery.refetch()} />
          ) : (
            <VersionHistory
              versions={versionsQuery.data ?? []}
              onDownload={(versionId) => {
                window.open(getDownloadUrl(documentId, versionId), "_blank");
              }}
            />
          )
        )}

        {activeTab === "audit" && (
          auditQuery.isLoading ? (
            <SkeletonCard />
          ) : auditQuery.isError ? (
            <ErrorState message="Failed to load audit logs" onRetry={() => auditQuery.refetch()} />
          ) : (
            <AuditLogTab
              entries={auditQuery.data?.items ?? []}
              userRole={userRole}
              page={auditPage}
              totalPages={Math.ceil((auditQuery.data?.total ?? 0) / 50) || 1}
              onPageChange={setAuditPage}
            />
          )
        )}
      </div>
    </div>
  );
};

