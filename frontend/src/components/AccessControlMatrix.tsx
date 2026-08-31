import React from "react";
import {
  Shield,
  Eye,
  Check,
  X,
  Lock,
  Sparkles,
} from "lucide-react";
import { UserRole } from "../types";
import { MOCK_ROLES } from "../api/mockData";

interface AccessControlMatrixProps {
  currentRole: UserRole;
  onSelectRole: (role: UserRole) => void;
}

export const AccessControlMatrix: React.FC<AccessControlMatrixProps> = ({
  currentRole,
  onSelectRole,
}) => {
  return (
    <div className="space-y-6 animate-fadeIn">
      
      {/* Header */}
      <div className="border-b border-[#E7E3DA] pb-4">
        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium mb-1">
          <span>Security Governance</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-800 font-semibold">Clearance & Redaction Matrix</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-serif font-normal text-slate-900 tracking-tight flex items-center gap-2.5">
          Role-Based Access Control
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Statutory clearance classification enforcement and real-time response-layer field redactions.
        </p>
      </div>

      {/* Interactive Demonstration Panel */}
      <div className="card-casevault rounded-2xl p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-[#E7E3DA] pb-3.5">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-[#EAA037]" />
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Live Field Redaction Preview
            </h3>
          </div>
          <span className="text-xs text-slate-600">
            Active Role: <span className="font-bold text-[#92400E] bg-[#FEF7EA] px-2 py-0.5 rounded-lg border border-[#FCD34D]">{currentRole.replace(/_/g, " ")}</span>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Sample Unredacted Original */}
          <div className="rounded-xl border border-[#E7E3DA] bg-[#FAF8F5] p-4 text-xs space-y-2">
            <div className="flex items-center justify-between text-slate-500 border-b border-[#E7E3DA] pb-1.5 font-bold">
              <span>UNREDACTED CLASSIFIED RECORD</span>
              <span className="text-[10px] text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded font-mono">LEVEL 4 - SECRET</span>
            </div>
            <div className="font-mono text-[11px] text-slate-700 space-y-1.5">
              <p><span className="text-slate-400">Case:</span> CV-24-0187</p>
              <p><span className="text-slate-400">Witness Name:</span> &quot;Mr. Ramesh Kulkarni&quot;</p>
              <p><span className="text-slate-400">Informant ID:</span> &quot;INF-88492&quot;</p>
              <p><span className="text-slate-400">Victim Details:</span> &quot;S. Verma (Age 34, Sector 12)&quot;</p>
              <p><span className="text-slate-400">Suspect Location:</span> &quot;Flat 4B, Cyber Tower, Bangalore&quot;</p>
            </div>
          </div>

          {/* Role Filtered Result */}
          <div className="rounded-xl border border-[#FCD34D] bg-[#FEF7EA] p-4 text-xs space-y-2">
            <div className="flex items-center justify-between text-[#92400E] border-b border-[#FCD34D]/60 pb-1.5 font-bold">
              <span className="flex items-center gap-1">
                <Sparkles className="h-3 w-3 text-[#EAA037]" />
                DELIVERED TO {currentRole}
              </span>
              <span className="text-[10px] font-mono font-bold bg-amber-200/80 px-1.5 py-0.2 rounded">LIVE REDACTED</span>
            </div>
            <div className="font-mono text-[11px] text-slate-900 space-y-1.5">
              <p><span className="text-slate-500">Case:</span> CV-24-0187</p>
              
              <p>
                <span className="text-slate-500">Witness Name:</span>{" "}
                {[UserRole.COURT_CLERK, UserRole.EXTERNAL_COUNSEL, UserRole.FORENSIC_ANALYST].includes(currentRole) ? (
                  <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] text-amber-800 border border-amber-300 inline-flex items-center gap-1">
                    <Lock className="h-2.5 w-2.5" /> [REDACTED — clearance]
                  </span>
                ) : (
                  <span className="text-emerald-700 font-semibold">&quot;Mr. Ramesh Kulkarni&quot;</span>
                )}
              </p>

              <p>
                <span className="text-slate-500">Informant ID:</span>{" "}
                {[UserRole.INVESTIGATING_OFFICER, UserRole.PROSECUTOR, UserRole.COURT_CLERK, UserRole.FORENSIC_ANALYST, UserRole.EXTERNAL_COUNSEL].includes(currentRole) ? (
                  <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] text-amber-800 border border-amber-300 inline-flex items-center gap-1">
                    <Lock className="h-2.5 w-2.5" /> [REDACTED — clearance]
                  </span>
                ) : (
                  <span className="text-emerald-700 font-semibold">&quot;INF-88492&quot;</span>
                )}
              </p>

              <p>
                <span className="text-slate-500">Victim Details:</span>{" "}
                {[UserRole.COURT_CLERK, UserRole.FORENSIC_ANALYST, UserRole.EXTERNAL_COUNSEL].includes(currentRole) ? (
                  <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] text-amber-800 border border-amber-300 inline-flex items-center gap-1">
                    <Lock className="h-2.5 w-2.5" /> [REDACTED — clearance]
                  </span>
                ) : (
                  <span className="text-emerald-700 font-semibold">&quot;S. Verma (Age 34, Sector 12)&quot;</span>
                )}
              </p>

              <p>
                <span className="text-slate-500">Suspect Location:</span>{" "}
                {[UserRole.COURT_CLERK, UserRole.EXTERNAL_COUNSEL].includes(currentRole) ? (
                  <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] text-amber-800 border border-amber-300 inline-flex items-center gap-1">
                    <Lock className="h-2.5 w-2.5" /> [REDACTED — clearance]
                  </span>
                ) : (
                  <span className="text-emerald-700 font-semibold">&quot;Flat 4B, Cyber Tower, Bangalore&quot;</span>
                )}
              </p>
            </div>
          </div>

        </div>
      </div>

      {/* RBAC Table Matrix */}
      <div className="card-casevault rounded-2xl p-5 overflow-x-auto shadow-sm space-y-3">
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
          System Roles & Access Matrix
        </h3>

        <table className="w-full text-left text-xs border-collapse min-w-[750px]">
          <thead>
            <tr className="border-b border-[#E7E3DA] bg-[#FAF8F5] text-slate-400 font-bold uppercase tracking-wider text-[10px]">
              <th className="p-3">Role</th>
              <th className="p-3">Max Clearance</th>
              <th className="p-3">Allowed Actions</th>
              <th className="p-3">Audit Logs</th>
              <th className="p-3">Workflow Approvals</th>
              <th className="p-3">Redacted Fields</th>
              <th className="p-3 text-right">Switch Role</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F1ECE3] bg-white">
            {MOCK_ROLES.map((role) => {
              const isCurrent = currentRole === role.name;
              const perms = role.permissions_json;

              return (
                <tr
                  key={role.id}
                  className={`hover:bg-[#FAF8F5] transition-colors ${
                    isCurrent ? "bg-[#FEF7EA]/60 font-semibold" : "text-slate-700"
                  }`}
                >
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{role.name.replace(/_/g, " ")}</span>
                      {isCurrent && (
                        <span className="rounded-full bg-[#EAA037] px-2 py-0.2 text-[9px] font-bold text-slate-950">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 font-normal mt-0.5">{role.description}</p>
                  </td>

                  <td className="p-3">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold font-mono text-[10px] text-slate-700 border border-[#E7E3DA]">
                      {perms.max_classification}
                    </span>
                  </td>

                  <td className="p-3 font-mono text-[10px] text-slate-500">
                    {perms.allowed_actions.join(", ")}
                  </td>

                  <td className="p-3">
                    {perms.can_view_audit_logs ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-[11px]">
                        <Check className="h-3.5 w-3.5" /> Full Access
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-400 text-[11px]">
                        <X className="h-3.5 w-3.5" /> Restricted
                      </span>
                    )}
                  </td>

                  <td className="p-3">
                    {perms.can_approve_workflows ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold text-[11px]">
                        <Check className="h-3.5 w-3.5" /> Authorized
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-400 text-[11px]">
                        <X className="h-3.5 w-3.5" /> None
                      </span>
                    )}
                  </td>

                  <td className="p-3">
                    {perms.redacted_fields.length === 0 ? (
                      <span className="text-slate-400 italic text-[11px]">None (Unrestricted)</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {perms.redacted_fields.map((f) => (
                          <span
                            key={f}
                            className="rounded bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.2 text-[9px] font-mono"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>

                  <td className="p-3 text-right">
                    <button
                      onClick={() => onSelectRole(role.name)}
                      disabled={isCurrent}
                      className="rounded-xl border border-[#E7E3DA] bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed px-3 py-1 text-xs font-semibold text-slate-700 transition-colors inline-flex items-center gap-1 shadow-sm"
                    >
                      <Eye className="h-3 w-3" /> Select
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
};

