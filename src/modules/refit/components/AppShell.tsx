import { Link, useLocation, useNavigate  } from "react-router-dom";
import { ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, ROLE_LABEL } from "@/modules/refit/lib/auth";
import { VesselSwitcher } from "@/modules/refit/components/VesselSwitcher";
import { RolePreviewSwitcher, RolePreviewBanner } from "@/modules/refit/components/RolePreviewSwitcher";
import { runAccessCheck, saveAccessCheck } from "@/modules/refit/lib/accessCheck";

const NAV_GROUPS: ReadonlyArray<{
  label: string;
  items: ReadonlyArray<{ to: string; label: string }>;
}> = [
  {
    label: "Overview",
    items: [
      { to: "/", label: "Dashboard" },
      { to: "/approvals", label: "Approvals Centre" },
      { to: "/notifications", label: "Notifications" },
      { to: "/search", label: "Search" },
    ],
  },
  {
    label: "Workflow",
    items: [
      { to: "/change-orders", label: "Change Orders" },
      { to: "/crew-requests", label: "Crew Requests" },
      { to: "/snags", label: "Snags & Warranty" },
      { to: "/works", label: "Works Orders" },
      { to: "/meetings", label: "Meetings" },
      { to: "/risks", label: "Risk Register" },
    ],
  },
  {
    label: "Project",
    items: [
      { to: "/schedule", label: "Schedule" },
      { to: "/logistics", label: "Logistics" },
      { to: "/inventory", label: "Inventory & Equipment" },
      { to: "/contractors", label: "Contractors & Suppliers" },
    ],
  },
  {
    label: "Documents",
    items: [
      { to: "/drawings", label: "Drawings & Plans" },
      { to: "/document-control", label: "Document Control" },
      { to: "/files", label: "Files" },
    ],
  },
  {
    label: "Finance",
    items: [
      { to: "/budget", label: "Budget" },
      { to: "/purchase-orders", label: "Purchase Orders" },
      { to: "/invoices", label: "Invoices" },
    ],
  },
  {
    label: "Compliance",
    items: [
      { to: "/compliance", label: "Compliance" },
      { to: "/crew", label: "Crew & Certification" },
      { to: "/audit-log", label: "Audit Log" },
      { to: "/reporting", label: "Reporting" },
    ],
  },
  {
    label: "Account",
    items: [
      { to: "/access", label: "Access Profile" },
      { to: "/communications", label: "Communications" },
      { to: "/session-diagnostics", label: "Diagnostics" },
      { to: "/access-check", label: "Access Check" },
    ],
  },
];

const ADMIN_NAV = [
  { to: "/admin", label: "Admin & Settings" },
  { to: "/import", label: "Import & API" },
  { to: "/login-diagnostics", label: "Login Diagnostics" },
] as const;

const ADMIN_ROLES = ["owner", "shore_management", "project_manager"] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, role, realRole } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const lastCheckedKey = useRef<string | null>(null);

  // Automated RLS / role-access check that runs once per signed-in session.
  // Probes the core tables, persists the result, and toasts if anything is
  // unexpectedly blocked so admins notice misconfigured policies immediately.
  useEffect(() => {
    if (!user?.id || !realRole) return;
    const key = `${user.id}:${realRole}`;
    if (lastCheckedKey.current === key) return;
    lastCheckedKey.current = key;
    let cancelled = false;
    (async () => {
      const result = await runAccessCheck(realRole);
      if (cancelled) return;
      saveAccessCheck(result);
      if (!result.ok) {
        const blocked = result.problems.filter((p) => p.rlsBlocked).length;
        toast.error(
          `Access check: ${result.problems.length} issue${result.problems.length === 1 ? "" : "s"}${blocked ? ` (${blocked} blocked by RLS)` : ""}`,
          {
            description: result.problems.slice(0, 3).map((p) => p.table).join(", ") +
              (result.problems.length > 3 ? "…" : ""),
            action: { label: "View", onClick: () => navigate({ to: "/access-check" }) },
            duration: 10000,
          },
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, realRole, navigate]);


  // Close mobile nav whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  const isAdmin = !!role && (ADMIN_ROLES as readonly string[]).includes(role);

  const navItems = (onClick?: () => void) => (
    <>
      <div className="pb-3 mb-3 border-b border-white/10 space-y-3">
        <VesselSwitcher />
        <RolePreviewSwitcher />
      </div>
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="pb-2">
          <div className="px-3 py-1.5 text-[10px] tracking-[0.2em] uppercase text-ocean/70">
            {group.label}
          </div>
          {group.items.map((item) => {
            const active =
              location.pathname === item.to ||
              (item.to !== "/" && location.pathname.startsWith(item.to));
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onClick}
                className={`block px-3 py-1.5 rounded-sm transition ${active ? "bg-white/10 text-white" : "text-white/60 hover:text-white hover:bg-white/5"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
      {isAdmin && (
        <div className="pt-3 mt-3 border-t border-white/10">
          <div className="px-3 pb-1.5 text-[10px] tracking-[0.2em] uppercase text-ocean/70">
            Admin
          </div>
          {ADMIN_NAV.map((item) => {
            const active = location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={onClick}
                className={`block px-3 py-1.5 rounded-sm transition ${active ? "bg-white/10 text-white" : "text-white/60 hover:text-white hover:bg-white/5"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );

  const userBlock = (
    <div className="mt-6 pt-4 border-t border-white/10 text-xs">
      <div className="text-white/90 truncate">{user?.email}</div>
      <div className="text-white/50 mt-0.5">{role ? ROLE_LABEL[role] : "No role assigned"}</div>
      <button onClick={signOut} className="mt-3 text-ocean hover:text-white text-xs">
        Sign out
      </button>
    </div>
  );

  return (
    <div className="flex min-h-dvh w-full bg-paper text-ink">
      {/* Desktop sidebar */}
      <nav className="hidden md:flex w-60 bg-navy text-white p-5 shrink-0 flex-col">
        <div className="text-xs tracking-[0.25em] uppercase text-ocean mb-10 font-semibold">
          OCEANCOS // REFIT
        </div>
        <div className="flex-1 space-y-1 text-sm overflow-y-auto">{navItems()}</div>
        {userBlock}
      </nav>

      {/* Mobile column: top bar + content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <header className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-3 bg-navy text-white px-4 h-12 border-b border-white/10">
          <div className="text-[10px] tracking-[0.25em] uppercase text-ocean font-semibold truncate">
            OCEANCOS // REFIT
          </div>
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation menu"
            className="inline-flex items-center justify-center size-9 -mr-2 rounded-sm hover:bg-white/10"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </header>

        <main className="flex-1 min-w-0 w-full">
          <RolePreviewBanner />
          {children}
        </main>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <button
            aria-label="Close navigation menu"
            onClick={() => setMobileOpen(false)}
            className="flex-1 bg-black/50"
          />
          <nav className="w-72 max-w-[85vw] bg-navy text-white p-5 flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <div className="text-xs tracking-[0.25em] uppercase text-ocean font-semibold">
                OCEANCOS // REFIT
              </div>
              <button
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation menu"
                className="inline-flex items-center justify-center size-8 rounded-sm hover:bg-white/10"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden
                >
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="6" y1="18" x2="18" y2="6" />
                </svg>
              </button>
            </div>
            <div className="flex-1 space-y-1 text-sm overflow-y-auto">
              {navItems(() => setMobileOpen(false))}
            </div>
            {userBlock}
          </nav>
        </div>
      )}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 mb-6 sm:mb-8 pb-4 sm:pb-5 border-b border-black/10">
      <div className="min-w-0 flex-1">
        <h1 className="font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {action && <div className="flex flex-wrap gap-2 shrink-0">{action}</div>}
    </header>
  );
}
