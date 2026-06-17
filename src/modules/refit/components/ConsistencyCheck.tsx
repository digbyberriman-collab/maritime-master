import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useActiveVessel } from "@/modules/refit/lib/activeVessel";

type TableKey = "works_orders" | "snags" | "schedule_items" | "budget_items";

type CheckResult = {
  table: TableKey;
  label: string;
  total: number;
  linked: number;
  otherVessels: number;
  orphans: number; // rows where vessel_id IS NULL
  error?: string;
};

const TABLES: { key: TableKey; label: string }[] = [
  { key: "works_orders", label: "Works Orders" },
  { key: "snags", label: "Snags" },
  { key: "schedule_items", label: "Schedule Items" },
  { key: "budget_items", label: "Budget Items" },
];

export function ConsistencyCheck() {
  const { activeVessel, activeVesselId, loading: vesselLoading } = useActiveVessel();
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const [ranAt, setRanAt] = useState<Date | null>(null);

  const run = async () => {
    if (!activeVesselId) return;
    setRunning(true);
    const out: CheckResult[] = [];

    for (const t of TABLES) {
      const [totalRes, linkedRes, orphanRes] = await Promise.all([
        supabase.from(t.key as never).select("id", { count: "exact", head: true }),
        supabase
          .from(t.key as never)
          .select("id", { count: "exact", head: true })
          .eq("vessel_id", activeVesselId),
        supabase
          .from(t.key as never)
          .select("id", { count: "exact", head: true })
          .is("vessel_id", null),
      ]);

      const error = totalRes.error?.message || linkedRes.error?.message || orphanRes.error?.message;
      const total = totalRes.count ?? 0;
      const linked = linkedRes.count ?? 0;
      const orphans = orphanRes.count ?? 0;
      const otherVessels = Math.max(0, total - linked - orphans);

      out.push({
        table: t.key,
        label: t.label,
        total,
        linked,
        otherVessels,
        orphans,
        error,
      });
    }

    setResults(out);
    setRanAt(new Date());
    setRunning(false);
  };

  const totalIssues = (results ?? []).reduce(
    (n, r) => n + (r.error ? 1 : 0) + r.orphans + r.otherVessels,
    0,
  );
  const overallTone = !results
    ? "idle"
    : totalIssues === 0
      ? "ok"
      : results.some((r) => r.error || r.orphans > 0)
        ? "danger"
        : "warn";

  const toneClass =
    overallTone === "ok"
      ? "bg-success/10 text-success border-success/30"
      : overallTone === "danger"
        ? "bg-danger/10 text-danger border-danger/30"
        : overallTone === "warn"
          ? "bg-warning/10 text-warning border-warning/30"
          : "bg-secondary text-ink border-black/10";

  return (
    <section className="bg-white border border-black/10 rounded-sm p-5 mb-8">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="font-semibold tracking-tight">Database consistency check</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Verify that Works Orders, Snags, Schedule, and Budget rows are linked to the active
            vessel
            {activeVessel ? (
              <>
                {" "}
                <span className="font-medium text-ink">
                  {activeVessel.name}
                  {activeVessel.hull_number ? ` — ${activeVessel.hull_number}` : ""}
                </span>
                .
              </>
            ) : (
              "."
            )}
          </p>
        </div>
        <button
          onClick={run}
          disabled={running || vesselLoading || !activeVesselId}
          className="text-xs uppercase tracking-wider px-3 py-2 bg-navy text-white rounded-sm hover:opacity-90 disabled:opacity-50"
        >
          {running ? "Checking…" : "Run check"}
        </button>
      </div>

      {results && (
        <div className={`rounded-sm border px-3 py-2 text-sm mb-4 ${toneClass}`}>
          {overallTone === "ok" && (
            <>
              All four tables are fully linked to the active vessel. No orphans, no cross-vessel
              rows.
            </>
          )}
          {overallTone === "warn" && (
            <>
              Some rows belong to other vessels. This is expected if the database holds multiple
              vessel projects, but worth confirming.
            </>
          )}
          {overallTone === "danger" && (
            <>
              Issues found. Orphan rows (no <code className="font-mono">vessel_id</code>) or query
              errors will cause modules to look incomplete or empty.
            </>
          )}
        </div>
      )}

      {results && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground border-b border-black/10">
              <tr>
                <th className="py-2 font-medium">Table</th>
                <th className="py-2 font-medium text-right">Total</th>
                <th className="py-2 font-medium text-right">Linked to active</th>
                <th className="py-2 font-medium text-right">Other vessels</th>
                <th className="py-2 font-medium text-right">Orphans</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {results.map((r) => {
                const status: { label: string; cls: string } = r.error
                  ? { label: "Error", cls: "bg-danger/10 text-danger" }
                  : r.orphans > 0
                    ? {
                        label: `${r.orphans} orphan${r.orphans === 1 ? "" : "s"}`,
                        cls: "bg-danger/10 text-danger",
                      }
                    : r.otherVessels > 0
                      ? { label: "Mixed vessels", cls: "bg-warning/10 text-warning" }
                      : r.total === 0
                        ? { label: "Empty", cls: "bg-secondary text-muted-foreground" }
                        : { label: "OK", cls: "bg-success/10 text-success" };

                return (
                  <tr key={r.table} className="align-top">
                    <td className="py-2.5">
                      <div className="font-medium">{r.label}</div>
                      <div className="font-mono text-[10px] text-muted-foreground">{r.table}</div>
                      {r.error && <div className="text-[11px] text-danger mt-1">{r.error}</div>}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{r.total}</td>
                    <td className="py-2.5 text-right tabular-nums font-medium">{r.linked}</td>
                    <td
                      className={`py-2.5 text-right tabular-nums ${r.otherVessels > 0 ? "text-warning" : "text-muted-foreground"}`}
                    >
                      {r.otherVessels}
                    </td>
                    <td
                      className={`py-2.5 text-right tabular-nums ${r.orphans > 0 ? "text-danger font-medium" : "text-muted-foreground"}`}
                    >
                      {r.orphans}
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-sm text-[11px] ${status.cls}`}
                      >
                        {status.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {results && totalIssues > 0 && (
        <div className="mt-4 text-xs text-muted-foreground space-y-1">
          <div className="font-medium text-ink">Suggested fixes</div>
          <ul className="list-disc pl-5 space-y-1">
            {results.some((r) => r.orphans > 0) && (
              <li>
                Orphan rows have <code className="font-mono">vessel_id IS NULL</code>. Update them
                to point at the correct vessel, or delete them if they were created in error.
              </li>
            )}
            {results.some((r) => r.otherVessels > 0) && (
              <li>
                "Other vessels" rows are linked to a different{" "}
                <code className="font-mono">vessel_id</code>. If you expected only one project,
                switch the active vessel in the Admin selector to confirm where they live.
              </li>
            )}
            {results.some((r) => r.error) && (
              <li>
                Errored tables usually mean RLS denied your role from counting rows. Check your role
                mapping in the Troubleshooting panel below.
              </li>
            )}
          </ul>
        </div>
      )}

      {ranAt && !running && (
        <p className="mt-4 text-[11px] text-muted-foreground">
          Last run {ranAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.
        </p>
      )}
    </section>
  );
}
