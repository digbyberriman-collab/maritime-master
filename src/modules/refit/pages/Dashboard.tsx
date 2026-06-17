import { useEffect, useState } from "react";
import { AppShell, PageHeader } from "@/modules/refit/components/AppShell";
import { RequireAuth } from "@/modules/refit/components/RequireAuth";
import { useAuth } from "@/modules/refit/lib/auth";
import { useActiveVessel } from "@/modules/refit/lib/activeVessel";
import { db } from "@/modules/refit/lib/db";
import {
  StatCard,
  Section,
  StatusBadge,
  PriorityBadge,
  EmptyState,
  fmtMoney,
  fmtDate,
  fmtDateTime,
} from "@/modules/refit/components/ui-kit";

type Counts = Record<string, number>;

export default function Dashboard() {
  const { user } = useAuth();
  const { activeVesselId, activeVessel } = useActiveVessel();

  const [vessel, setVessel] = useState<{
    name: string;
    hull_number: string | null;
    contract_value: number | null;
    project_phase: string | null;
  } | null>(null);
  const [budget, setBudget] = useState<{
    contracted: number;
    accepted: number;
    quoted: number;
    pending: number;
    spent: number;
    variation: number;
  }>({ contracted: 0, accepted: 0, quoted: 0, pending: 0, spent: 0, variation: 0 });
  const [coCounts, setCoCounts] = useState<Counts>({});
  const [crCounts, setCrCounts] = useState<Counts>({});
  const [pendingApprovals, setPendingApprovals] = useState<number>(0);
  const [overdue, setOverdue] = useState<number>(0);
  const [snags, setSnags] = useState<{ critical: number; major: number; minor: number }>({
    critical: 0,
    major: 0,
    minor: 0,
  });
  const [milestones, setMilestones] = useState<
    Array<{ id: string; name: string; planned_date: string; rag: string }>
  >([]);
  const [activity, setActivity] = useState<
    Array<{ id: string; action: string; entity_label: string | null; created_at: string }>
  >([]);
  const [risks, setRisks] = useState<
    Array<{ id: string; title: string; rating: number | null; status: string }>
  >([]);
  const [logistics, setLogistics] = useState<
    Array<{ id: string; title: string; kind: string; scheduled_at: string | null; status: string }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!user || !activeVesselId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const errs: string[] = [];
      const today = new Date().toISOString().slice(0, 10);
      const safe = async <T,>(
        p: Promise<{ data: T | null; error: { message: string } | null }>,
        label: string,
      ): Promise<T | null> => {
        try {
          const { data, error } = await p;
          if (error) errs.push(`${label}: ${error.message}`);
          return data;
        } catch (e) {
          errs.push(`${label}: ${(e as Error).message}`);
          return null;
        }
      };

      const [v, b, co, cr, ap, snag, mi, act, rk, lg] = await Promise.all([
        safe(
          db
            .from("rf_vessels" as any)
            .select("name, hull_number, contract_value, project_phase")
            .eq("id", activeVesselId)
            .maybeSingle(),
          "vessels",
        ),
        safe(
          db.from("rf_budget_items" as any).select("type, amount").eq("vessel_id", activeVesselId),
          "budget",
        ),
        safe(
          db.from("rf_change_orders" as any).select("status").eq("vessel_id", activeVesselId),
          "change_orders",
        ),
        safe(
          db.from("rf_crew_requests" as any).select("status, due_date").eq("vessel_id", activeVesselId),
          "crew_requests",
        ),
        safe(
          db.from("v_pending_approvals").select("entity_id").eq("vessel_id", activeVesselId),
          "approvals",
        ),
        safe(
          db
            .from("rf_snags" as any)
            .select("severity")
            .eq("vessel_id", activeVesselId)
            .neq("status", "closed"),
          "snags",
        ),
        safe(
          db
            .from("rf_milestones" as any)
            .select("id, name, planned_date, rag")
            .eq("vessel_id", activeVesselId)
            .order("planned_date")
            .limit(5),
          "milestones",
        ),
        safe(
          db
            .from("rf_activity_feed" as any)
            .select("id, action, entity_label, created_at")
            .eq("vessel_id", activeVesselId)
            .order("created_at", { ascending: false })
            .limit(8),
          "activity",
        ),
        safe(
          db
            .from("rf_risks" as any)
            .select("id, title, rating, status")
            .eq("vessel_id", activeVesselId)
            .neq("status", "closed")
            .order("rating", { ascending: false })
            .limit(5),
          "risks",
        ),
        safe(
          db
            .from("rf_logistics_items" as any)
            .select("id, title, kind, scheduled_at, status")
            .eq("vessel_id", activeVesselId)
            .gte("scheduled_at", today)
            .order("scheduled_at")
            .limit(5),
          "logistics",
        ),
      ]);

      if (cancelled) return;

      setVessel((v as never) ?? null);
      const t = { contracted: 0, accepted: 0, quoted: 0, pending: 0, spent: 0, variation: 0 };
      ((b as Array<{ type: string; amount: number }>) ?? []).forEach((row) => {
        const k = row.type as keyof typeof t;
        if (t[k] !== undefined) t[k] += Number(row.amount);
      });
      setBudget(t);

      const cc: Counts = {};
      ((co as Array<{ status: string }>) ?? []).forEach((r) => {
        cc[r.status] = (cc[r.status] || 0) + 1;
      });
      setCoCounts(cc);

      const rc: Counts = {};
      let overdueCount = 0;
      ((cr as Array<{ status: string; due_date: string | null }>) ?? []).forEach((r) => {
        rc[r.status] = (rc[r.status] || 0) + 1;
        if (
          r.due_date &&
          r.due_date < today &&
          !["completed", "closed", "cancelled", "rejected"].includes(r.status)
        )
          overdueCount++;
      });
      setCrCounts(rc);
      setOverdue(overdueCount);

      setPendingApprovals(Array.isArray(ap) ? ap.length : 0);

      const sc = { critical: 0, major: 0, minor: 0 };
      ((snag as Array<{ severity: keyof typeof sc }>) ?? []).forEach((r) => {
        sc[r.severity]++;
      });
      setSnags(sc);

      setMilestones((mi as never) ?? []);
      setActivity((act as never) ?? []);
      setRisks((rk as never) ?? []);
      setLogistics((lg as never) ?? []);
      setErrors(errs);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, activeVesselId]);

  if (!user)
    return (
      <div className="min-h-dvh flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );

  const completion =
    budget.contracted > 0 ? Math.round((budget.spent / budget.contracted) * 100) : 0;
  const openCO =
    (coCounts["submitted"] || 0) +
    (coCounts["under_review"] || 0) +
    (coCounts["more_info_required"] || 0) +
    (coCounts["in_progress"] || 0);
  const openCR = Object.entries(crCounts).reduce(
    (s, [k, v]) => (["completed", "closed", "cancelled", "rejected"].includes(k) ? s : s + v),
    0,
  );
  const variancePct =
    budget.contracted > 0 ? Math.round((budget.variation / budget.contracted) * 100) : 0;

  return (
    <AppShell>
      <div className="p-4 sm:p-6 md:p-8 w-full max-w-[1600px] mx-auto">
        <PageHeader
          title={`${vessel?.name ?? activeVessel?.name ?? "—"} Refit`}
          subtitle={`Hull ${vessel?.hull_number ?? activeVessel?.hull_number ?? "—"} · ${vessel?.project_phase ?? "Active"} · ${completion}% spent`}
          action={
            <div className="flex gap-2">
              <Link
                to="/approvals"
                className="px-3 py-2 bg-white border border-black/10 rounded-sm text-sm hover:bg-secondary"
              >
                Approvals ({pendingApprovals})
              </Link>
              <Link
                to="/change-orders"
                className="px-3 py-2 bg-navy text-white rounded-sm text-sm hover:opacity-90"
              >
                Change Orders
              </Link>
            </div>
          }
        />

        {errors.length > 0 && (
          <div className="mb-4 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-sm p-3">
            {errors.length} dashboard query had errors — likely missing tables or RLS denials.
            Modules will still work where access is granted.
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard
            label="Pending approvals"
            value={pendingApprovals}
            tone={pendingApprovals > 5 ? "warn" : undefined}
            sub="Across all modules"
          />
          <StatCard
            label="Open change orders"
            value={openCO}
            sub={`${coCounts["approved"] || 0} approved · ${coCounts["rejected"] || 0} rejected`}
          />
          <StatCard
            label="Open crew requests"
            value={openCR}
            tone={overdue > 0 ? "warn" : undefined}
            sub={`${overdue} overdue`}
          />
          <StatCard
            label="Budget variance"
            value={fmtMoney(budget.variation)}
            tone={
              Math.abs(variancePct) > 10 ? "bad" : Math.abs(variancePct) > 3 ? "warn" : undefined
            }
            sub={`${variancePct >= 0 ? "+" : ""}${variancePct}% of contracted`}
          />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard label="Contracted" value={fmtMoney(budget.contracted)} />
          <StatCard label="Accepted" value={fmtMoney(budget.accepted)} />
          <StatCard label="Quoted" value={fmtMoney(budget.quoted)} sub="Awaiting acceptance" />
          <StatCard
            label="Spent"
            value={fmtMoney(budget.spent)}
            sub={`${completion}% of contracted`}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Section
            title="Next 5 Milestones"
            action={
              <Link to="/schedule" className="text-[11px] text-ocean">
                View schedule →
              </Link>
            }
          >
            {milestones.length === 0 ? (
              <EmptyState title="No milestones scheduled" />
            ) : (
              <div className="divide-y divide-black/5">
                {milestones.map((m) => (
                  <div key={m.id} className="flex justify-between items-center py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className={`size-2 rounded-full ${m.rag === "red" ? "bg-danger" : m.rag === "amber" ? "bg-warning" : "bg-success"}`}
                      />
                      <span className="text-sm">{m.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {fmtDate(m.planned_date)}
                      </span>
                      <StatusBadge value={m.rag} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Open Snags">
            <div className="space-y-5">
              {[
                { label: "Critical", count: snags.critical, color: "bg-danger", max: 5 },
                { label: "Major", count: snags.major, color: "bg-warning", max: 10 },
                { label: "Minor", count: snags.minor, color: "bg-success", max: 20 },
              ].map((row) => (
                <div key={row.label}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span>{row.label}</span>
                    <span className="tabular-nums font-medium">{row.count}</span>
                  </div>
                  <div className="h-1 bg-paper">
                    <div
                      className={`h-1 ${row.color}`}
                      style={{ width: `${Math.min(100, (row.count / row.max) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section
            title="Top Risks"
            action={
              <Link to="/risks" className="text-[11px] text-ocean">
                Risk register →
              </Link>
            }
          >
            {risks.length === 0 ? (
              <EmptyState title="No open risks" />
            ) : (
              <div className="divide-y divide-black/5">
                {risks.map((r) => (
                  <div key={r.id} className="flex justify-between items-center py-2.5 text-sm">
                    <span className="truncate pr-2">{r.title}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span
                        className={`px-1.5 py-0.5 text-[10px] font-bold rounded-sm ${(r.rating ?? 0) >= 15 ? "bg-danger/10 text-danger" : (r.rating ?? 0) >= 8 ? "bg-warning/10 text-warning" : "bg-slate-100 text-slate-700"}`}
                      >
                        R{r.rating ?? 0}
                      </span>
                      <StatusBadge value={r.status} />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section
            title="Change Orders by Status"
            action={
              <Link to="/change-orders" className="text-[11px] text-ocean">
                View all →
              </Link>
            }
          >
            {Object.keys(coCounts).length === 0 ? (
              <EmptyState
                title="No change orders raised"
                hint="Create one when scope, cost, or schedule changes."
              />
            ) : (
              <div className="space-y-2">
                {Object.entries(coCounts).map(([status, count]) => (
                  <div
                    key={status}
                    className="flex items-center justify-between py-1.5 border-b border-black/5"
                  >
                    <StatusBadge value={status} />
                    <span className="tabular-nums font-medium text-sm">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section
            title="Crew Requests by Status"
            action={
              <Link to="/crew-requests" className="text-[11px] text-ocean">
                View all →
              </Link>
            }
          >
            {Object.keys(crCounts).length === 0 ? (
              <EmptyState title="No crew requests open" />
            ) : (
              <div className="space-y-2">
                {Object.entries(crCounts).map(([status, count]) => (
                  <div
                    key={status}
                    className="flex items-center justify-between py-1.5 border-b border-black/5"
                  >
                    <StatusBadge value={status} />
                    <span className="tabular-nums font-medium text-sm">{count}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section
            title="Upcoming Logistics"
            action={
              <Link to="/logistics" className="text-[11px] text-ocean">
                View all →
              </Link>
            }
          >
            {logistics.length === 0 ? (
              <EmptyState title="No logistics movements scheduled" />
            ) : (
              <div className="divide-y divide-black/5">
                {logistics.map((l) => (
                  <div key={l.id} className="flex justify-between items-center py-2.5 text-sm">
                    <div className="min-w-0 truncate">
                      <span className="text-[10px] uppercase tracking-wider text-ocean mr-2">
                        {l.kind.replace(/_/g, " ")}
                      </span>
                      <span>{l.title}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {fmtDateTime(l.scheduled_at)}
                      </span>
                      <StatusBadge value={l.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Recent Activity">
            {activity.length === 0 ? (
              <EmptyState
                title="No activity yet"
                hint="Actions across the project will appear here."
              />
            ) : (
              <div className="divide-y divide-black/5">
                {activity.map((a) => (
                  <div key={a.id} className="flex justify-between items-center py-2.5 text-sm">
                    <div className="min-w-0 truncate">
                      <span className="text-[10px] uppercase tracking-wider text-ocean font-medium mr-2">
                        {a.action}
                      </span>
                      <span>{a.entity_label ?? "—"}</span>
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {fmtDateTime(a.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        {loading && (
          <div className="mt-4 text-xs text-muted-foreground">Loading dashboard data…</div>
        )}
      </div>
    </AppShell>
  );
}
