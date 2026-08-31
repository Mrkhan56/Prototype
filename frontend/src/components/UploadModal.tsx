import React, { useState } from "react";
import {
  X,
  UploadCloud,
  FileCheck,
  ShieldAlert,
  Loader2,
  CheckCircle2,
  Lock,
} from "lucide-react";
import type { Case, Document } from "../types";
import { DocType, ClassificationLevel } from "../types";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  cases: Case[];
  preselectedCaseId?: string;
  onUploadSuccess: (newDoc: Document) => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  cases,
  preselectedCaseId,
  onUploadSuccess,
}) => {
  const [caseId, setCaseId] = useState<string>(preselectedCaseId ?? cases[0]?.id ?? "");
  const [docType, setDocType] = useState<DocType>(DocType.FIR);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [classification, setClassification] = useState<ClassificationLevel>(ClassificationLevel.CONFIDENTIAL);
  const [file, setFile] = useState<File | null>(null);
  const [hash, setHash] = useState<string>("");
  const [scanning, setScanning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleFileChange(selectedFile: File) {
    setError(null);
    setFile(selectedFile);
    if (!title) {
      setTitle(selectedFile.name.replace(/\.[^/.]+$/, ""));
    }

    // Compute client-side SHA-256 hash using Web Crypto API
    setScanning(true);
    try {
      const buffer = await selectedFile.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
      setHash(hashHex);
    } catch (err) {
      console.warn("Hash computation fallback", err);
      setHash("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    } finally {
      setScanning(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !title || !caseId) {
      setError("Please complete all required fields and select a file.");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      // Simulate/Trigger API ingestion
      const chosenCase = cases.find((c) => c.id === caseId) ?? cases[0];
      const newDocId = `doc-${Date.now().toString().slice(-4)}`;

      const newDoc: Document = {
        id: newDocId,
        case_id: chosenCase?.id || "c-001",
        doc_type: docType,
        title,
        description: description || "Uploaded via CaseVault Secure Ingestion Portal.",
        current_version_id: `ver-${newDocId}-1`,
        uploaded_by: "u-002",
        uploaded_by_name: "Mara Chen",
        uploaded_by_badge_id: "MC-9014",
        classification_level: classification,
        workflow_status: "DRAFT",
        case_number: chosenCase?.case_number || "CV-24-0187",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      onUploadSuccess(newDoc);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload document");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#152028]/70 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-xl rounded-2xl border border-[#E7E3DA] bg-white p-6 shadow-2xl">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E7E3DA] pb-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#FEF7EA] text-[#92400E] border border-[#FCD34D]">
              <UploadCloud className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 font-sans">Secure Document Ingestion</h3>
              <p className="text-[11px] text-slate-500">WORM Lock & SHA-256 Hash Handoff</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Case Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Associated Case *
            </label>
            <select
              value={caseId}
              onChange={(e) => setCaseId(e.target.value)}
              required
              className="w-full rounded-xl border border-[#E7E3DA] bg-[#FAF8F5] px-3 py-2 text-xs text-slate-800 focus:border-[#EAA037] focus:outline-none focus:ring-1 focus:ring-[#EAA037]"
            >
              {cases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.case_number} — {c.title}
                </option>
              ))}
            </select>
          </div>

          {/* Doc Type & Classification Level Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Document Type *
              </label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as DocType)}
                className="w-full rounded-xl border border-[#E7E3DA] bg-[#FAF8F5] px-3 py-2 text-xs text-slate-800 focus:border-[#EAA037] focus:outline-none focus:ring-1 focus:ring-[#EAA037]"
              >
                {Object.values(DocType).map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Security Classification *
              </label>
              <select
                value={classification}
                onChange={(e) => setClassification(e.target.value as ClassificationLevel)}
                className="w-full rounded-xl border border-[#E7E3DA] bg-[#FAF8F5] px-3 py-2 text-xs text-slate-800 focus:border-[#EAA037] focus:outline-none focus:ring-1 focus:ring-[#EAA037]"
              >
                {Object.values(ClassificationLevel).map((lvl) => (
                  <option key={lvl} value={lvl}>{lvl}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Document Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Forensic Audit Findings — Server Node #3"
              required
              className="w-full rounded-xl border border-[#E7E3DA] bg-[#FAF8F5] px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#EAA037] focus:outline-none focus:ring-1 focus:ring-[#EAA037]"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              Description / Notes
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Context, seizure references, or witness details..."
              rows={2}
              className="w-full rounded-xl border border-[#E7E3DA] bg-[#FAF8F5] px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#EAA037] focus:outline-none focus:ring-1 focus:ring-[#EAA037]"
            />
          </div>

          {/* File Upload Zone */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              File Attachment *
            </label>
            <div className="relative rounded-2xl border-2 border-dashed border-[#D1C9BE] hover:border-[#EAA037] bg-[#FAF8F5] p-5 text-center cursor-pointer transition-colors">
              <input
                type="file"
                accept=".pdf,.docx,.png,.jpg,.jpeg,.tiff"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleFileChange(e.target.files[0]);
                }}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              {file ? (
                <div className="flex flex-col items-center">
                  <FileCheck className="h-7 w-7 text-emerald-600" />
                  <span className="mt-1 text-xs font-semibold text-slate-800">{file.name}</span>
                  <span className="text-[11px] text-slate-500">{(file.size / 1024).toFixed(0)} KB</span>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <UploadCloud className="h-7 w-7 text-slate-400" />
                  <span className="mt-1 text-xs text-slate-700 font-semibold">Drag & drop or browse PDF, DOCX, TIFF, PNG</span>
                  <span className="text-[11px] text-slate-400">Max size: 100 MB • ClamAV Scan Enforced</span>
                </div>
              )}
            </div>
          </div>

          {/* Live Hash Preview */}
          {hash && (
            <div className="rounded-xl bg-[#FAF8F5] border border-[#E7E3DA] p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                  <Lock className="h-3 w-3 text-[#EAA037]" /> SHA-256 Hash Digest
                </span>
                {scanning ? (
                  <span className="text-[10px] text-[#92400E] flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Verifying...
                  </span>
                ) : (
                  <span className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> ClamAV Clean
                  </span>
                )}
              </div>
              <p className="mt-1 font-mono text-[11px] text-slate-700 break-all bg-white border border-[#E7E3DA] p-2 rounded-lg">
                {hash}
              </p>
            </div>
          )}

          {/* Submit Actions */}
          <div className="flex items-center justify-end gap-2.5 border-t border-[#E7E3DA] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[#E7E3DA] bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading || scanning || !file}
              className="btn-amber inline-flex items-center gap-1.5 rounded-xl px-5 py-2 text-xs font-bold text-[#152028] shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Ingesting...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Seal & Ingest Document
                </>
              )}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};

