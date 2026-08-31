import React from "react";
import {
  Upload,
  Eye,
  Download,
  Printer,
  ArrowRightLeft,
  Lock,
  Unlock,
  Scissors,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
} from "lucide-react";
import { format } from "date-fns";
import type { ChainOfCustodyEntry } from "../types";
import { CustodyAction, UserRole } from "../types";

interface CustodyTimelineProps {
  entries: ChainOfCustodyEntry[];
}

const ACTION_CONFIG: Record<CustodyAction, { icon: React.ElementType; label: string; color: string }> = {
  [CustodyAction.UPLOADED]:    { icon: Upload,          label: "Uploaded",    color: "text-amber-700 bg-amber-100/80 ring-amber-300" },
  [CustodyAction.VIEWED]:      { icon: Eye,             label: "Viewed",      color: "text-slate-700 bg-slate-100 ring-slate-300" },
  [CustodyAction.DOWNLOADED]:  { icon: Download,        label: "Downloaded",  color: "text-emerald-700 bg-emerald-100/80 ring-emerald-300" },
  [CustodyAction.PRINTED]:     { icon: Printer,         label: "Printed",     color: "text-amber-800 bg-amber-100/80 ring-amber-300" },
  [CustodyAction.TRANSFERRED]: { icon: ArrowRightLeft,  label: "Transferred", color: "text-blue-700 bg-blue-100/80 ring-blue-300" },
  [CustodyAction.SEALED]:      { icon: Lock,            label: "Sealed",      color: "text-rose-700 bg-rose-100/80 ring-rose-300" },
  [CustodyAction.UNSEALED]:    { icon: Unlock,          label: "Unsealed",    color: "text-orange-700 bg-orange-100/80 ring-orange-300" },
  [CustodyAction.REDACTED]:    { icon: Scissors,        label: "Redacted",    color: "text-purple-700 bg-purple-100/80 ring-purple-300" },
};

function HashBadge({ verified }: { verified: boolean | null }) {
  if (verified === true) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#E8F7EE] px-2.5 py-0.5 text-xs font-semibold text-[#137333] border border-[#C2E7CE]" role="status">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        Hash Verified
      </span>
    );
  }
  if (verified === false) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#FEE2E2] px-2.5 py-0.5 text-xs font-bold text-[#991B1B] border border-[#FECACA] animate-pulse" role="alert">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        INTEGRITY ALERT
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500 border border-slate-200" role="status">
      <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
      Unverified
    </span>
  );
}

function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span className="ml-1 inline-block rounded bg-white border border-[#E7E3DA] px-1.5 py-0.2 text-[10px] font-mono uppercase tracking-wider text-slate-600">
      {role.replace(/_/g, " ")}
    </span>
  );
}

export const CustodyTimeline: React.FC<CustodyTimelineProps> = ({ entries }) => {
  if (entries.length === 0) {
    return (
      <div className="card-casevault rounded-2xl p-8 text-center" role="status">
        <p className="text-xs text-slate-500">No custody records found for this document.</p>
      </div>
    );
  }

  // Sort by timestamp descending (most recent first)
  const sorted = [...entries].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );

  return (
    <div className="card-casevault rounded-2xl p-6 shadow-sm">
      <h3 className="mb-6 text-xs font-bold uppercase tracking-wider text-slate-400">
        Chain of Custody Timeline
      </h3>
      <ol className="relative border-l-2 border-[#E7E3DA] ml-3 pl-6 space-y-6" aria-label="Chain of custody timeline">
        {sorted.map((entry) => {
          const config = ACTION_CONFIG[entry.action] ?? ACTION_CONFIG[CustodyAction.VIEWED];
          const Icon = config.icon;

          return (
            <li key={entry.id} className="relative">
              {/* Timeline dot */}
              <div className={`absolute -left-[37px] flex h-7 w-7 items-center justify-center rounded-full ${config.color} ring-4 ring-white shadow-sm`}>
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              </div>

              <div className="rounded-xl border border-[#E7E3DA] bg-[#FAF8F5] p-4 space-y-2">
                {/* Header: action + timestamp */}
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-bold text-slate-900 text-xs sm:text-sm">{config.label}</span>
                  <time className="text-[11px] font-mono text-slate-400" dateTime={entry.timestamp}>
                    {format(new Date(entry.timestamp), "dd MMM yyyy, HH:mm:ss")}
                  </time>
                </div>

                {/* Actor info */}
                <div className="text-xs text-slate-700">
                  <span className="font-semibold">{entry.performed_by_name}</span>
                  <RoleBadge role={entry.performed_by_role} />
                  {entry.performed_by_badge_id && (
                    <span className="ml-1 text-slate-400 font-mono text-[10px]">(#{entry.performed_by_badge_id})</span>
                  )}
                </div>

                {/* Transfer details */}
                {entry.action === CustodyAction.TRANSFERRED && entry.from_user_name && entry.to_user_name && (
                  <div className="text-xs text-slate-600 bg-white p-2 rounded-lg border border-[#E7E3DA]">
                    <span className="text-slate-400">From:</span>{" "}
                    <span className="font-medium text-slate-800">{entry.from_user_name}</span>
                    <span className="mx-1 text-[#EAA037]">→</span>
                    <span className="text-slate-400">To:</span>{" "}
                    <span className="font-medium text-slate-800">{entry.to_user_name}</span>
                  </div>
                )}

                {/* Hash badge + notes */}
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3 pt-1">
                  <HashBadge verified={entry.hash_verified} />
                  <span className="font-mono text-[10px] text-slate-400 truncate max-w-[280px]" title={entry.hash_at_action}>
                    SHA-256: {entry.hash_at_action.substring(0, 16)}…
                  </span>
                </div>

                {entry.notes && (
                  <p className="text-xs text-slate-500 italic border-l-2 border-[#E7E3DA] pl-2 mt-1">
                    {entry.notes}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

