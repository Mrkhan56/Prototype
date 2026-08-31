import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Shield } from "lucide-react";
import { UserRole, type Document } from "./types";
import { getCases, getWorkflowConfigs } from "./api/client";
import { MOCK_DOCUMENTS, MOCK_USERS } from "./api/mockData";

import { Sidebar, type SidebarView } from "./components/Sidebar";
import { Navbar } from "./components/Navbar";
import { CaseExplorer } from "./components/CaseExplorer";
import { DocumentViewer } from "./components/DocumentViewer";
import { SearchPage } from "./components/SearchPage";
import { WorkflowDashboard } from "./components/WorkflowDashboard";
import { AccessControlMatrix } from "./components/AccessControlMatrix";
import { UploadModal } from "./components/UploadModal";
import { AuditLogTab } from "./components/AuditLogTab";
import { getAuditLogs } from "./api/client";

export const App: React.FC = () => {
  const queryClient = useQueryClient();
  const [activeView, setActiveView] = useState<SidebarView>("cases");
  const [currentRole, setCurrentRole] = useState<UserRole>(UserRole.INVESTIGATING_OFFICER);
  const [selectedDocId, setSelectedDocId] = useState<string>("doc-001");
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [preselectedCaseId, setPreselectedCaseId] = useState<string | undefined>(undefined);
  const [localDocs, setLocalDocs] = useState<Document[]>(MOCK_DOCUMENTS);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [auditPage, setAuditPage] = useState(1);
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");

  // Queries
  const casesQuery = useQuery({
    queryKey: ["cases"],
    queryFn: getCases,
  });

  const workflowsQuery = useQuery({
    queryKey: ["workflowConfigs"],
    queryFn: getWorkflowConfigs,
  });

  const auditLogsQuery = useQuery({
    queryKey: ["auditLogsAll", auditPage],
    queryFn: () => getAuditLogs("all", auditPage),
  });

  const currentUser = MOCK_USERS[currentRole] ?? MOCK_USERS[UserRole.INVESTIGATING_OFFICER];

  function handleSelectDocument(docId: string) {
    setSelectedDocId(docId);
    setActiveView("document");
  }

  function handleOpenUpload(caseId?: string) {
    setPreselectedCaseId(caseId);
    setUploadModalOpen(true);
  }

  function handleUploadSuccess(newDoc: Document) {
    setLocalDocs((prev) => [newDoc, ...prev]);
    setSelectedDocId(newDoc.id);
    setActiveView("document");
    queryClient.invalidateQueries({ queryKey: ["cases"] });
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-slate-900 flex flex-row">
      
      {/* ── Left Sidebar Navigation (Desktop) ── */}
      <div className="hidden md:block">
        <Sidebar
          activeView={activeView}
          setActiveView={(view) => {
            setActiveView(view);
          }}
          currentRole={currentRole}
          setCurrentRole={setCurrentRole}
          onOpenUpload={() => handleOpenUpload()}
          documentCount={128}
          auditCount={4}
          onOpenSettings={() => setActiveView("rbac")}
        />
      </div>

      {/* ── Mobile Sidebar Drawer ── */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative z-50">
            <Sidebar
              activeView={activeView}
              setActiveView={(view) => {
                setActiveView(view);
                setMobileMenuOpen(false);
              }}
              currentRole={currentRole}
              setCurrentRole={setCurrentRole}
              onOpenUpload={() => {
                setMobileMenuOpen(false);
                handleOpenUpload();
              }}
              documentCount={128}
              auditCount={4}
              onOpenSettings={() => {
                setMobileMenuOpen(false);
                setActiveView("rbac");
              }}
            />
          </div>
        </div>
      )}

      {/* ── Main Viewport Area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Top Search & Actions Header */}
        <Navbar
          activeView={activeView}
          setActiveView={setActiveView}
          currentRole={currentRole}
          setCurrentRole={setCurrentRole}
          onOpenUpload={() => handleOpenUpload()}
          onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
          searchQuery={globalSearchQuery}
          onSearchChange={setGlobalSearchQuery}
          onSearchSubmit={() => setActiveView("search")}
        />

        {/* Dynamic Page Content */}
        <main className="flex-1 px-4 sm:px-8 py-6 max-w-7xl w-full mx-auto">
          
          {/* Document Workspace (CaseVault Default View) */}
          {activeView === "cases" && (
            <CaseExplorer
              cases={casesQuery.data ?? []}
              documents={localDocs}
              userRole={currentRole}
              onSelectDocument={handleSelectDocument}
              onOpenUpload={handleOpenUpload}
            />
          )}

          {/* Full-Text & Faceted Search */}
          {activeView === "search" && <SearchPage />}

          {/* Audit Center */}
          {activeView === "audit" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-serif text-slate-900">Audit & Integrity Center</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Immutable cryptographically chained audit trails & tamper detection
                  </p>
                </div>
              </div>
              <div className="card-casevault rounded-2xl p-4 shadow-sm overflow-hidden">
                <AuditLogTab
                  entries={auditLogsQuery.data?.items ?? []}
                  userRole={currentRole}
                  page={auditPage}
                  totalPages={Math.ceil((auditLogsQuery.data?.total ?? 10) / 50) || 1}
                  onPageChange={setAuditPage}
                />
              </div>
            </div>
          )}

          {/* Workflow Pipeline */}
          {activeView === "workflows" && (
            <WorkflowDashboard
              documents={localDocs}
              configs={workflowsQuery.data ?? []}
              userRole={currentRole}
              onRefreshDocuments={() => {
                queryClient.invalidateQueries({ queryKey: ["document", selectedDocId] });
              }}
            />
          )}

          {/* Security Clearance & RBAC Matrix */}
          {activeView === "rbac" && (
            <AccessControlMatrix
              currentRole={currentRole}
              onSelectRole={(role) => setCurrentRole(role)}
            />
          )}

          {/* Full Document Inspector */}
          {activeView === "document" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setActiveView("cases")}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-[#E7E3DA] px-3.5 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition-colors shadow-sm"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to Document Workspace
                </button>

                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>Inspecting as:</span>
                  <span className="font-semibold text-slate-800">{currentUser.name}</span>
                  <span className="font-mono text-[10px] text-slate-400">({currentRole})</span>
                </div>
              </div>

              <div className="card-casevault rounded-2xl p-6 shadow-sm">
                <DocumentViewer
                  documentId={selectedDocId}
                  userRole={currentRole}
                  userName={currentUser.name}
                />
              </div>
            </div>
          )}

        </main>

        {/* Footer */}
        <footer className="border-t border-[#E7E3DA] bg-white py-4 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto px-4 sm:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5 text-[#EAA037]" />
              <span className="font-medium text-slate-700">CaseVault Security Protocol</span>
            </div>
            <span className="font-mono text-[11px] text-slate-400">
              Compliant with ISO 27001 • Section 65B Indian Evidence Act • WORM Storage Policy
            </span>
          </div>
        </footer>

      </div>

      {/* ── Secure Ingestion Upload Modal ── */}
      <UploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        cases={casesQuery.data ?? []}
        preselectedCaseId={preselectedCaseId}
        onUploadSuccess={handleUploadSuccess}
      />

    </div>
  );
};

export default App;

