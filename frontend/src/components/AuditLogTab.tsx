import React, { useState, useMemo } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronRight, ShieldAlert, Link2 } from "lucide-react";
import type { AuditLogEntry } from "../types";
import { AuditResult, UserRole } from "../types";

interface AuditLogTabProps {
  entries: AuditLogEntry[];
  userRole: UserRole;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

const RESULT_STYLES: Record<AuditResult, { bg: string; text: string; border: string }> = {
  [AuditResult.SUCCESS]: { bg: "bg-[#E8F7EE]", text: "text-[#137333]", border: "border-[#C2E7CE]" },
  [AuditResult.FAILURE]: { bg: "bg-[#FEF3C7]", text: "text-[#92400E]", border: "border-[#FDE68A]" },
  [AuditResult.DENIED]:  { bg: "bg-[#FEE2E2]", text: "text-[#991B1B]", border: "border-[#FECACA]" },
  [AuditResult.ERROR]:   { bg: "bg-[#FEE2E2]", text: "text-[#991B1B]", border: "border-[#FECACA]" },
};

function ExpandableDetails({ details }: { details: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);
  const json = JSON.stringify(details, null, 2);
  const hasContent = Object.keys(details).length > 0;

  if (!hasContent) {
    return <span className="text-slate-400 text-xs">—</span>;
  }

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-0.5 text-xs text-slate-700 hover:text-[#DE942A] font-semibold focus:outline-none"
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse details" : "Expand details"}
      >
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {expanded ? "Hide" : "Details"}
      </button>
      {expanded && (
        <pre className="mt-1 rounded-xl bg-[#152028] p-2.5 text-[11px] text-[#EAA037] overflow-x-auto max-h-40 max-w-xs font-mono" aria-label="Audit log details JSON">
          {json}
        </pre>
      )}
    </div>
  );
}

export const AuditLogTab: React.FC<AuditLogTabProps> = ({
  entries,
  userRole,
  page,
  totalPages,
  onPageChange,
}) => {
  const [sortAsc, setSortAsc] = useState(false);
  const [filterAction, setFilterAction] = useState("");
  const [filterResult, setFilterResult] = useState("");

  // Role gate: only AUDITOR and SUPERVISOR can see raw audit logs
  const canAccess = userRole === UserRole.AUDITOR || userRole === UserRole.SUPERVISOR || userRole === UserRole.SUPER_ADMIN;

  if (!canAccess) {
    return (
      <div className="card-casevault rounded-2xl p-12 text-center" role="status">
        <ShieldAlert className="mx-auto h-10 w-10 text-amber-500" aria-hidden="true" />
        <h3 className="mt-3 text-base font-bold text-slate-900">Access Restricted</h3>
        <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
          Cryptographic audit records require Auditor or Supervisor clearance. You can simulate these roles via the role selector.
        </p>
      </div>
    );
  }

  // Extract unique action types for filter dropdown
  const actionTypes = useMemo(
    () => [...new Set(entries.map((e) => e.action))].sort(),
    [entries]
  );

  const filtered = useMemo(() => {
    let result = [...entries];
    if (filterAction) result = result.filter((e) => e.action === filterAction);
    if (filterResult) result = result.filter((e) => e.result === filterResult);
    result.sort((a, b) => {
      const diff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      return sortAsc ? diff : -diff;
    });
    return result;
  }, [entries, filterAction, filterResult, sortAsc]);

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-[#FAF8F5] rounded-xl border border-[#E7E3DA]">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-xs text-slate-600 font-medium">
            Action:
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="ml-1 rounded-lg border border-[#E7E3DA] bg-white px-2 py-1 text-xs text-slate-800 focus:outline-none"
              aria-label="Filter by action type"
            >
              <option value="">All</option>
              {actionTypes.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </label>
          <label className="text-xs text-slate-600 font-medium">
            Result:
            <select
              value={filterResult}
              onChange={(e) => setFilterResult(e.target.value)}
              className="ml-1 rounded-lg border border-[#E7E3DA] bg-white px-2 py-1 text-xs text-slate-800 focus:outline-none"
              aria-label="Filter by result"
            >
              <option value="">All</option>
              {Object.values(AuditResult).map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
        </div>

        <button
          onClick={() => setSortAsc(!sortAsc)}
          className="text-xs font-semibold text-slate-700 hover:text-[#DE942A] focus:outline-none"
          aria-label={sortAsc ? "Sort newest first" : "Sort oldest first"}
        >
          {sortAsc ? "↑ Oldest first" : "↓ Newest first"}
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-[#E7E3DA]">
        <table className="w-full text-left text-xs border-collapse min-w-[700px]" aria-label="Audit log entries">
          <thead className="bg-[#FAF8F5] text-[11px] uppercase tracking-wider text-slate-400 font-bold border-b border-[#E7E3DA]">
            <tr>
              <th scope="col" className="px-3.5 py-3">Timestamp</th>
              <th scope="col" className="px-3.5 py-3">User</th>
              <th scope="col" className="px-3.5 py-3">Action</th>
              <th scope="col" className="px-3.5 py-3">Result</th>
              <th scope="col" className="px-3.5 py-3">IP Address</th>
              <th scope="col" className="px-3.5 py-3">Hash Chain</th>
              <th scope="col" className="px-3.5 py-3">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1ECE3] bg-white">
            {filtered.map((entry) => {
              const resultStyle = RESULT_STYLES[entry.result] ?? RESULT_STYLES[AuditResult.ERROR];
              return (
                <tr key={entry.id} className="hover:bg-[#FAF8F5] transition-colors">
                  <td className="whitespace-nowrap px-3.5 py-3 text-slate-600 font-mono text-[11px]">
                    {format(new Date(entry.timestamp), "dd/MM/yy HH:mm:ss")}
                  </td>
                  <td className="px-3.5 py-3 text-slate-800 font-medium">
                    {entry.user_name ?? <span className="italic text-slate-400">System</span>}
                  </td>
                  <td className="px-3.5 py-3">
                    <span className="rounded-lg bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700 border border-slate-200">
                      {entry.action}
                    </span>
                  </td>
                  <td className="px-3.5 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold border ${resultStyle.bg} ${resultStyle.text} ${resultStyle.border}`}>
                      {entry.result}
                    </span>
                  </td>
                  <td className="px-3.5 py-3 font-mono text-[11px] text-slate-500">
                    {entry.ip_address ?? "—"}
                  </td>
                  <td className="px-3.5 py-3">
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] text-slate-400" title={`prev: ${entry.previous_log_hash}\ncurr: ${entry.current_log_hash}`}>
                      <Link2 className="h-3 w-3 text-[#EAA037]" aria-hidden="true" />
                      {entry.previous_log_hash.substring(0, 6)}…→{entry.current_log_hash.substring(0, 6)}…
                    </span>
                  </td>
                  <td className="px-3.5 py-3">
                    <ExpandableDetails details={entry.details} />
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-xs text-slate-500">
                  No audit log entries match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-[#E7E3DA] px-3 py-2">
          <span className="text-xs text-slate-500">Page {page} of {totalPages}</span>
          <div className="flex gap-1.5">
            <button
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="rounded-xl border border-[#E7E3DA] bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              aria-label="Previous page"
            >
              ← Prev
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="rounded-xl border border-[#E7E3DA] bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              aria-label="Next page"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

