import React, { useState } from "react";
import {
  Shield,
  Lock,
  CheckCircle2,
  KeyRound,
  ArrowRight,
  UserCheck,
  Building2,
  Info,
  Fingerprint,
} from "lucide-react";
import { UserRole, ClassificationLevel } from "../types";
import { MOCK_USERS } from "../api/mockData";

interface AuthGateProps {
  onAuthenticate: (role: UserRole) => void;
  initialRole?: UserRole;
}

const ROLE_DETAILS: Record<
  UserRole,
  {
    title: string;
    category: "admin" | "enforcement" | "judicial" | "forensic";
    description: string;
    primaryPermissions: string[];
    accentColor: string;
    pin: string;
  }
> = {
  [UserRole.SUPER_ADMIN]: {
    title: "Super Admin",
    category: "admin",
    description: "System & security policy root administrator with unrestricted access to all classified dockets.",
    primaryPermissions: ["Full Root Access", "WORM Storage Management", "Audit Ledger Oversight", "System Config"],
    accentColor: "from-amber-500/20 to-rose-500/20 border-amber-500/40 text-amber-400",
    pin: "9012",
  },
  [UserRole.DEPT_ADMIN]: {
    title: "Department Admin",
    category: "admin",
    description: "Police headquarters administrator overseeing department users, storage quotas, and security clearance allocations.",
    primaryPermissions: ["User & Role Provisioning", "Department Quotas", "Policy Enforcement", "Access Review"],
    accentColor: "from-blue-500/20 to-indigo-500/20 border-blue-500/40 text-blue-400",
    pin: "2041",
  },
  [UserRole.INVESTIGATING_OFFICER]: {
    title: "Investigating Officer",
    category: "enforcement",
    description: "Frontline investigator leading cyber crime cases, evidence uploads, and Section 65B statutory certificate filings.",
    primaryPermissions: ["FIR Evidence Ingestion", "Section 65B Certification", "Chain of Custody Tracking", "Case Docket CRUD"],
    accentColor: "from-amber-500/20 to-orange-500/20 border-amber-500/40 text-amber-400",
    pin: "4421",
  },
  [UserRole.SUPERVISOR]: {
    title: "Supervisor (ACP)",
    category: "enforcement",
    description: "Assistant Commissioner of Police managing statutory charge sheet approvals, SLA timers, and escalation reviews.",
    primaryPermissions: ["Charge Sheet Sign-Off", "Workflow Approval Pipelines", "SLA Escalation Action", "Multi-Dept Access"],
    accentColor: "from-emerald-500/20 to-teal-500/20 border-emerald-500/40 text-emerald-400",
    pin: "1088",
  },
  [UserRole.PROSECUTOR]: {
    title: "Prosecutor",
    category: "judicial",
    description: "District prosecution legal counsel reviewing witness testimonies, court orders, and court-ready certified exhibits.",
    primaryPermissions: ["Court Filing Review", "Trial Evidence Verification", "Section 65B Certificate Export", "Redacted Previews"],
    accentColor: "from-rose-500/20 to-pink-500/20 border-rose-500/40 text-rose-400",
    pin: "7731",
  },
  [UserRole.FORENSIC_ANALYST]: {
    title: "Forensic Analyst",
    category: "forensic",
    description: "State Forensic Science Laboratory analyst performing SHA-256 cryptographic extraction, hashing, and digital forensic reports.",
    primaryPermissions: ["SHA-256 Hash Auditing", "Forensic Report Ingestion", "Cryptographic Verification", "Technical Exhibits"],
    accentColor: "from-cyan-500/20 to-blue-500/20 border-cyan-500/40 text-cyan-400",
    pin: "3309",
  },
  [UserRole.AUDITOR]: {
    title: "Judicial Auditor",
    category: "judicial",
    description: "Independent oversight auditor verifying immutable WORM storage integrity and statutory compliance under the Evidence Act.",
    primaryPermissions: ["Tamper-Evident Ledger Audit", "Compliance Certification", "Cryptographic Log Inspection", "Read-Only Inspection"],
    accentColor: "from-purple-500/20 to-indigo-500/20 border-purple-500/40 text-purple-400",
    pin: "5520",
  },
  [UserRole.COURT_CLERK]: {
    title: "Court Clerk",
    category: "judicial",
    description: "District court registrar registering judicial dockets, bail hearings, and public record filings.",
    primaryPermissions: ["Docket Registration", "Judicial Orders Logging", "Bail Order Indexing", "Restricted Case Intake"],
    accentColor: "from-slate-500/20 to-slate-400/20 border-slate-500/40 text-slate-300",
    pin: "1102",
  },
  [UserRole.EXTERNAL_COUNSEL]: {
    title: "External Legal Counsel",
    category: "judicial",
    description: "Defense or special public prosecutor granted time-boxed, strictly redacted discovery access to specific trial records.",
    primaryPermissions: ["Time-Boxed Access", "Auto-Redacted Disclosures", "Trial File Review", "Restricted Export"],
    accentColor: "from-amber-600/20 to-yellow-600/20 border-yellow-600/40 text-yellow-300",
    pin: "8001",
  },
};

const CLASSIFICATION_BADGE: Record<ClassificationLevel, { bg: string; text: string; border: string }> = {
  [ClassificationLevel.UNCLASSIFIED]: { bg: "bg-emerald-950/60", text: "text-emerald-400", border: "border-emerald-600/50" },
  [ClassificationLevel.RESTRICTED]:   { bg: "bg-amber-950/60",   text: "text-amber-400",   border: "border-amber-600/50" },
  [ClassificationLevel.CONFIDENTIAL]: { bg: "bg-orange-950/60",  text: "text-orange-400",  border: "border-orange-600/50" },
  [ClassificationLevel.SECRET]:       { bg: "bg-rose-950/60",    text: "text-rose-400",    border: "border-rose-600/50" },
};

export const AuthGate: React.FC<AuthGateProps> = ({
  onAuthenticate,
  initialRole = UserRole.INVESTIGATING_OFFICER,
}) => {
  const [selectedRole, setSelectedRole] = useState<UserRole>(initialRole);
  const [activeCategory, setActiveCategory] = useState<"all" | "admin" | "enforcement" | "judicial" | "forensic">("all");
  const [enteredPin, setEnteredPin] = useState<string>("");
  const [rememberSession, setRememberSession] = useState<boolean>(true);
  const [authStage, setAuthStage] = useState<"idle" | "verifying" | "success">("idle");
  const [statusMessage, setStatusMessage] = useState<string>("");

  const selectedUser = MOCK_USERS[selectedRole];
  const roleMeta = ROLE_DETAILS[selectedRole];
  const classStyle = CLASSIFICATION_BADGE[selectedUser.max_classification];

  const filteredRoles = Object.values(UserRole).filter((role) => {
    if (activeCategory === "all") return true;
    return ROLE_DETAILS[role].category === activeCategory;
  });

  function handleSelectRole(role: UserRole) {
    setSelectedRole(role);
    setEnteredPin("");
  }

  function handleLogin(roleToLogin: UserRole = selectedRole) {
    setAuthStage("verifying");
    setStatusMessage("Establishing cryptographically signed session...");

    setTimeout(() => {
      setStatusMessage(`Verifying ${selectedUser.badge_id} clearance (${selectedUser.max_classification})...`);
    }, 300);

    setTimeout(() => {
      setStatusMessage("Integrity check passed. Securing session in tamper-evident ledger...");
      setAuthStage("success");
    }, 650);

    setTimeout(() => {
      if (rememberSession) {
        localStorage.setItem("casevault_auth_role", roleToLogin);
      }
      onAuthenticate(roleToLogin);
    }, 1000);
  }

  return (
    <div className="min-h-screen bg-[#0E161C] text-slate-100 flex flex-col justify-between selection:bg-[#EAA037] selection:text-slate-900 font-sans relative overflow-x-hidden">
      
      {/* Background Ambient Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-gradient-to-b from-[#EAA037]/10 via-[#152736]/20 to-transparent blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[300px] bg-blue-900/10 blur-3xl pointer-events-none" />

      {/* ── Top Header / Branding ── */}
      <header className="relative z-10 border-b border-[#212E38]/80 bg-[#0E161C]/80 backdrop-blur-md px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#EAA037] to-[#C98020] flex items-center justify-center text-[#0E161C] shadow-lg shadow-[#EAA037]/20 ring-1 ring-[#EAA037]/40">
              <Shield className="h-5 w-5 fill-[#0E161C]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-serif text-xl font-bold tracking-tight text-white">
                  Case<span className="text-[#EAA037]">Vault</span>
                </span>
                <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-[#182733] border border-[#2B3E50] text-[#EAA037] font-semibold uppercase tracking-wider">
                  STATUTORY SECURE GATEWAY
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Tamper-Evident Legal Document Management & Section 65B Audit System
              </p>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5 text-slate-400 bg-[#141F28] px-3 py-1.5 rounded-lg border border-[#212E38]">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-mono text-[11px]">NODE 04 ACTIVE • SHA-256 LEDGER LIVE</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Main Authentication Content ── */}
      <main className="relative z-10 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 flex-1 flex flex-col justify-center">
        
        {/* Title & Directive */}
        <div className="text-center max-w-3xl mx-auto mb-8 space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#182633] border border-[#263C50] text-[#EAA037] text-xs font-semibold">
            <Fingerprint className="h-3.5 w-3.5" />
            <span>Identify & Authenticate Officer Clearance</span>
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-serif text-white tracking-tight">
            Who is accessing the repository?
          </h1>
          <p className="text-sm sm:text-base text-slate-400 max-w-2xl mx-auto">
            CaseVault requires role authentication before entering judicial dockets. Select your official identity below to authenticate with corresponding statutory clearance.
          </p>
        </div>

        {/* Category Filters */}
        <div className="flex items-center justify-center gap-1.5 mb-6 flex-wrap">
          {[
            { id: "all", label: "All Officer Personas" },
            { id: "admin", label: "Administrators" },
            { id: "enforcement", label: "Police & Enforcement" },
            { id: "judicial", label: "Judicial & Prosecution" },
            { id: "forensic", label: "Forensic & Audit" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveCategory(tab.id as any)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeCategory === tab.id
                  ? "bg-[#EAA037] text-[#0E161C] shadow-md shadow-[#EAA037]/20"
                  : "bg-[#141F28] text-slate-400 hover:text-white border border-[#212E38] hover:border-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Main Grid: Officer Cards (Left 2 cols) + Authentication Control Panel (Right col) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Officer Identity Cards */}
          <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {filteredRoles.map((role) => {
              const user = MOCK_USERS[role];
              const meta = ROLE_DETAILS[role];
              const isSelected = selectedRole === role;
              const badgeStyle = CLASSIFICATION_BADGE[user.max_classification];

              return (
                <div
                  key={role}
                  onClick={() => handleSelectRole(role)}
                  className={`group relative rounded-2xl p-4 cursor-pointer transition-all border text-left flex flex-col justify-between ${
                    isSelected
                      ? "bg-[#16232D] border-[#EAA037] ring-1 ring-[#EAA037]/60 shadow-xl shadow-[#EAA037]/10"
                      : "bg-[#121B23]/90 hover:bg-[#16232D]/70 border-[#212E38] hover:border-slate-600 shadow-sm"
                  }`}
                >
                  {/* Top: Avatar, Role Name, Clearance Badge */}
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-10 w-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 border ${
                            isSelected
                              ? "bg-[#EAA037] text-[#0E161C] border-[#EAA037]"
                              : "bg-[#182633] text-slate-200 border-[#2B3E50] group-hover:border-[#EAA037]/50"
                          }`}
                        >
                          {user.name.charAt(0)}
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-white group-hover:text-[#EAA037] transition-colors">
                            {meta.title}
                          </h3>
                          <p className="text-xs text-slate-300 font-medium">
                            {user.name}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={`text-[9px] font-mono px-2 py-0.5 rounded-md font-bold uppercase tracking-wider border ${badgeStyle.bg} ${badgeStyle.text} ${badgeStyle.border}`}
                        >
                          {user.max_classification}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">
                          {user.badge_id}
                        </span>
                      </div>
                    </div>

                    {/* Department */}
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-2">
                      <Building2 className="h-3 w-3 text-slate-500 shrink-0" />
                      <span className="truncate">{user.department}</span>
                    </div>

                    {/* Description */}
                    <p className="text-[11px] text-slate-400 leading-relaxed mb-3 line-clamp-2">
                      {meta.description}
                    </p>
                  </div>

                  {/* Bottom: Permissions tags & Selection status */}
                  <div className="pt-2.5 border-t border-[#1F2C37] flex items-center justify-between">
                    <div className="flex items-center gap-1 flex-wrap">
                      {meta.primaryPermissions.slice(0, 2).map((perm, idx) => (
                        <span
                          key={idx}
                          className="text-[9px] bg-[#172531] border border-[#233545] text-slate-300 px-1.5 py-0.5 rounded font-mono"
                        >
                          {perm}
                        </span>
                      ))}
                    </div>

                    <div className="flex items-center gap-1 text-xs">
                      {isSelected ? (
                        <span className="inline-flex items-center gap-1 text-[#EAA037] font-semibold text-[11px]">
                          <UserCheck className="h-3.5 w-3.5" /> Selected
                        </span>
                      ) : (
                        <span className="text-slate-500 group-hover:text-slate-300 text-[11px]">
                          Select →
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Column: Authenticate Control Terminal */}
          <div className="lg:col-span-4">
            <div className="sticky top-6 rounded-2xl border border-[#263644] bg-[#131E27] p-5 shadow-2xl relative overflow-hidden">
              
              <div className="flex items-center justify-between pb-3.5 border-b border-[#212E38] mb-4">
                <div className="flex items-center gap-2">
                  <KeyRound className="h-4 w-4 text-[#EAA037]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    Authentication Terminal
                  </span>
                </div>
                <span className="text-[10px] font-mono text-[#EAA037] bg-[#EAA037]/10 px-2 py-0.5 rounded border border-[#EAA037]/20">
                  READY
                </span>
              </div>

              {/* Active Selected Card Preview */}
              <div className="rounded-xl border border-[#212E38] bg-[#0E161C] p-4 space-y-3 mb-4">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-mono tracking-wider">
                      Selected Official Identity
                    </span>
                    <h4 className="text-base font-bold text-white mt-0.5">
                      {selectedUser.name}
                    </h4>
                    <p className="text-xs font-semibold text-[#EAA037]">
                      {roleMeta.title}
                    </p>
                  </div>
                  <span
                    className={`text-[9px] font-mono px-2 py-0.5 rounded font-bold uppercase border ${classStyle.bg} ${classStyle.text} ${classStyle.border}`}
                  >
                    {selectedUser.max_classification}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#1C2833] text-xs">
                  <div>
                    <span className="text-[10px] text-slate-500 block">BADGE ID</span>
                    <span className="font-mono text-slate-200 font-semibold">{selectedUser.badge_id}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block">DEPARTMENT</span>
                    <span className="text-slate-300 truncate block">{selectedUser.department}</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-[#1C2833] text-xs">
                  <span className="text-[10px] text-slate-500 block mb-1">STATUTORY SCOPE</span>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    {roleMeta.description}
                  </p>
                </div>
              </div>

              {/* PIN / Quick Passcode Input */}
              <div className="space-y-3 mb-4">
                <div className="flex items-center justify-between text-xs">
                  <label className="text-slate-300 font-medium flex items-center gap-1.5">
                    <Lock className="h-3.5 w-3.5 text-slate-400" />
                    Officer Security PIN
                  </label>
                  <button
                    type="button"
                    onClick={() => setEnteredPin(roleMeta.pin)}
                    className="text-[11px] text-[#EAA037] hover:underline font-mono"
                  >
                    Auto-Fill PIN ({roleMeta.pin})
                  </button>
                </div>

                <div className="relative">
                  <input
                    type="password"
                    maxLength={6}
                    value={enteredPin}
                    onChange={(e) => setEnteredPin(e.target.value)}
                    placeholder={`Enter PIN or click Auto-Fill (${roleMeta.pin})`}
                    className="w-full h-11 px-3.5 rounded-xl bg-[#0E161C] border border-[#2B3C4B] text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#EAA037]/50 focus:border-[#EAA037] font-mono text-sm tracking-wider"
                  />
                  <div className="absolute right-3 top-3">
                    <KeyRound className="h-4 w-4 text-slate-500 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Remember session checkbox */}
              <div className="flex items-center gap-2 mb-5 text-xs text-slate-400">
                <input
                  type="checkbox"
                  id="remember-session"
                  checked={rememberSession}
                  onChange={(e) => setRememberSession(e.target.checked)}
                  className="rounded border-[#2B3C4B] bg-[#0E161C] text-[#EAA037] focus:ring-[#EAA037]/40 h-3.5 w-3.5"
                />
                <label htmlFor="remember-session" className="cursor-pointer select-none">
                  Remember officer identity in this browser session
                </label>
              </div>

              {/* Authenticate Action Button */}
              <button
                type="button"
                disabled={authStage !== "idle"}
                onClick={() => handleLogin(selectedRole)}
                className="w-full py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 bg-gradient-to-r from-[#EAA037] to-[#D68B25] hover:from-[#F0AC49] hover:to-[#EAA037] text-[#0E161C] shadow-lg shadow-[#EAA037]/25 transition-all active:scale-[0.98] disabled:opacity-50 cursor-pointer"
              >
                {authStage === "idle" ? (
                  <>
                    <span>Authenticate as {roleMeta.title}</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                ) : (
                  <>
                    <span className="h-4 w-4 border-2 border-[#0E161C] border-t-transparent rounded-full animate-spin" />
                    <span>Authenticating...</span>
                  </>
                )}
              </button>

              {/* Quick 1-Click Alternate button for demo/convenience */}
              <button
                type="button"
                disabled={authStage !== "idle"}
                onClick={() => handleLogin(selectedRole)}
                className="w-full mt-2 py-2 text-center text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                Instant 1-Click Access (Bypass PIN)
              </button>

              {/* Statutory Warning Box */}
              <div className="mt-4 pt-3 border-t border-[#1F2C37] flex items-start gap-2 text-[10px] text-slate-500 leading-tight">
                <Info className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span>
                  Official Government & Judicial System. All logins and file accesses generate Section 65B certified audit logs.
                </span>
              </div>

            </div>
          </div>

        </div>

      </main>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-[#1C2833] py-4 bg-[#0A1014] text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Shield className="h-3.5 w-3.5 text-[#EAA037]" />
            <span className="font-semibold text-slate-400">CaseVault Statutory Security Core</span>
          </div>
          <span className="font-mono text-[11px] text-slate-500">
            Section 65B Indian Evidence Act • WORM Storage Policy • RBAC Clearance Level 1-4
          </span>
        </div>
      </footer>

      {/* ── High-Tech Modal Overlay when Authenticating ── */}
      {authStage !== "idle" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="max-w-md w-full mx-4 rounded-2xl border border-[#2B3E50] bg-[#121B23] p-6 shadow-2xl space-y-4 text-center">
            
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-[#EAA037] to-[#C98020] text-[#0E161C] flex items-center justify-center mx-auto shadow-xl shadow-[#EAA037]/20">
              {authStage === "verifying" ? (
                <Shield className="h-7 w-7 animate-pulse" />
              ) : (
                <CheckCircle2 className="h-7 w-7" />
              )}
            </div>

            <div>
              <h3 className="text-lg font-bold text-white">
                {authStage === "verifying" ? "Authenticating Clearance" : "Access Granted"}
              </h3>
              <p className="text-xs text-slate-400 mt-1 font-mono">
                {statusMessage}
              </p>
            </div>

            {/* Officer details pill */}
            <div className="rounded-xl bg-[#0E161C] border border-[#212E38] p-3 text-left flex items-center justify-between text-xs">
              <div>
                <p className="font-bold text-white">{selectedUser.name}</p>
                <p className="text-[11px] text-slate-400">{roleMeta.title} • {selectedUser.department}</p>
              </div>
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold border ${classStyle.bg} ${classStyle.text} ${classStyle.border}`}>
                {selectedUser.max_classification}
              </span>
            </div>

            {/* Loading progress bar */}
            <div className="w-full bg-[#1A2633] h-1.5 rounded-full overflow-hidden">
              <div
                className={`h-full bg-gradient-to-r from-[#EAA037] to-emerald-400 transition-all duration-700 ${
                  authStage === "success" ? "w-full" : "w-2/3 animate-pulse"
                }`}
              />
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default AuthGate;
