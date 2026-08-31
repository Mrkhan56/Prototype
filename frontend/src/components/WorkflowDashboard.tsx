import React, { useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Send,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import type { Document, WorkflowConfig } from "../types";
import { UserRole } from "../types";
import { transitionWorkflow } from "../api/client";

interface WorkflowDashboardProps {
  documents: Document[];
  configs: WorkflowConfig[];
  userRole: UserRole;
  onRefreshDocuments: () => void;
}

export const WorkflowDashboard: React.FC<WorkflowDashboardProps> = ({
  documents,
  configs,
  userRole,
  onRefreshDocuments,
}) => {
  const [selectedWorkflowName, setSelectedWorkflowName] = useState<string>("charge_sheet");
  const [selectedDocId, setSelectedDocId] = useState<string>(documents[0]?.id ?? "");
  const [comment, setComment] = useState("");
  const [transitioning, setTransitioning] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const currentConfig = configs.find((c) => c.name === selectedWorkflowName) ?? configs[0];
  const selectedDoc = documents.find((d) => d.id === selectedDocId) ?? documents[0];
  const currentStatus = selectedDoc?.workflow_status || "DRAFT";

  // Find transitions from current status
  const availableTransitions = currentConfig?.transitions.filter(
    (t) => t.from_state === currentStatus
  ) ?? [];

  async function handleTransition(targetStatus: string, requiresComment: boolean) {
    if (requiresComment && !comment.trim()) {
      setFeedback("A mandatory objection/revision comment is required for this transition.");
      return;
    }

    if (!selectedDoc) return;
    setTransitioning(true);
    setFeedback(null);

    try {
      const res = await transitionWorkflow(selectedDoc.id, targetStatus, selectedWorkflowName, comment);
      setFeedback(`✓ ${res.message}`);
      setComment("");
      onRefreshDocuments();
    } catch (err) {
      setFeedback(`Error: ${err instanceof Error ? err.message : "Transition failed"}`);
    } finally {
      setTransitioning(false);
    }
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      
      {/* ── Workflow Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#E7E3DA] pb-4">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium mb-1">
            <span>Workspace</span>
            <span className="text-slate-300">/</span>
            <span className="text-slate-800 font-semibold">Statutory Pipelines</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-serif font-normal text-slate-900 tracking-tight flex items-center gap-2.5">
            Approval Workflows
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Config-driven document approval state machines with role authorization and SLA counters.
          </p>
        </div>

        {/* Workflow Switcher */}
        <div className="flex items-center gap-2">
          {configs.map((w) => (
            <button
              key={w.name}
              onClick={() => setSelectedWorkflowName(w.name)}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                selectedWorkflowName === w.name
                  ? "btn-dark shadow-sm"
                  : "bg-white text-slate-700 hover:bg-slate-50 border border-[#E7E3DA]"
              }`}
            >
              {w.display_name}
            </button>
          ))}
        </div>
      </div>

      {/* ── Active Document Selector ── */}
      <div className="card-casevault rounded-2xl p-5 shadow-sm space-y-3">
        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          Select Document to Advance State
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {documents.map((doc) => {
            const isSelected = selectedDoc?.id === doc.id;
            return (
              <button
                key={doc.id}
                onClick={() => {
                  setSelectedDocId(doc.id);
                  setFeedback(null);
                }}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  isSelected
                    ? "border-[#FCD34D] bg-[#FEF7EA] shadow-sm ring-1 ring-[#FCD34D]"
                    : "border-[#E7E3DA] bg-white hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-slate-500 font-semibold">{doc.case_number}</span>
                  <span className={`font-bold px-1.5 py-0.2 rounded text-[10px] ${isSelected ? "bg-amber-200/60 text-[#92400E]" : "bg-slate-100 text-slate-700"}`}>
                    {doc.workflow_status || "DRAFT"}
                  </span>
                </div>
                <h4 className="mt-1.5 text-xs font-bold text-slate-900 truncate">{doc.title}</h4>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── State Machine Pipeline Visualizer ── */}
      {currentConfig && (
        <div className="card-casevault rounded-2xl p-6 space-y-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-[#E7E3DA] pb-3.5">
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                {currentConfig.display_name}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">{currentConfig.description}</p>
            </div>
            <span className="rounded-full bg-[#FEF7EA] px-3 py-1 text-xs font-bold text-[#92400E] border border-[#FCD34D]">
              Current: {currentStatus}
            </span>
          </div>

          {/* Stepper Node Graph */}
          <div className="overflow-x-auto py-2">
            <div className="flex items-center gap-3 min-w-[700px]">
              {currentConfig.states.map((state, idx) => {
                const isCurrent = state.name === currentStatus;
                const isPast = currentConfig.states.findIndex((s) => s.name === currentStatus) > idx;

                return (
                  <React.Fragment key={state.name}>
                    <div
                      className={`relative flex-1 rounded-2xl border p-4 transition-all ${
                        isCurrent
                          ? "border-[#FCD34D] bg-[#FEF7EA] shadow-md ring-2 ring-[#FCD34D]/60"
                          : isPast
                          ? "border-[#C2E7CE] bg-[#E8F7EE] text-[#137333]"
                          : "border-[#E7E3DA] bg-[#FAF8F5] text-slate-500"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] font-mono mb-1">
                        <span className="font-bold">STEP {idx + 1}</span>
                        {state.sla_hours && (
                          <span className="flex items-center gap-0.5 text-amber-700 font-semibold">
                            <Clock className="h-3 w-3" /> {state.sla_hours}h SLA
                          </span>
                        )}
                      </div>

                      <h4 className={`text-xs font-bold ${isCurrent ? "text-slate-900" : isPast ? "text-[#137333]" : "text-slate-700"}`}>
                        {state.display_name}
                      </h4>

                      <p className="text-[10px] text-slate-400 mt-1 font-mono">{state.name}</p>

                      {isCurrent && (
                        <span className="absolute -top-2 right-3 rounded-full bg-[#EAA037] px-2 py-0.2 text-[9px] font-bold text-slate-950 shadow">
                          ACTIVE
                        </span>
                      )}
                    </div>

                    {idx < currentConfig.states.length - 1 && (
                      <ArrowRight className={`h-4 w-4 shrink-0 ${isPast ? "text-emerald-600" : "text-slate-300"}`} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Action Trigger Area */}
          <div className="rounded-2xl border border-[#E7E3DA] bg-[#FAF8F5] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-[#EAA037]" />
                Available Transitions for Simulated Role ({userRole})
              </h4>
              <span className="text-xs text-slate-500 font-medium">
                Document: <span className="font-semibold text-slate-900">{selectedDoc?.title}</span>
              </span>
            </div>

            {feedback && (
              <div className="rounded-xl bg-[#E8F7EE] border border-[#C2E7CE] p-3 text-xs text-[#137333] font-medium flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-[#137333]" />
                <span>{feedback}</span>
              </div>
            )}

            {/* Comment input */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <MessageSquare className="h-3 w-3 text-slate-400" /> Transition Justification / Objections
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Optional for approvals, mandatory for objections / defect returns..."
                rows={2}
                className="w-full rounded-xl border border-[#E7E3DA] bg-white px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#EAA037] focus:outline-none focus:ring-1 focus:ring-[#EAA037]"
              />
            </div>

            {/* Transition Buttons */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {availableTransitions.length === 0 ? (
                <div className="text-xs text-slate-500 italic">
                  No statutory transitions available from state <span className="font-mono text-slate-700 font-semibold">({currentStatus})</span> for role <span className="font-mono text-slate-700 font-semibold">{userRole}</span>. Switch role in top header or choose another filing.
                </div>
              ) : (
                availableTransitions.map((t) => {
                  const isAuthorized = t.required_role === userRole || userRole === UserRole.SUPER_ADMIN;
                  const isReject = t.to_state.includes("REJECT");

                  return (
                    <button
                      key={t.to_state}
                      disabled={!isAuthorized || transitioning}
                      onClick={() => handleTransition(t.to_state, t.requires_comment)}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold shadow-sm transition-all ${
                        !isAuthorized
                          ? "bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300"
                          : isReject
                          ? "bg-rose-600 hover:bg-rose-700 text-white"
                          : "btn-amber text-[#152028]"
                      }`}
                      title={!isAuthorized ? `Requires role: ${t.required_role}` : undefined}
                    >
                      <Send className="h-3.5 w-3.5" />
                      {t.display_name} ({t.to_state})
                      {!isAuthorized && <span className="text-[10px] text-amber-800 ml-1">🔒 [Needs {t.required_role}]</span>}
                    </button>
                  );
                })
              )}
            </div>
          </div>

        </div>
      )}

    </div>
  );
};

