import React from "react";
import { Lock, FileText, Calendar, User, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import type { Document } from "../types";
import { ClassificationLevel, isRedacted, REDACTED_PLACEHOLDER } from "../types";

interface MetadataPanelProps {
  document: Document;
}

const CLASSIFICATION_STYLES: Record<
  ClassificationLevel,
  { bg: string; text: string; border: string; label: string }
> = {
  [ClassificationLevel.UNCLASSIFIED]: {
    bg: "bg-[#E8F7EE]",
    text: "text-[#137333]",
    border: "border-[#C2E7CE]",
    label: "Unclassified",
  },
  [ClassificationLevel.RESTRICTED]: {
    bg: "bg-[#FEF3C7]",
    text: "text-[#92400E]",
    border: "border-[#FDE68A]",
    label: "Restricted",
  },
  [ClassificationLevel.CONFIDENTIAL]: {
    bg: "bg-[#FFEDD5]",
    text: "text-[#9A3412]",
    border: "border-[#FDBA74]",
    label: "Confidential",
  },
  [ClassificationLevel.SECRET]: {
    bg: "bg-[#FEE2E2]",
    text: "text-[#991B1B]",
    border: "border-[#FECACA]",
    label: "Secret",
  },
};

/** Renders a field value or redaction placeholder if the value is redacted. */
function FieldValue({ value, label }: { value: string | null | undefined; label: string }) {
  if (value === null || value === undefined) {
    return <span className="text-slate-400 italic">Not available</span>;
  }
  if (isRedacted(value)) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-0.5 text-xs text-amber-800 border border-amber-200"
        role="status"
        aria-label={`${label} is redacted due to insufficient clearance`}
      >
        <Lock className="h-3 w-3 text-amber-600" aria-hidden="true" />
        {REDACTED_PLACEHOLDER}
      </span>
    );
  }
  return <span className="text-slate-800 font-medium">{value}</span>;
}

export const MetadataPanel: React.FC<MetadataPanelProps> = ({ document: doc }) => {
  const classification = CLASSIFICATION_STYLES[doc.classification_level] ?? CLASSIFICATION_STYLES[ClassificationLevel.RESTRICTED];

  return (
    <div className="card-casevault rounded-2xl p-6 shadow-sm space-y-6" role="region" aria-label="Document metadata">
      {/* Header row: title + classification badge */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b border-[#E7E3DA] pb-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl sm:text-2xl font-serif text-slate-900 leading-tight truncate" title={doc.title}>
            {doc.title}
          </h2>
          <p className="mt-1 text-xs text-slate-500 font-mono">
            Case Reference: <span className="font-semibold text-slate-800">{doc.case_number}</span>
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider ${classification.bg} ${classification.text} ${classification.border}`}
          role="status"
          aria-label={`Classification level: ${classification.label}`}
        >
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          {classification.label}
        </span>
      </div>

      {/* Metadata grid */}
      <dl className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3 text-xs">
        <div className="bg-[#FAF8F5] p-3.5 rounded-xl border border-[#E7E3DA]">
          <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Document Type</dt>
          <dd className="mt-1">
            <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
              <FileText className="h-3.5 w-3.5 text-[#EAA037]" aria-hidden="true" />
              {doc.doc_type.replace(/_/g, " ")}
            </span>
          </dd>
        </div>

        <div className="bg-[#FAF8F5] p-3.5 rounded-xl border border-[#E7E3DA]">
          <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Workflow Status</dt>
          <dd className="mt-1">
            <span className="inline-block font-semibold text-slate-800">
              {doc.workflow_status?.replace(/_/g, " ") ?? "DRAFT"}
            </span>
          </dd>
        </div>

        <div className="bg-[#FAF8F5] p-3.5 rounded-xl border border-[#E7E3DA]">
          <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Created Timestamp</dt>
          <dd className="mt-1 flex items-center gap-1 text-slate-800 font-medium">
            <Calendar className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            {format(new Date(doc.created_at), "dd MMM yyyy, HH:mm")}
          </dd>
        </div>

        <div className="bg-[#FAF8F5] p-3.5 rounded-xl border border-[#E7E3DA]">
          <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Uploaded By</dt>
          <dd className="mt-1 flex items-center gap-1 text-slate-800">
            <User className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            <FieldValue value={doc.uploaded_by_name} label="Uploaded by" />
            {doc.uploaded_by_badge_id && !isRedacted(doc.uploaded_by_badge_id) && (
              <span className="text-slate-400 font-mono text-[10px]">({doc.uploaded_by_badge_id})</span>
            )}
          </dd>
        </div>

        <div className="bg-[#FAF8F5] p-3.5 rounded-xl border border-[#E7E3DA] sm:col-span-2">
          <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Description / Summary</dt>
          <dd className="mt-1 text-slate-700 leading-relaxed">
            <FieldValue value={doc.description} label="Description" />
          </dd>
        </div>
      </dl>
    </div>
  );
};

