import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell, PageHeader } from "@/modules/refit/components/AppShell";
import { RequireAuth } from "@/modules/refit/components/RequireAuth";
import { useActiveVessel } from "@/modules/refit/lib/activeVessel";
import { useAuth } from "@/modules/refit/lib/auth";
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
import { can } from "@/modules/refit/lib/permissions";

export default function BudgetPage() {
  const { roles } = useAuth();
  const { activeVesselId } = useActiveVessel();
  const [items, setItems] = useState<Array<{ type: string; amount: number; description: string }>>(
    [],
  );
  const [pos, setPos] = useState<
    Array<{ id: string; reference: string; title: string; amount: number; status: string }>
  >([]);
  const [invoices, setInvoices] = useState<
    Array<{ id: string; reference: string; amount: number; status: string; received_at: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeVesselId) return;
    (async () => {
      const errs: string[] = [];
      const [b, p, i] = await Promise.all([
        db.from("rf_budget_items" as any).select("type, amount, description").eq("vessel_id", activeVesselId),
        db
          .from("rf_purchase_orders" as any)
          .select("id, reference, title, amount, status")
          .eq("vessel_id", activeVesselId)
          .order("created_at", { ascending: false })
          .limit(15),
        db
          .from("rf_invoices" as any)
          .select("id, reference, amount, status, received_at")
          .eq("vessel_id", activeVesselId)
          .order("received_at", { ascending: false })
          .limit(15),
      ]);
      if (b.error) errs.push(b.error.message);
      if (p.error) errs.push(p.error.message);
      if (i.error) errs.push(i.error.message);
      if (errs.length > 0) setError(errs.join(" · "));
      setItems((b.data as never) ?? []);
      setPos((p.data as never) ?? []);
      setInvoices((i.data as never) ?? []);
    })();
  }, [activeVesselId]);

  const sums = items.reduce<Record<string, number>>((acc, r) => {
    acc[r.type] = (acc[r.type] || 0) + Number(r.amount);
    return acc;
  }, {});
  const contracted = sums.contracted ?? 0;
  const accepted = sums.accepted ?? 0;
  const quoted = sums.quoted ?? 0;
  const spent = sums.spent ?? 0;
  const variation = sums.variation ?? 0;
  const committedPO = pos
    .filter((p) => ["approved", "sent", "received"].includes(p.status))
    .reduce((s, p) => s + Number(p.amount), 0);
  const forecast = spent + committedPO + variation;
  const variancePct = contracted > 0 ? Math.round(((forecast - contracted) / contracted) * 100) : 0;

  return (
    <AppShell>
      <div className="p-4 sm:p-6 md:p-8 w-full max-w-[1600px] mx-auto">
        <PageHeader
          title="Budget & Financial Control"
          subtitle="Live view of contracted vs spent vs committed, with PO and invoice rollups"
          action={
            <div className="flex gap-2">
              {can(roles, "po.create") && (
                <Link
                  to="/yard/refit/purchase-orders"
                  className="px-3 py-2 bg-white border border-black/10 rounded-sm text-sm hover:bg-secondary"
                >
                  Purchase orders
                </Link>
              )}
              {can(roles, "invoice.manage") && (
                <Link
                  to="/yard/refit/invoices"
                  className="px-3 py-2 bg-navy text-white rounded-sm text-sm hover:opacity-90"
                >
                  Invoices
                </Link>
              )}
            </div>
          }
        />

        {error && <ErrorBlock message={error} />}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard label="Contracted" value={fmtMoney(contracted)} />
          <StatCard label="Accepted" value={fmtMoney(accepted)} sub="Approved scope variations" />
          <StatCard label="Quoted (open)" value={fmtMoney(quoted)} sub="Awaiting acceptance" />
          <StatCard
            label="Variations"
            value={fmtMoney(variation)}
            tone={variation > 0 ? "warn" : undefined}
          />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard label="Spent (booked)" value={fmtMoney(spent)} />
          <StatCard
            label="Committed via POs"
            value={fmtMoney(committedPO)}
            sub={`${pos.filter((p) => ["approved", "sent", "received"].includes(p.status)).length} active POs`}
          />
          <StatCard
            label="Forecast final"
            value={fmtMoney(forecast)}
            tone={
              Math.abs(variancePct) > 10 ? "bad" : Math.abs(variancePct) > 3 ? "warn" : undefined
            }
            sub={`${variancePct >= 0 ? "+" : ""}${variancePct}% vs contracted`}
          />
          <StatCard label="Remaining" value={fmtMoney(Math.max(0, contracted - forecast))} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Section
            title="Recent Purchase Orders"
            action={
              <Link to="/yard/refit/purchase-orders" className="text-[11px] text-ocean">
                View all →
              </Link>
            }
          >
            {pos.length === 0 ? (
              <EmptyState title="No purchase orders yet" />
            ) : (
              <ListShell>
                <ListHeader>
                  <div
                    style={{
                      gridTemplateColumns: "120px 1fr 130px 120px",
                      display: "grid",
                      width: "100%",
                    }}
                  >
                    <div>Ref</div>
                    <div>Title</div>
                    <div>Amount</div>
                    <div>Status</div>
                  </div>
                </ListHeader>
                {pos.map((p) => (
                  <div
                    key={p.id}
                    className="px-4 py-2.5 grid items-center border-b border-black/5"
                    style={{ gridTemplateColumns: "120px 1fr 130px 120px" }}
                  >
                    <span className="font-mono text-xs">{p.reference}</span>
                    <span className="text-sm truncate">{p.title}</span>
                    <span className="text-sm tabular-nums">{fmtMoney(p.amount)}</span>
                    <StatusBadge value={p.status} />
                  </div>
                ))}
              </ListShell>
            )}
          </Section>

          <Section
            title="Recent Invoices"
            action={
              <Link to="/yard/refit/invoices" className="text-[11px] text-ocean">
                View all →
              </Link>
            }
          >
            {invoices.length === 0 ? (
              <EmptyState title="No invoices yet" />
            ) : (
              <ListShell>
                <ListHeader>
                  <div
                    style={{
                      gridTemplateColumns: "150px 130px 130px 120px",
                      display: "grid",
                      width: "100%",
                    }}
                  >
                    <div>Ref</div>
                    <div>Amount</div>
                    <div>Received</div>
                    <div>Status</div>
                  </div>
                </ListHeader>
                {invoices.map((i) => (
                  <div
                    key={i.id}
                    className="px-4 py-2.5 grid items-center border-b border-black/5"
                    style={{ gridTemplateColumns: "150px 130px 130px 120px" }}
                  >
                    <span className="font-mono text-xs">{i.reference}</span>
                    <span className="text-sm tabular-nums">{fmtMoney(i.amount)}</span>
                    <span className="text-xs text-muted-foreground">{fmtDate(i.received_at)}</span>
                    <StatusBadge value={i.status} />
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
