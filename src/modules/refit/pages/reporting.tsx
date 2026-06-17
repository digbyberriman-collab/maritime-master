import { useEffect, useState } from "react";
import { AppShell, PageHeader } from "@/modules/refit/components/AppShell";
import { RequireAuth } from "@/modules/refit/components/RequireAuth";
import { useActiveVessel } from "@/modules/refit/lib/activeVessel";
import { db } from "@/modules/refit/lib/db";
import {
  StatCard,
  Section,
  ListShell,
  ListHeader,
  EmptyState,
  ErrorBlock,
  fmtMoney,
  fmtDate,
  StatusBadge,
} from "@/modules/refit/components/ui-kit";

export default function Reporting() {
  const { activeVesselId } = useActiveVessel();
  const [data, setData] = useState<{
    overdue: Array<{ kind: string; reference: string; title: string; due: string }>;
    expiring: Array<{ kind: string; name: string; expiry: string }>;
    coVariance: { contracted: number; approved: number; pending: number };
    contractorPerf: Array<{ id: string; name: string; status: string; insurance: string | null }>;
  }>({
    overdue: [],
    expiring: [],
    coVariance: { contracted: 0, approved: 0, pending: 0 },
    contractorPerf: [],
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeVesselId) return;
    const today = new Date().toISOString().slice(0, 10);
    const soon = new Date(Date.now() + 1000 * 60 * 60 * 24 * 60).toISOString().slice(0, 10);
    (async () => {
      const errs: string[] = [];
      const safe = async <T,>(
        p: Promise<{ data: T | null; error: { message: string } | null }>,
        label: string,
      ) => {
        const { data, error } = await p;
        if (error) errs.push(`${label}: ${error.message}`);
        return data;
      };

      const [coOver, crOver, coAll, docExp, certExp, conts] = await Promise.all([
        safe(
          db
            .from("rf_change_orders" as any)
            .select("reference, title, due_date, status")
            .eq("vessel_id", activeVesselId)
            .lt("due_date", today)
            .not("status", "in", "(closed,cancelled,completed,rejected)"),
          "co_overdue",
        ),
        safe(
          db
            .from("rf_crew_requests" as any)
            .select("reference, title, due_date, status")
            .eq("vessel_id", activeVesselId)
            .lt("due_date", today)
            .not("status", "in", "(closed,cancelled,completed,rejected)"),
          "cr_overdue",
        ),
        safe(
          db
            .from("rf_change_orders" as any)
            .select("cost_estimate, approved_cost, status")
            .eq("vessel_id", activeVesselId),
          "co_all",
        ),
        safe(
          db
            .from("rf_documents" as any)
            .select("name, expiry_date")
            .eq("vessel_id", activeVesselId)
            .not("expiry_date", "is", null)
            .lt("expiry_date", soon),
          "doc_exp",
        ),
        safe(
          db.from("rf_certifications" as any).select("cert_type, expiry_date").lt("expiry_date", soon),
          "cert_exp",
        ),
        safe(
          db
            .from("rf_contractors" as any)
            .select("id, name, status, insurance_expires_at")
            .is("archived_at", null),
          "contractors",
        ),
      ]);

      const overdue: Array<{ kind: string; reference: string; title: string; due: string }> = [];
      ((coOver as Array<{ reference: string; title: string; due_date: string }>) ?? []).forEach(
        (r) =>
          overdue.push({
            kind: "Change order",
            reference: r.reference,
            title: r.title,
            due: r.due_date,
          }),
      );
      ((crOver as Array<{ reference: string; title: string; due_date: string }>) ?? []).forEach(
        (r) =>
          overdue.push({
            kind: "Crew request",
            reference: r.reference,
            title: r.title,
            due: r.due_date,
          }),
      );

      const expiring: Array<{ kind: string; name: string; expiry: string }> = [];
      ((docExp as Array<{ name: string; expiry_date: string }>) ?? []).forEach((d) =>
        expiring.push({ kind: "Document", name: d.name, expiry: d.expiry_date }),
      );
      ((certExp as Array<{ cert_type: string; expiry_date: string }>) ?? []).forEach((c) =>
        expiring.push({ kind: "Certification", name: c.cert_type, expiry: c.expiry_date }),
      );

      const coArr =
        (coAll as Array<{ cost_estimate: number; approved_cost: number; status: string }>) ?? [];
      const contracted = coArr.reduce((s, r) => s + Number(r.cost_estimate ?? 0), 0);
      const approved = coArr
        .filter(
          (r) =>
            r.status === "approved" ||
            r.status === "completed" ||
            r.status === "in_progress" ||
            r.status === "closed",
        )
        .reduce((s, r) => s + Number(r.approved_cost ?? r.cost_estimate ?? 0), 0);
      const pending = coArr
        .filter((r) => ["submitted", "under_review", "more_info_required"].includes(r.status))
        .reduce((s, r) => s + Number(r.cost_estimate ?? 0), 0);

      const contractorPerf = (
        (conts as Array<{
          id: string;
          name: string;
          status: string;
          insurance_expires_at: string | null;
        }>) ?? []
      ).map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        insurance: c.insurance_expires_at,
      }));

      setData({ overdue, expiring, coVariance: { contracted, approved, pending }, contractorPerf });
      if (errs.length) setError(errs.join(" · "));
    })();
  }, [activeVesselId]);

  return (
    <AppShell>
      <div className="p-4 sm:p-6 md:p-8 w-full max-w-[1400px] mx-auto">
        <PageHeader title="Reporting" subtitle="Cross-module reports for management oversight" />

        {error && <ErrorBlock message={error} />}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard
            label="Overdue items"
            value={data.overdue.length}
            tone={data.overdue.length > 5 ? "bad" : data.overdue.length > 0 ? "warn" : undefined}
          />
          <StatCard
            label="Expiring (60d)"
            value={data.expiring.length}
            tone={data.expiring.length > 0 ? "warn" : undefined}
          />
          <StatCard
            label="CO approved value"
            value={fmtMoney(data.coVariance.approved)}
            sub={`${fmtMoney(data.coVariance.pending)} pending`}
          />
          <StatCard label="CO total exposure" value={fmtMoney(data.coVariance.contracted)} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Section title="Overdue items">
            {data.overdue.length === 0 ? (
              <EmptyState title="Nothing overdue" />
            ) : (
              <ListShell>
                <ListHeader>
                  <div
                    style={{
                      gridTemplateColumns: "150px 130px 1fr 130px",
                      display: "grid",
                      width: "100%",
                    }}
                  >
                    <div>Type</div>
                    <div>Ref</div>
                    <div>Title</div>
                    <div>Due</div>
                  </div>
                </ListHeader>
                {data.overdue.map((r, i) => (
                  <div
                    key={i}
                    className="px-4 py-2.5 grid items-center border-b border-black/5"
                    style={{ gridTemplateColumns: "150px 130px 1fr 130px" }}
                  >
                    <span className="text-[10px] uppercase tracking-wider text-ocean">
                      {r.kind}
                    </span>
                    <span className="font-mono text-xs">{r.reference}</span>
                    <span className="text-sm truncate">{r.title}</span>
                    <span className="text-xs text-danger tabular-nums">{fmtDate(r.due)}</span>
                  </div>
                ))}
              </ListShell>
            )}
          </Section>

          <Section title="Expiring documents & certifications">
            {data.expiring.length === 0 ? (
              <EmptyState title="Nothing expiring soon" />
            ) : (
              <ListShell>
                <ListHeader>
                  <div
                    style={{
                      gridTemplateColumns: "150px 1fr 130px",
                      display: "grid",
                      width: "100%",
                    }}
                  >
                    <div>Type</div>
                    <div>Name</div>
                    <div>Expires</div>
                  </div>
                </ListHeader>
                {data.expiring.map((r, i) => (
                  <div
                    key={i}
                    className="px-4 py-2.5 grid items-center border-b border-black/5"
                    style={{ gridTemplateColumns: "150px 1fr 130px" }}
                  >
                    <span className="text-[10px] uppercase tracking-wider text-ocean">
                      {r.kind}
                    </span>
                    <span className="text-sm">{r.name}</span>
                    <span className="text-xs text-warning tabular-nums">{fmtDate(r.expiry)}</span>
                  </div>
                ))}
              </ListShell>
            )}
          </Section>

          <Section title="Contractor / supplier register">
            {data.contractorPerf.length === 0 ? (
              <EmptyState title="No contractors registered" />
            ) : (
              <ListShell>
                <ListHeader>
                  <div
                    style={{
                      gridTemplateColumns: "1fr 130px 150px",
                      display: "grid",
                      width: "100%",
                    }}
                  >
                    <div>Name</div>
                    <div>Status</div>
                    <div>Insurance exp.</div>
                  </div>
                </ListHeader>
                {data.contractorPerf.map((c) => (
                  <div
                    key={c.id}
                    className="px-4 py-2.5 grid items-center border-b border-black/5"
                    style={{ gridTemplateColumns: "1fr 130px 150px" }}
                  >
                    <span className="text-sm">{c.name}</span>
                    <StatusBadge value={c.status} />
                    <span className="text-xs text-muted-foreground">{fmtDate(c.insurance)}</span>
                  </div>
                ))}
              </ListShell>
            )}
          </Section>
        </div>
      </div>
    </AppShell>
  );
}
