import React, { useState } from "react";
import {
  Search,
  Upload,
  Bell,
  CheckCircle2,
  Workflow,
  LogOut,
  ChevronDown,
  UserCheck,
  Menu,
} from "lucide-react";
import { UserRole, ClassificationLevel } from "../types";
import { MOCK_USERS } from "../api/mockData";
import type { SidebarView } from "./Sidebar";

export type ActiveView = SidebarView;

interface NavbarProps {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  currentRole: UserRole;
  setCurrentRole: (role: UserRole) => void;
  onOpenUpload: () => void;
  onToggleMobileMenu?: () => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onSearchSubmit?: () => void;
  onLogout?: () => void;
  onSwitchOfficer?: () => void;
}

const CLASSIFICATION_PILL: Record<ClassificationLevel, { bg: string; text: string; border: string }> = {
  [ClassificationLevel.UNCLASSIFIED]: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  [ClassificationLevel.RESTRICTED]:   { bg: "bg-amber-50",   text: "text-amber-800",   border: "border-amber-200" },
  [ClassificationLevel.CONFIDENTIAL]: { bg: "bg-orange-50",  text: "text-orange-800",  border: "border-orange-200" },
  [ClassificationLevel.SECRET]:       { bg: "bg-rose-50",    text: "text-rose-800",    border: "border-rose-200" },
};

export const Navbar: React.FC<NavbarProps> = ({
  activeView: _activeView,
  setActiveView,
  currentRole,
  setCurrentRole,
  onOpenUpload,
  onToggleMobileMenu,
  searchQuery = "",
  onSearchChange,
  onSearchSubmit,
  onLogout,
  onSwitchOfficer,
}) => {
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const currentUser = MOCK_USERS[currentRole] ?? MOCK_USERS[UserRole.INVESTIGATING_OFFICER];
  const classStyle = CLASSIFICATION_PILL[currentUser.max_classification];

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (onSearchSubmit) onSearchSubmit();
      else setActiveView("search");
    }
  }

  return (
    <header className="sticky top-0 z-20 border-b border-[#E7E3DA] bg-[#FAF8F5]/90 backdrop-blur-md px-4 sm:px-8 py-3.5 flex items-center justify-between gap-4">
      
      {/* Mobile Menu Button */}
      <button
        onClick={onToggleMobileMenu}
        className="md:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-200 transition-colors"
        aria-label="Open navigation menu"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Center Search Input */}
      <div className="flex-1 max-w-2xl">
        <div className="relative flex items-center">
          <Search className="absolute left-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange?.(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              // Optional: navigate to search view on focus or keep unified
            }}
            placeholder="Search documents, cases, or hashes"
            className="w-full h-10 pl-10 pr-12 rounded-xl bg-white border border-[#E7E3DA] text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#EAA037]/50 focus:border-[#EAA037] shadow-sm transition-all"
          />
          <div className="absolute right-3 flex items-center gap-1">
            <kbd className="hidden sm:inline-flex items-center rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 shadow-none">
              ⌘ K
            </kbd>
          </div>
        </div>
      </div>

      {/* Right Controls: Notification, Upload, Role Menu */}
      <div className="flex items-center gap-2.5">
        
        {/* Notification Bell */}
        <div className="relative">
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-200/60 border border-transparent hover:border-[#E7E3DA] transition-all relative"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-[#EAA037] ring-2 ring-[#FAF8F5]" />
          </button>

          {notificationsOpen && (
            <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-[#E7E3DA] bg-white p-3 shadow-xl z-50 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">Security Notifications</span>
                <span className="text-[10px] text-[#EAA037] font-mono font-bold">LIVE</span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="rounded-xl bg-[#FAF8F5] p-2.5 border border-[#E7E3DA]">
                  <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Hash Integrity Verified
                  </div>
                  <p className="text-slate-600 mt-0.5 text-[11px]">
                    Document <span className="font-mono font-semibold text-slate-800">#doc-001</span> passed SHA-256 integrity verification.
                  </p>
                </div>
                <div className="rounded-xl bg-[#FAF8F5] p-2.5 border border-[#E7E3DA]">
                  <div className="flex items-center gap-1.5 text-blue-700 font-semibold">
                    <Workflow className="h-3.5 w-3.5" />
                    Workflow SLA Active
                  </div>
                  <p className="text-slate-600 mt-0.5 text-[11px]">
                    Forensic Report (FSL-770) awaiting supervisor sign-off.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Quick Upload Button */}
        <button
          onClick={onOpenUpload}
          className="btn-dark py-2 px-3.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
        >
          <Upload className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Upload</span>
        </button>

        {/* Officer Duty Session & Switcher */}
        <div className="relative">
          <button
            onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
            className="flex items-center gap-2 p-1.5 rounded-xl border border-[#E7E3DA] bg-white hover:bg-slate-50 transition-all text-left shadow-sm"
            title="Officer Session & Clearance"
          >
            <div className="h-7 w-7 rounded-lg bg-[#152028] text-[#EAA037] flex items-center justify-center font-bold text-xs shrink-0 shadow-inner">
              {currentUser.name.charAt(0)}
            </div>
            <div className="hidden xl:block text-left pr-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-800">{currentUser.name}</span>
                <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold font-mono ${classStyle.bg} ${classStyle.text} border ${classStyle.border}`}>
                  {currentUser.max_classification.substring(0, 4)}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium">
                {currentRole.replace(/_/g, " ")} • {currentUser.badge_id}
              </p>
            </div>
            <ChevronDown className="h-3 w-3 text-slate-400 ml-0.5" />
          </button>

          {roleDropdownOpen && (
            <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-[#E7E3DA] bg-white p-3 shadow-2xl z-50 animate-fadeIn">
              {/* Active Officer Identity Banner */}
              <div className="p-2.5 rounded-xl bg-[#FAF8F5] border border-[#E7E3DA] mb-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                    Active Duty Officer
                  </span>
                  <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold uppercase border ${classStyle.bg} ${classStyle.text} ${classStyle.border}`}>
                    {currentUser.max_classification}
                  </span>
                </div>
                <p className="text-xs font-bold text-slate-900">{currentUser.name}</p>
                <p className="text-[11px] text-slate-600 font-medium mt-0.5">{currentRole.replace(/_/g, " ")}</p>
                <div className="flex items-center justify-between pt-1.5 mt-1.5 border-t border-[#E7E3DA] text-[10px] text-slate-500 font-mono">
                  <span>BADGE: {currentUser.badge_id}</span>
                  <span className="truncate max-w-[140px] text-right">{currentUser.department}</span>
                </div>
              </div>

              {/* Action: Switch Officer / Re-authenticate */}
              <div className="space-y-1 mb-2">
                <button
                  onClick={() => {
                    setRoleDropdownOpen(false);
                    if (onSwitchOfficer) onSwitchOfficer();
                    else if (onLogout) onLogout();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold bg-[#FEF7EA] hover:bg-[#FDEFD3] text-[#92400E] border border-[#FCD34D] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4 text-[#EAA037]" />
                    <span>Switch Officer Persona</span>
                  </div>
                  <span className="text-[10px] font-mono">Gateway →</span>
                </button>

                {onLogout && (
                  <button
                    onClick={() => {
                      setRoleDropdownOpen(false);
                      onLogout();
                    }}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <LogOut className="h-4 w-4 text-rose-600" />
                      <span>Sign Out of CaseVault</span>
                    </div>
                  </button>
                )}
              </div>

              {/* Quick Switch List */}
              <div className="pt-2 border-t border-slate-100">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1 mb-1">
                  Quick Switch (Simulate)
                </p>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {Object.values(UserRole).map((role) => {
                    const user = MOCK_USERS[role];
                    if (!user) return null;
                    const isSelected = currentRole === role;
                    return (
                      <button
                        key={role}
                        onClick={() => {
                          setCurrentRole(role);
                          setRoleDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                          isSelected
                            ? "bg-[#FEF7EA] text-[#92400E] font-semibold"
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        }`}
                      >
                        <div className="text-left truncate pr-2">
                          <span className="truncate block font-medium">{role.replace(/_/g, " ")}</span>
                          <span className="text-[10px] text-slate-400 block truncate">{user.name}</span>
                        </div>
                        <span className="text-[9px] font-mono px-1 py-0.5 rounded bg-slate-100 text-slate-500 shrink-0">
                          {user.max_classification.substring(0, 4)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Exit / Sign Out Button */}
        <button
          onClick={() => {
            if (onLogout) onLogout();
            else setActiveView("rbac");
          }}
          className="p-2 rounded-xl text-slate-500 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-all"
          title="Sign Out / Switch Officer"
        >
          <LogOut className="h-4 w-4" />
        </button>

      </div>

    </header>
  );
};

