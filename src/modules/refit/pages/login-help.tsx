import { useState } from "react";
import { Link } from "react-router-dom";
import type { AppRole } from "@/modules/refit/lib/auth";

interface Account {
  email: string;
  role: AppRole;
  label: string;
  color: string;
}

const PASSWORD = "Storm-Y727-Refit-2026";

const ACCOUNTS: Account[] = [
  { email: "owner@storm.app", role: "owner", label: "Owner", color: "#1e3a5f" },
  { email: "captain@storm.app", role: "captain", label: "Captain", color: "#2d5a3d" },
  { email: "pm@storm.app", role: "project_manager", label: "Project Manager", color: "#8b5a2b" },
  { email: "hod@storm.app", role: "hod", label: "Head of Department", color: "#4a5568" },
  { email: "supplier@storm.app", role: "supplier", label: "Supplier", color: "#6b3a2a" },
  { email: "shore@storm.app", role: "shore_management", label: "Shore Management", color: "#1a4a6e" },
];

const ROLE_VIEW: Record<AppRole, { pages: string[]; notes: string[] }> = {
  owner: {
    pages: ["Dashboard", "Works", "Schedule", "Budget", "Snags", "Change Orders", "Approvals", "Reporting", "Audit Log", "Access Control", "Admin"],
    notes: ["Full read/write access to all modules", "Can approve change orders and budget revisions", "Can manage user roles and access", "Can preview other roles via the role switcher"],
  },
  captain: {
    pages: ["Dashboard", "Works", "Schedule", "Snags", "Crew", "Crew Requests", "Logistics", "Communications"],
    notes: ["Operational control of vessel-related works", "Can raise and assign snags", "Manages crew roster and requests", "Approves logistics and material requests"],
  },
  project_manager: {
    pages: ["Dashboard", "Works", "Schedule", "Budget", "Snags", "Change Orders", "Purchase Orders", "Invoices", "Contractors", "Suppliers", "Meetings", "Document Control"],
    notes: ["Day-to-day programme management", "Can create and edit works, snags, and schedules", "Manages POs, invoices, and contractor/supplier relationships", "Can preview other roles via the role switcher"],
  },
  hod: {
    pages: ["Dashboard", "Works (department scope)", "Snags", "Crew", "Crew Requests", "Inventory", "Communications"],
    notes: ["Department-level oversight of works and snags", "Can assign tasks to crew members", "Manages inventory for their department", "Raises crew requests for headcount or training"],
  },
  supplier: {
    pages: ["Purchase Orders (assigned)", "Invoices (assigned)", "Suppliers", "Communications"],
    notes: ["Sees only POs and invoices linked to their company", "Can update delivery status and upload certificates", "Limited read access — no vessel-wide data"],
  },
  shore_management: {
    pages: ["Dashboard", "Works", "Schedule", "Budget", "Snags", "Change Orders", "Approvals", "Reporting", "Audit Log", "Access Control", "Admin"],
    notes: ["Full read/write access to all modules", "Can approve change orders and budget revisions", "Can manage user roles and access", "Can preview other roles via the role switcher"],
  },
  // Fallbacks for other roles not in the main 6
  owner_rep: { pages: ["Dashboard", "Works", "Schedule", "Budget", "Snags", "Change Orders", "Reporting"], notes: ["Owner-side oversight with full read access", "Can comment and approve on behalf of owner"] },
  chief_officer: { pages: ["Dashboard", "Works", "Snags", "Crew", "Logistics"], notes: ["Assists captain with operations", "Can raise snags and manage crew logistics"] },
  chief_engineer: { pages: ["Dashboard", "Works (engineering)", "Snags", "Inventory", "Contractors"], notes: ["Engineering department oversight", "Manages technical contractors and spares inventory"] },
  purser: { pages: ["Dashboard", "Works (interior)", "Snags", "Crew", "Crew Requests", "Inventory"], notes: ["Interior department oversight", "Manages hospitality inventory and guest services"] },
  crew_member: { pages: ["Dashboard", "Works (assigned)", "Snags (assigned)"], notes: ["Sees only tasks and snags assigned to them", "Can update status and upload completion photos"] },
  yard_pm: { pages: ["Dashboard", "Works", "Schedule", "Snags", "Contractors", "Document Control"], notes: ["Yard-side project management", "Manages contractor scheduling and documentation"] },
  yard_trade_lead: { pages: ["Dashboard", "Works (trade scope)", "Snags (trade scope)", "Contractors"], notes: ["Trade-specific oversight (e.g. electrical, paint, interior)", "Manages trade contractors within their scope"] },
  contractor: { pages: ["Works (assigned)", "Snags (assigned)", "Drawings", "Communications"], notes: ["Sees only works and snags assigned to their firm", "Can upload progress photos and request drawing clarifications"] },
  finance_controller: { pages: ["Budget", "Invoices", "Purchase Orders", "Reporting"], notes: ["Financial oversight and approval workflow", "Can approve invoices and budget revisions"] },
  technical_manager: { pages: ["Dashboard", "Works", "Schedule", "Snags", "Change Orders", "Compliance", "Reporting"], notes: ["Technical oversight across all disciplines", "Can approve change orders and compliance items"] },
  class_surveyor: { pages: ["Compliance", "Drawings", "Works (relevant scope)", "Snags (relevant scope)"], notes: ["Class society surveyor access", "Can view and sign off on compliance items and drawings"] },
  flag_surveyor: { pages: ["Compliance", "Works (relevant scope)", "Snags (relevant scope)"], notes: ["Flag state surveyor access", "Can view and sign off on compliance items"] },
  auditor: { pages: ["Audit Log", "Reporting", "Compliance"], notes: ["Read-only access for audits", "Can export reports and view audit trails"] },
  guest: { pages: ["Dashboard (limited)"], notes: ["Read-only access to high-level programme status", "No access to budget, snags, or sensitive documents"] },
};

function LoginHelpPage() {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-dvh bg-paper">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8">
          <Link
            to="/auth"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-ink transition"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back to sign in
          </Link>
          <h1 className="font-semibold mt-4 mb-1">Login &amp; Seed Data Help</h1>
          <p className="text-sm text-muted-foreground">
            Test accounts, passwords, and what each role will see when signed in.
          </p>
        </div>

        {/* Shared password */}
        <section className="border border-black/10 rounded-sm overflow-hidden mb-8">
          <div className="bg-navy text-white px-4 py-3 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-medium">Shared Password</span>
            <button
              onClick={() => copy(PASSWORD, "password")}
              className="text-xs bg-white/10 hover:bg-white/20 px-2 py-1 rounded-sm transition"
            >
              {copied === "password" ? "Copied!" : "Copy"}
            </button>
          </div>
          <div className="p-4 bg-white">
            <code className="font-mono text-sm text-ink">{PASSWORD}</code>
            <p className="text-xs text-muted-foreground mt-2">
              All test accounts below use this single password. Click any email to copy it, or use the
              account buttons on the sign-in page to auto-fill.
            </p>
          </div>
        </section>

        {/* Account cards */}
        <div className="space-y-4 mb-10">
          <h2 className="text-sm uppercase tracking-wider text-muted-foreground font-medium">Test Accounts</h2>
          {ACCOUNTS.map((a) => {
            const view = ROLE_VIEW[a.role];
            return (
              <div key={a.email} className="border border-black/10 rounded-sm overflow-hidden bg-white">
                <div className="flex items-stretch">
                  <div
                    className="w-1.5 shrink-0"
                    style={{ backgroundColor: a.color }}
                  />
                  <div className="flex-1 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-flex items-center justify-center size-6 rounded-full text-[10px] font-bold text-white"
                          style={{ backgroundColor: a.color }}
                        >
                          {a.label.charAt(0)}
                        </span>
                        <span className="font-medium text-sm">{a.label}</span>
                      </div>
                      <button
                        onClick={() => copy(a.email, a.email)}
                        className="text-xs px-2 py-1 border border-black/10 rounded-sm hover:bg-secondary transition"
                      >
                        {copied === a.email ? "Copied!" : "Copy email"}
                      </button>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Email</div>
                        <code className="font-mono text-xs text-ink">{a.email}</code>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Role code</div>
                        <code className="font-mono text-xs text-ink">{a.role}</code>
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-black/5">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">What this role sees</div>
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {view.pages.map((p) => (
                          <span
                            key={p}
                            className="text-[10px] px-1.5 py-0.5 bg-secondary rounded-sm text-ink"
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                      <ul className="space-y-1">
                        {view.notes.map((n, i) => (
                          <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                            <span className="mt-1 size-1 rounded-full bg-ocean shrink-0" />
                            {n}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Role preview tip */}
        <section className="border border-amber-200 bg-amber-50 rounded-sm p-4 mb-8">
          <div className="flex items-start gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-600 shrink-0 mt-0.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div>
              <div className="text-sm font-medium text-amber-800">Role Preview (Owner / PM / Shore only)</div>
              <p className="text-xs text-amber-700 mt-1">
                If you sign in as <strong>Owner</strong>, <strong>Project Manager</strong>, or{" "}
                <strong>Shore Management</strong>, a role switcher appears in the sidebar. Use it to preview
                the UI as Captain, HOD, or Supplier without signing out. Your real account permissions still
                apply to data — only the navigation and banners change.
              </p>
            </div>
          </div>
        </section>

        {/* Tips */}
        <section className="border border-black/10 rounded-sm overflow-hidden bg-white mb-8">
          <div className="bg-secondary/60 px-4 py-2 text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-semibold">
            Quick Tips
          </div>
          <div className="p-4 space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 size-1.5 rounded-full bg-ocean shrink-0" />
              <span>
                On the sign-in page, click any test account button to auto-fill the email and password.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 size-1.5 rounded-full bg-ocean shrink-0" />
              <span>
                If an account does not exist yet, signing in will auto-provision it with the correct role
                and vessel assignment.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 size-1.5 rounded-full bg-ocean shrink-0" />
              <span>
                Use the <strong>Verify account</strong> button on the sign-in page to check credentials
                without actually logging in.
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-0.5 size-1.5 rounded-full bg-ocean shrink-0" />
              <span>
                If you get stuck on <em>"Verifying session…"</em>, open{" "}
                <Link to="/yard/refit/session-diagnostics" className="underline text-navy">
                  Session Diagnostics
                </Link>{" "}
                to troubleshoot.
              </span>
            </div>
          </div>
        </section>

        {/* Google OAuth note */}
        <section className="border border-black/10 rounded-sm overflow-hidden bg-white">
          <div className="bg-secondary/60 px-4 py-2 text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-semibold">
            Google OAuth
          </div>
          <div className="p-4 text-sm">
            <p className="text-muted-foreground">
              You can also sign in with Google. After your first OAuth sign-in, an admin can assign you a
              role via <strong>Access Control</strong>. Until a role is assigned, you will see the guest
              read-only view.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
