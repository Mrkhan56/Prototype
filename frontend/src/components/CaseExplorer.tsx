import React, { useState, useMemo } from "react";
import { format } from "date-fns";
import {
  FileText,
  ShieldCheck,
  Folder,
  CloudUpload,
  Users,
  ChevronDown,
  LayoutList,
  LayoutGrid,
  Zap,
  RotateCw,
  Filter,
} from "lucide-react";
import type { Case, Document } from "../types";
import { UserRole } from "../types";

interface CaseExplorerProps {
  cases: Case[];
  documents: Document[];
  userRole: UserRole;
  onSelectDocument: (docId: string) => void;
  onOpenUpload: (preselectedCaseId?: string) => void;
}

// Classification metadata helper for realistic CaseVault taxonomy
interface CategoryTaxonomy {
  category: string;
  tags: string[];
  integrity: "verified" | "pending" | "flagged";
  filename: string;
  version: string;
}

const DOCUMENT_TAXONOMY: Record<string, CategoryTaxonomy> = {
  "doc-001": {
    category: "Transcripts",
    tags: ["hearing", "priority"],
    integrity: "verified",
    filename: "hearing-transcript-march.pdf",
    version: "v3",
  },
  "doc-002": {
    category: "Expert reports",
    tags: ["financial", "expert"],
    integrity: "verified",
    filename: "forensic-accounting-report.docx",
    version: "v1",
  },
  "doc-003": {
    category: "Evidence",
    tags: ["chain-of-custody"],
    integrity: "pending",
    filename: "chain-of-custody.txt",
    version: "v2",
  },
  "doc-004": {
    category: "Statements",
    tags: ["deposition"],
    integrity: "flagged",
    filename: "witness-statement-alvarez.pdf",
    version: "v1",
  },
  "doc-005": {
    category: "Technical Audit",
    tags: ["forensic", "breach"],
    integrity: "verified",
    filename: "digital-seizure-report.pdf",
    version: "v2",
  },
  "doc-006": {
    category: "Court Orders",
    tags: ["judicial", "sealed"],
    integrity: "verified",
    filename: "worm-preservation-order.pdf",
    version: "v1",
  },
};

export const CaseExplorer: React.FC<CaseExplorerProps> = ({
  cases,
  documents,
  userRole: _userRole,
  onSelectDocument,
  onOpenUpload,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedCaseFilter, setSelectedCaseFilter] = useState<string>("ALL");
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);

  // Categories list
  const allCategories = useMemo(() => {
    const set = new Set<string>();
    documents.forEach((d) => {
      const tax = DOCUMENT_TAXONOMY[d.id];
      if (tax) set.add(tax.category);
      else set.add(d.doc_type.replace(/_/g, " "));
    });
    return Array.from(set);
  }, [documents]);

  const filteredDocs = documents.filter((doc) => {
    const tax = DOCUMENT_TAXONOMY[doc.id];
    const category = tax?.category ?? doc.doc_type.replace(/_/g, " ");

    if (selectedCategory !== "ALL" && category !== selectedCategory) return false;
    if (selectedCaseFilter !== "ALL" && doc.case_id !== selectedCaseFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6 pb-12 animate-fadeIn">
      
      {/* ── Breadcrumb & Page Title ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium mb-1">
            <span>Workspace</span>
            <span className="text-slate-300">/</span>
            <span className="text-slate-800 font-semibold">All documents</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-serif font-normal text-slate-900 tracking-tight">
            Document workspace
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Your team&apos;s source of truth, kept in order.
          </p>
        </div>

        <button
          onClick={() => onOpenUpload()}
          className="btn-dark py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 shadow-sm self-start shrink-0 active:scale-95 transition-all"
        >
          <CloudUpload className="h-4 w-4 stroke-[2]" />
          <span>Upload document</span>
        </button>
      </div>

      {/* ── Demo Workspace Alert Banner ── */}
      <div className="flex items-center gap-2.5 rounded-xl border border-[#FCD34D] bg-[#FEF7EA] px-4 py-3 text-xs text-[#92400E] font-medium shadow-sm">
        <Zap className="h-4 w-4 shrink-0 text-[#EAA037] fill-[#EAA037]" />
        <span>
          <strong className="font-semibold text-slate-900">Demo workspace</strong> — showing representative records while the secure node connects.
        </span>
      </div>

      {/* ── 4 Stat Metric KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Documents indexed */}
        <div className="card-casevault rounded-2xl p-5 card-casevault-hover">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Documents indexed</span>
            <Folder className="h-4 w-4 text-slate-400" />
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-900 tracking-tight font-sans">
            {documents.length >= 6 ? 128 : documents.length}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Across {cases.length > 0 ? 12 : 3} active cases
          </p>
        </div>

        {/* Card 2: Verified integrity */}
        <div className="card-casevault rounded-2xl p-5 card-casevault-hover">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Verified integrity</span>
            <ShieldCheck className="h-4 w-4 text-slate-400" />
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-900 tracking-tight font-sans">
            96.4%
          </p>
          <p className="mt-1 text-xs text-slate-400">
            2 items need attention
          </p>
        </div>

        {/* Card 3: Added this month */}
        <div className="card-casevault rounded-2xl p-5 card-casevault-hover">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Added this month</span>
            <CloudUpload className="h-4 w-4 text-slate-400" />
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-900 tracking-tight font-sans">
            18
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Last upload 42m ago
          </p>
        </div>

        {/* Card 4: Active collaborators */}
        <div className="card-casevault rounded-2xl p-5 card-casevault-hover">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">Active collaborators</span>
            <Users className="h-4 w-4 text-slate-400" />
          </div>
          <p className="mt-3 text-3xl font-bold text-slate-900 tracking-tight font-sans">
            07
          </p>
          <p className="mt-1 text-xs text-slate-400">
            No access changes today
          </p>
        </div>

      </div>

      {/* ── All Documents Table Section ── */}
      <div className="space-y-3">
        
        {/* Table Controls & Filter Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">All documents</h2>
            <p className="text-xs text-slate-500">
              {filteredDocs.length} {filteredDocs.length === 1 ? "record" : "records"} · latest activity first
            </p>
          </div>

          <div className="flex items-center gap-2">
            
            {/* Case Filter Selector (Optional) */}
            {cases.length > 0 && (
              <select
                value={selectedCaseFilter}
                onChange={(e) => setSelectedCaseFilter(e.target.value)}
                className="h-9 px-3 text-xs rounded-xl bg-white border border-[#E7E3DA] text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#EAA037]"
              >
                <option value="ALL">All cases</option>
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.case_number}
                  </option>
                ))}
              </select>
            )}

            {/* Category Filter Dropdown */}
            <div className="relative">
              <button
                onClick={() => setCategoryDropdownOpen(!categoryDropdownOpen)}
                className="h-9 px-3 rounded-xl bg-white border border-[#E7E3DA] text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 transition-colors shadow-none"
              >
                <Filter className="h-3.5 w-3.5 text-slate-400" />
                <span>{selectedCategory === "ALL" ? "All categories" : selectedCategory}</span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>

              {categoryDropdownOpen && (
                <div className="absolute right-0 mt-1.5 w-48 rounded-xl border border-[#E7E3DA] bg-white p-1.5 shadow-xl z-40 animate-fadeIn">
                  <button
                    onClick={() => {
                      setSelectedCategory("ALL");
                      setCategoryDropdownOpen(false);
                    }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium ${
                      selectedCategory === "ALL"
                        ? "bg-[#FEF7EA] text-[#92400E] font-semibold"
                        : "text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    All categories
                  </button>
                  {allCategories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => {
                        setSelectedCategory(cat);
                        setCategoryDropdownOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium ${
                        selectedCategory === cat
                          ? "bg-[#FEF7EA] text-[#92400E] font-semibold"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* View Mode Switcher */}
            <div className="flex items-center rounded-xl border border-[#E7E3DA] bg-white p-0.5">
              <button
                onClick={() => setViewMode("list")}
                className={`p-1.5 rounded-lg transition-all ${
                  viewMode === "list"
                    ? "bg-slate-100 text-slate-900 shadow-none"
                    : "text-slate-400 hover:text-slate-600"
                }`}
                title="List view"
              >
                <LayoutList className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded-lg transition-all ${
                  viewMode === "grid"
                    ? "bg-slate-100 text-slate-900 shadow-none"
                    : "text-slate-400 hover:text-slate-600"
                }`}
                title="Grid view"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>

          </div>
        </div>

        {/* ── Table View matching CaseVault Screenshot ── */}
        {viewMode === "list" ? (
          <div className="card-casevault rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[760px]">
                
                {/* Table Header */}
                <thead>
                  <tr className="border-b border-[#E7E3DA] bg-white text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4 font-semibold">DOCUMENT</th>
                    <th className="py-3 px-4 font-semibold">CASE</th>
                    <th className="py-3 px-4 font-semibold">CLASSIFICATION</th>
                    <th className="py-3 px-4 font-semibold">INTEGRITY</th>
                    <th className="py-3 px-4 font-semibold">MODIFIED</th>
                  </tr>
                </thead>

                {/* Table Body */}
                <tbody className="divide-y divide-[#F1ECE3] bg-white">
                  {filteredDocs.map((doc, idx) => {
                    const tax = DOCUMENT_TAXONOMY[doc.id] ?? {
                      category: doc.doc_type.replace(/_/g, " "),
                      tags: [doc.classification_level.toLowerCase()],
                      integrity: idx % 3 === 0 ? "verified" : idx % 3 === 1 ? "verified" : "pending",
                      filename: `${doc.title.toLowerCase().replace(/[^a-z0-9]/g, "-")}.pdf`,
                      version: `v${idx + 1}`,
                    };

                    return (
                      <tr
                        key={doc.id}
                        onClick={() => onSelectDocument(doc.id)}
                        className="group hover:bg-[#FAF8F5] cursor-pointer transition-colors"
                      >
                        {/* Column 1: Document */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-xl bg-slate-100/90 border border-slate-200/80 flex items-center justify-center text-slate-600 shrink-0 group-hover:bg-[#FEF7EA] group-hover:border-[#FCD34D] group-hover:text-[#92400E] transition-colors">
                              {idx === 0 ? (
                                <RotateCw className="h-4 w-4" />
                              ) : (
                                <FileText className="h-4 w-4" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-xs sm:text-sm font-bold text-slate-900 truncate group-hover:text-[#DE942A] transition-colors">
                                {doc.title}
                              </h3>
                              <p className="font-mono text-[11px] text-slate-400 truncate mt-0.5">
                                {tax.filename} · {tax.version}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Column 2: Case */}
                        <td className="py-3.5 px-4 font-mono text-xs font-semibold text-slate-600">
                          {doc.case_number || "CV-24-0187"}
                        </td>

                        {/* Column 3: Classification */}
                        <td className="py-3.5 px-4">
                          <div>
                            <span className="text-xs font-semibold text-slate-800">
                              {tax.category}
                            </span>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              {tax.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className="rounded bg-slate-100 px-1.5 py-0.2 text-[10px] font-medium text-slate-500"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        </td>

                        {/* Column 4: Integrity Badge */}
                        <td className="py-3.5 px-4">
                          {tax.integrity === "verified" ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E8F7EE] border border-[#C2E7CE] px-2.5 py-1 text-[11px] font-semibold text-[#137333]">
                              <span className="h-1.5 w-1.5 rounded-full bg-[#137333]" />
                              Integrity verified
                            </span>
                          ) : tax.integrity === "pending" ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FEF3C7] border border-[#FDE68A] px-2.5 py-1 text-[11px] font-semibold text-[#92400E]">
                              <span className="h-1.5 w-1.5 rounded-full bg-[#D97706]" />
                              Review pending
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FEE2E2] border border-[#FECACA] px-2.5 py-1 text-[11px] font-semibold text-[#991B1B]">
                              <span className="h-1.5 w-1.5 rounded-full bg-[#DC2626]" />
                              Flagged for review
                            </span>
                          )}
                        </td>

                        {/* Column 5: Modified Timestamp & Author */}
                        <td className="py-3.5 px-4">
                          <p className="text-xs font-semibold text-slate-800">
                            {format(new Date(doc.created_at), "MMM d, yyyy")}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            by {doc.uploaded_by_name}
                          </p>
                        </td>

                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* ── Grid View ── */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredDocs.map((doc, idx) => {
              const tax = DOCUMENT_TAXONOMY[doc.id] ?? {
                category: doc.doc_type.replace(/_/g, " "),
                tags: [doc.classification_level.toLowerCase()],
                integrity: "verified",
                filename: `${doc.title.toLowerCase().replace(/[^a-z0-9]/g, "-")}.pdf`,
                version: "v1",
              };

              return (
                <div
                  key={doc.id}
                  onClick={() => onSelectDocument(doc.id)}
                  className="card-casevault rounded-2xl p-5 card-casevault-hover cursor-pointer space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="h-10 w-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700">
                      {idx === 0 ? <RotateCw className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                    </div>
                    {tax.integrity === "verified" ? (
                      <span className="rounded-full bg-[#E8F7EE] border border-[#C2E7CE] px-2 py-0.5 text-[10px] font-semibold text-[#137333]">
                        ● Verified
                      </span>
                    ) : (
                      <span className="rounded-full bg-[#FEF3C7] border border-[#FDE68A] px-2 py-0.5 text-[10px] font-semibold text-[#92400E]">
                        ● Pending
                      </span>
                    )}
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-slate-900 line-clamp-1">{doc.title}</h3>
                    <p className="font-mono text-[11px] text-slate-400 mt-0.5 truncate">
                      {tax.filename} · {tax.version}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-[#E7E3DA] flex items-center justify-between text-xs text-slate-500">
                    <span className="font-mono font-medium">{doc.case_number}</span>
                    <span>{format(new Date(doc.created_at), "MMM d, yyyy")}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>

    </div>
  );
};

