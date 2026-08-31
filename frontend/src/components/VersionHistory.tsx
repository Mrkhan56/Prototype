import React, { useState, useMemo } from "react";
import ReactDiffViewer, { DiffMethod } from "react-diff-viewer-continued";
import { format } from "date-fns";
import { Copy, Download, GitCompare, Hash } from "lucide-react";
import type { DocumentVersion } from "../types";

interface VersionHistoryProps {
  versions: DocumentVersion[];
  onDownload?: (versionId: string) => void;
}

/** Copy text to clipboard with visual feedback. */
async function copyToClipboard(text: string, setCopied: (v: boolean) => void) {
  try {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  } catch {
    /* clipboard API fallback */
  }
}

function HashDisplay({ hash }: { hash: string }) {
  const [copied, setCopied] = useState(false);
  const truncated = `${hash.substring(0, 12)}…${hash.substring(hash.length - 8)}`;

  return (
    <button
      onClick={() => copyToClipboard(hash, setCopied)}
      className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700 hover:bg-slate-200 transition-colors border border-slate-200"
      title={`Full hash: ${hash}\nClick to copy`}
      aria-label={`Copy SHA-256 hash ${truncated}`}
    >
      <Hash className="h-3 w-3 text-[#EAA037]" aria-hidden="true" />
      {copied ? "Copied!" : truncated}
      <Copy className="h-2.5 w-2.5 text-slate-400" aria-hidden="true" />
    </button>
  );
}

export const VersionHistory: React.FC<VersionHistoryProps> = ({
  versions,
  onDownload,
}) => {
  const [compareLeft, setCompareLeft] = useState<string>("");
  const [compareRight, setCompareRight] = useState<string>("");
  const [showDiff, setShowDiff] = useState(false);

  const sorted = useMemo(
    () => [...versions].sort((a, b) => b.version_number - a.version_number),
    [versions]
  );

  const leftVersion = useMemo(
    () => sorted.find((v) => v.id === compareLeft),
    [sorted, compareLeft]
  );
  const rightVersion = useMemo(
    () => sorted.find((v) => v.id === compareRight),
    [sorted, compareRight]
  );

  const canDiff =
    leftVersion?.ocr_text !== null &&
    leftVersion?.ocr_text !== undefined &&
    rightVersion?.ocr_text !== null &&
    rightVersion?.ocr_text !== undefined;

  function handleCompare() {
    if (compareLeft && compareRight && compareLeft !== compareRight) {
      setShowDiff(true);
    }
  }

  if (versions.length === 0) {
    return (
      <div className="card-casevault rounded-2xl p-8 text-center" role="status">
        <p className="text-xs text-slate-500">No version history available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Diff comparison selector */}
      {sorted.length >= 2 && (
        <div className="card-casevault rounded-2xl p-4 shadow-sm" role="region" aria-label="Version comparison">
          <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Compare Immutable Versions</h4>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <label className="text-xs text-slate-600">
              <span className="sr-only">Compare version</span>
              <select
                value={compareLeft}
                onChange={(e) => { setCompareLeft(e.target.value); setShowDiff(false); }}
                className="rounded-xl border border-[#E7E3DA] bg-[#FAF8F5] px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#EAA037]"
                aria-label="Select first version to compare"
              >
                <option value="">Select version…</option>
                {sorted.map((v) => (
                  <option key={v.id} value={v.id}>
                    Version {v.version_number} — {format(new Date(v.created_at), "dd MMM yyyy")}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-slate-400 font-semibold text-xs">vs</span>
            <label className="text-xs text-slate-600">
              <span className="sr-only">Compare with version</span>
              <select
                value={compareRight}
                onChange={(e) => { setCompareRight(e.target.value); setShowDiff(false); }}
                className="rounded-xl border border-[#E7E3DA] bg-[#FAF8F5] px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#EAA037]"
                aria-label="Select second version to compare"
              >
                <option value="">Select version…</option>
                {sorted.map((v) => (
                  <option key={v.id} value={v.id}>
                    Version {v.version_number} — {format(new Date(v.created_at), "dd MMM yyyy")}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={handleCompare}
              disabled={!compareLeft || !compareRight || compareLeft === compareRight}
              className="btn-dark inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 shadow-sm"
              aria-label="Show diff between selected versions"
            >
              <GitCompare className="h-3.5 w-3.5" aria-hidden="true" />
              Compare
            </button>
          </div>
        </div>
      )}

      {/* Diff viewer */}
      {showDiff && leftVersion && rightVersion && (
        <div className="card-casevault rounded-2xl overflow-hidden border border-[#E7E3DA]">
          {canDiff ? (
            <ReactDiffViewer
              oldValue={leftVersion.ocr_text ?? ""}
              newValue={rightVersion.ocr_text ?? ""}
              leftTitle={`Version ${leftVersion.version_number}`}
              rightTitle={`Version ${rightVersion.version_number}`}
              splitView={true}
              compareMethod={DiffMethod.WORDS}
              styles={{
                variables: {
                  light: {
                    diffViewerBackground: "#ffffff",
                    addedBackground: "#e6ffec",
                    removedBackground: "#ffebe9",
                    wordAddedBackground: "#acf2bd",
                    wordRemovedBackground: "#fdb8c0",
                  },
                },
              }}
            />
          ) : (
            <div className="p-6 text-center text-xs text-slate-500">
              Diff comparison is only available for text-based documents (OCR text).
              These versions do not have extracted text content.
            </div>
          )}
        </div>
      )}

      {/* Version list */}
      <div className="card-casevault rounded-2xl divide-y divide-[#F1ECE3] overflow-hidden">
        {sorted.map((version) => (
          <div key={version.id} className="p-4 hover:bg-[#FAF8F5] transition-colors" role="article" aria-label={`Version ${version.version_number}`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center justify-center rounded-full bg-[#FEF7EA] border border-[#FCD34D] px-2.5 py-0.5 text-xs font-bold text-[#92400E]">
                    v{version.version_number}
                  </span>
                  <time className="text-xs text-slate-500" dateTime={version.created_at}>
                    {format(new Date(version.created_at), "dd MMM yyyy, HH:mm")}
                  </time>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  By <span className="font-semibold text-slate-800">{version.uploaded_by_name}</span>
                  <span className="mx-1 text-slate-300">|</span>
                  {(version.file_size_bytes / 1024).toFixed(0)} KB
                  <span className="mx-1 text-slate-300">|</span>
                  {version.mime_type}
                </p>
                <div className="mt-1.5">
                  <HashDisplay hash={version.file_hash_sha256} />
                </div>
              </div>

              {onDownload && (
                <button
                  onClick={() => onDownload(version.id)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#E7E3DA] bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
                  aria-label={`Download version ${version.version_number}`}
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Download
                </button>
              )}
            </div>

            {/* Change reason annotation */}
            {version.change_reason && (
              <div className="mt-2.5 rounded-xl bg-[#FEF7EA] border border-[#FCD34D] px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#92400E]">Change Reason</p>
                <p className="text-xs text-[#92400E] mt-0.5">{version.change_reason}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

