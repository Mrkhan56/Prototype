import React from "react";
import {
  LayoutGrid,
  FolderLock,
  ScrollText,
  Clock,
  Users,
  Shield,
  Settings,
  Plus,
  Lock,
  LogOut,
} from "lucide-react";
import { UserRole } from "../types";
import { MOCK_USERS } from "../api/mockData";

export type SidebarView = "cases" | "search" | "workflows" | "rbac" | "audit" | "document";

interface SidebarProps {
  activeView: SidebarView;
  setActiveView: (view: SidebarView) => void;
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
  onOpenUpload: () => void;
  documentCount?: number;
  auditCount?: number;
  onOpenSettings?: () => void;
  onLogout?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  setActiveView,
  currentRole,
  setCurrentRole: _setCurrentRole,
  onOpenUpload,
  documentCount = 128,
  auditCount = 4,
  onOpenSettings,
  onLogout,
}) => {
  const currentUser = MOCK_USERS[currentRole] ?? MOCK_USERS[UserRole.INVESTIGATING_OFFICER];

  // Derive initials
  const initials = currentUser.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  return (
    <aside className="w-64 shrink-0 bg-[#152028] text-slate-300 flex flex-col justify-between h-screen sticky top-0 border-r border-[#212E38] z-30 select-none">
      
      {/* ── Top Navigation & Brand ── */}
      <div className="p-4 space-y-6 overflow-y-auto">
        
        {/* Brand Logo */}
        <div 
          onClick={() => setActiveView("cases")}
          className="flex items-center gap-2.5 px-2 cursor-pointer group"
        >
          <div className="h-9 w-9 rounded-xl bg-[#EAA037] flex items-center justify-center text-[#152028] shadow-md shadow-amber-500/20 group-hover:scale-105 transition-transform">
            <Lock className="h-5 w-5 stroke-[2.5]" />
          </div>
          <div className="flex items-baseline">
            <span className="text-xl font-bold tracking-tight text-white font-sans">
              casevault<span className="text-[#EAA037]">.</span>
            </span>
          </div>
        </div>

        {/* Primary CTA: Upload Document */}
        <button
          onClick={onOpenUpload}
          className="w-full py-2.5 px-4 rounded-xl bg-[#EAA037] hover:bg-[#DE942A] text-[#152028] font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.99]"
        >
          <Plus className="h-4 w-4 stroke-[3]" />
          <span>Upload document</span>
        </button>

        {/* Section: NAVIGATE */}
        <div className="space-y-1">
          <p className="px-2 text-[10px] font-bold tracking-wider text-slate-400 uppercase font-sans">
            NAVIGATE
          </p>

          <button
            onClick={() => setActiveView("cases")}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
              activeView === "cases"
                ? "bg-white/10 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <LayoutGrid className="h-4 w-4" />
              <span>Workspace</span>
            </div>
          </button>

          <button
            onClick={() => setActiveView("search")}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
              activeView === "search"
                ? "bg-white/10 text-white font-semibold shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <FolderLock className="h-4 w-4" />
              <span>All documents</span>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              {documentCount}
            </span>
          </button>

          <button
            onClick={() => setActiveView("audit")}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
              activeView === "audit"
                ? "bg-white/10 text-white font-semibold shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <ScrollText className="h-4 w-4" />
              <span>Audit center</span>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              {auditCount}
            </span>
          </button>
        </div>

        {/* Section: WORKSPACE */}
        <div className="space-y-1 pt-2">
          <p className="px-2 text-[10px] font-bold tracking-wider text-slate-400 uppercase font-sans">
            WORKSPACE
          </p>

          <button
            onClick={() => setActiveView("workflows")}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
              activeView === "workflows"
                ? "bg-white/10 text-white font-semibold shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Clock className="h-4 w-4" />
              <span>Recent activity</span>
            </div>
          </button>

          <button
            onClick={() => setActiveView("rbac")}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all ${
              activeView === "rbac"
                ? "bg-white/10 text-white font-semibold shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-white/5"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Users className="h-4 w-4" />
              <span>Team access</span>
            </div>
          </button>
        </div>

      </div>

      {/* ── Bottom Section: Vault Protected & User Info ── */}
      <div className="p-4 space-y-3 border-t border-[#212E38]/80 bg-[#121B22]/50">
        
        {/* Vault Protected Card */}
        <div className="rounded-xl border border-[#263542] bg-[#16232D] p-3 space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
            <Shield className="h-3.5 w-3.5 text-[#EAA037]" />
            <span>Vault protected</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-tight">
            Encrypted at rest and in transit. Every action is recorded.
          </p>
          <div className="pt-1 font-mono text-[9px] text-slate-400 uppercase tracking-wider">
            CASEVAULT / SECURE NODE 04
          </div>
        </div>

        {/* User Profile Pill */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-full bg-[#EAA037] text-[#152028] flex items-center justify-center font-bold text-xs shrink-0 shadow-sm">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate leading-tight">
                {currentUser.name}
              </p>
              <p className="text-[11px] text-slate-400 truncate leading-tight">
                {currentRole.replace(/_/g, " ").toLowerCase()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onOpenSettings}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              title="Role & Clearance Settings"
            >
              <Settings className="h-4 w-4" />
            </button>
            {onLogout && (
              <button
                onClick={onLogout}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                title="Switch Officer / Log Out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

      </div>

    </aside>
  );
};
