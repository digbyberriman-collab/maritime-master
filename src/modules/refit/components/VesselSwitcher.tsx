import { useState } from "react";
import { useActiveVessel } from "@/modules/refit/lib/activeVessel";
import { useAuth, ROLE_LABEL } from "@/modules/refit/lib/auth";

const ADMIN_ROLES = ["owner", "shore_management"] as const;

function useIsVesselAdmin() {
  const { role } = useAuth();
  return !!role && (ADMIN_ROLES as readonly string[]).includes(role);
}

/**
 * Sidebar (dark) variant.
 * - Admins see a working <select> to switch the active vessel.
 * - Non-admins see a read-only label + a small "Switch" affordance that
 *   surfaces an access-denied message explaining why they can't change it.
 */
export function VesselSwitcher({ compact = false }: { compact?: boolean }) {
  const { role } = useAuth();
  const { vessels, activeVesselId, activeVessel, setActiveVesselId, loading } = useActiveVessel();
  const isAdmin = useIsVesselAdmin();
  const [denied, setDenied] = useState(false);

  if (loading) {
    return <div className="text-[11px] text-white/40 px-3 py-1.5">Loading vessels…</div>;
  }
  if (vessels.length === 0) {
    return <div className="text-[11px] text-white/40 px-3 py-1.5">No vessels found</div>;
  }

  const wrapperCls = compact ? "" : "px-3";

  if (!isAdmin) {
    const label = activeVessel
      ? `${activeVessel.name}${activeVessel.hull_number ? ` — ${activeVessel.hull_number}` : ""}`
      : "—";
    return (
      <div className={wrapperCls}>
        <div className="block text-[10px] tracking-[0.2em] uppercase text-ocean/70 mb-1.5">
          Active Vessel
        </div>
        <button
          type="button"
          onClick={() => setDenied((d) => !d)}
          aria-expanded={denied}
          className="w-full text-left bg-white/5 border border-white/10 text-white text-xs rounded-sm px-2 py-1.5 flex items-center justify-between gap-2 hover:bg-white/10 focus:outline-none focus:ring-1 focus:ring-ocean"
          title="Switching vessels is restricted"
        >
          <span className="truncate">{label}</span>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden
            className="text-white/40 shrink-0"
          >
            <rect x="4" y="10" width="16" height="10" rx="1" />
            <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          </svg>
        </button>
        {denied && (
          <div
            role="alert"
            className="mt-2 text-[11px] leading-snug rounded-sm border border-warning/30 bg-warning/10 text-warning px-2 py-1.5"
          >
            <div className="font-semibold mb-0.5">Access denied</div>
            <div className="text-white/70">
              Your role ({role ? ROLE_LABEL[role] : "unassigned"}) can't switch the active vessel.
              Ask an Owner or Shore Management to change context for you.
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={wrapperCls}>
      <label
        htmlFor="vessel-switcher"
        className="block text-[10px] tracking-[0.2em] uppercase text-ocean/70 mb-1.5"
      >
        Active Vessel
      </label>
      <select
        id="vessel-switcher"
        value={activeVesselId ?? ""}
        onChange={(e) => setActiveVesselId(e.target.value)}
        className="w-full bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs rounded-sm px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-ocean"
        aria-label="Switch active vessel"
      >
        {vessels.map((v) => (
          <option key={v.id} value={v.id} className="bg-navy text-white">
            {v.name}
            {v.hull_number ? ` — ${v.hull_number}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Page-level (light) variant. Admin-only — renders nothing for other roles.
 */
export function ActiveVesselBar() {
  const isAdmin = useIsVesselAdmin();
  const { vessels, activeVesselId, activeVessel, setActiveVesselId, loading } = useActiveVessel();

  if (!isAdmin) return null;

  return (
    <section
      aria-label="Active vessel selector"
      className="bg-white border border-black/10 rounded-sm px-4 py-3 mb-6 flex flex-wrap items-center gap-x-6 gap-y-3"
    >
      <div className="min-w-0 flex-1">
        <div className="text-[10px] tracking-[0.2em] uppercase text-muted-foreground">
          Active Vessel
        </div>
        <div className="text-sm font-semibold text-ink truncate">
          {loading
            ? "Loading…"
            : activeVessel
              ? `${activeVessel.name}${activeVessel.hull_number ? ` — ${activeVessel.hull_number}` : ""}`
              : "No vessel selected"}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <label
          htmlFor="active-vessel-bar"
          className="text-xs text-muted-foreground hidden sm:inline"
        >
          Switch to
        </label>
        <select
          id="active-vessel-bar"
          value={activeVesselId ?? ""}
          onChange={(e) => setActiveVesselId(e.target.value)}
          disabled={loading || vessels.length === 0}
          className="bg-white border border-black/15 text-ink text-sm rounded-sm px-3 py-2 min-w-[200px] focus:outline-none focus:ring-1 focus:ring-navy disabled:opacity-50"
          aria-label="Switch active vessel"
        >
          {vessels.length === 0 && <option value="">No vessels available</option>}
          {vessels.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
              {v.hull_number ? ` — ${v.hull_number}` : ""}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}
