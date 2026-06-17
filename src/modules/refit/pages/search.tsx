import { useState } from "react";
import { AppShell, PageHeader } from "@/modules/refit/components/AppShell";
import { RequireAuth } from "@/modules/refit/components/RequireAuth";
import { useActiveVessel } from "@/modules/refit/lib/activeVessel";
import { db } from "@/modules/refit/lib/db";
import {
  Section,
  ListShell,
  ListHeader,
  EmptyState,
  ErrorBlock,
  fmtDate,
  fmtMoney,
  StatusBadge,
  Field,
  inputCls,
  PrimaryBtn,
} from "@/modules/refit/components/ui-kit";

type Result =
  | { kind: "change_order"; id: string; reference: string; title: string; status: string }
  | { kind: "crew_request"; id: string; reference: string; title: string; status: string }
  | {
      kind: "purchase_order";
      id: string;
      reference: string;
      title: string;
      amount: number;
      status: string;
    }
  | {
      kind: "drawing";
      id: string;
      reference: string;
      name: string;
      current_revision: string | null;
    }
  | {
      kind: "document";
      id: string;
      name: string;
      folder: string | null;
      expiry_date: string | null;
    }
  | { kind: "contractor"; id: string; name: string; trade: string | null; status: string }
  | {
      kind: "inventory";
      id: string;
      name: string;
      category: string | null;
      quantity: number;
      status: string;
    }
  | { kind: "meeting"; id: string; title: string; scheduled_at: string | null }
  | { kind: "risk"; id: string; title: string; rating: number | null; status: string };

export default function SearchPage() {
  const { activeVesselId } = useActiveVessel();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!q.trim() || !activeVesselId) return;
    setBusy(true);
    setError(null);
    const term = `%${q.trim()}%`;

    type Probe<T> = Promise<{ data: T[] | null; error: { message: string } | null }>;
    const queries: Array<{ kind: Result["kind"]; promise: Probe<Record<string, unknown>> }> = [
      {
        kind: "change_order",
        promise: db
          .from("rf_change_orders" as any)
          .select("id, reference, title, status")
          .eq("vessel_id", activeVesselId)
          .or(`title.ilike.${term},reference.ilike.${term},description.ilike.${term}`)
          .limit(10),
      },
      {
        kind: "crew_request",
        promise: db
          .from("rf_crew_requests" as any)
          .select("id, reference, title, status")
          .eq("vessel_id", activeVesselId)
          .or(`title.ilike.${term},reference.ilike.${term},description.ilike.${term}`)
          .limit(10),
      },
      {
        kind: "purchase_order",
        promise: db
          .from("rf_purchase_orders" as any)
          .select("id, reference, title, amount, status")
          .eq("vessel_id", activeVesselId)
          .or(`title.ilike.${term},reference.ilike.${term}`)
          .limit(10),
      },
      {
        kind: "drawing",
        promise: db
          .from("rf_drawings" as any)
          .select("id, reference, name, current_revision")
          .eq("vessel_id", activeVesselId)
          .or(`name.ilike.${term},reference.ilike.${term}`)
          .limit(10),
      },
      {
        kind: "document",
        promise: db
          .from("rf_documents" as any)
          .select("id, name, folder, expiry_date")
          .eq("vessel_id", activeVesselId)
          .ilike("name", term)
          .limit(10),
      },
      {
        kind: "contractor",
        promise: db
          .from("rf_contractors" as any)
          .select("id, name, trade, status")
          .or(`name.ilike.${term},trade.ilike.${term}`)
          .limit(10),
      },
      {
        kind: "inventory",
        promise: db
          .from("rf_inventory_items" as any)
          .select("id, name, category, quantity, status")
          .eq("vessel_id", activeVesselId)
          .ilike("name", term)
          .limit(10),
      },
      {
        kind: "meeting",
        promise: db
          .from("rf_meetings" as any)
          .select("id, title, scheduled_at")
          .eq("vessel_id", activeVesselId)
          .ilike("title", term)
          .limit(10),
      },
      {
        kind: "risk",
        promise: db
          .from("rf_risks" as any)
          .select("id, title, rating, status")
          .eq("vessel_id", activeVesselId)
          .ilike("title", term)
          .limit(10),
      },
    ];

    const settled = await Promise.all(queries.map((s) => s.promise));
    const all: Result[] = [];
    settled.forEach((s, i) => {
      if (s.error) {
        /* swallow individual table errors */ return;
      }
      const kind = queries[i].kind;
      ((s.data as Array<Record<string, unknown>>) ?? []).forEach((row) => {
        all.push({ kind, ...row } as unknown as Result);
      });
    });
    setResults(all);
    setBusy(false);
  };

  return (
    <AppShell>
      <div className="p-4 sm:p-6 md:p-8 w-full max-w-[1200px] mx-auto">
        <PageHeader
          title="Global Search"
          subtitle="Search across change orders, requests, drawings, documents, inventory, contractors, meetings and risks"
        />

        <div className="mb-6 flex gap-2 items-end">
          <Field label="Query">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
              placeholder="Type a phrase…"
              className={`${inputCls} w-96`}
            />
          </Field>
          <PrimaryBtn onClick={run} disabled={busy || !q.trim()}>
            {busy ? "Searching…" : "Search"}
          </PrimaryBtn>
        </div>

        {error && <ErrorBlock message={error} />}

        {results === null ? (
          <div className="text-sm text-muted-foreground">Enter a query and press search.</div>
        ) : results.length === 0 ? (
          <EmptyState title="No results" hint="Try a shorter or different phrase." />
        ) : (
          <Section title={`${results.length} result${results.length === 1 ? "" : "s"}`}>
            <ListShell>
              <ListHeader>
                <div
                  style={{
                    gridTemplateColumns: "150px 130px 1fr 130px 130px",
                    display: "grid",
                    width: "100%",
                  }}
                >
                  <div>Type</div>
                  <div>Ref</div>
                  <div>Title / name</div>
                  <div>Detail</div>
                  <div>Status</div>
                </div>
              </ListHeader>
              {results.map((r, i) => (
                <div
                  key={`${r.kind}-${i}`}
                  className="px-4 py-2.5 grid items-center border-b border-black/5"
                  style={{ gridTemplateColumns: "150px 130px 1fr 130px 130px" }}
                >
                  <span className="text-[10px] uppercase tracking-wider text-ocean">
                    {r.kind.replace(/_/g, " ")}
                  </span>
                  <span className="font-mono text-xs">{"reference" in r ? r.reference : "—"}</span>
                  <span className="text-sm truncate">
                    {"title" in r ? r.title : "name" in r ? r.name : "—"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {r.kind === "purchase_order"
                      ? fmtMoney(r.amount)
                      : r.kind === "drawing"
                        ? `Rev ${r.current_revision ?? "—"}`
                        : r.kind === "document"
                          ? fmtDate(r.expiry_date)
                          : r.kind === "inventory"
                            ? `Qty ${r.quantity}`
                            : r.kind === "meeting"
                              ? fmtDate(r.scheduled_at)
                              : r.kind === "risk"
                                ? `R${r.rating ?? 0}`
                                : r.kind === "contractor"
                                  ? (r.trade ?? "—")
                                  : "—"}
                  </span>
                  {"status" in r && r.status ? (
                    <StatusBadge value={r.status} />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
              ))}
            </ListShell>
          </Section>
        )}
      </div>
    </AppShell>
  );
}
