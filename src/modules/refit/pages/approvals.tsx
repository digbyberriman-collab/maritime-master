import { useEffect, useMemo, useState } from "react";
import { AppShell, PageHeader } from "@/modules/refit/components/AppShell";
import { RequireAuth } from "@/modules/refit/components/RequireAuth";
import { useActiveVessel } from "@/modules/refit/lib/activeVessel";
import { useAuth } from "@/modules/refit/lib/auth";
import { db } from "@/modules/refit/lib/db";
import {
  ListShell,
  ListHeader,
  EmptyState,
  LoadingRow,
  StatusBadge,
  PriorityBadge,
  Field,
  inputCls,
  fmtMoney,
  fmtDate,
  fmtDateTime,
  ErrorBlock,
  PrimaryBtn,
} from "@/modules/refit/components/ui-kit";
import { can, APPROVAL_PERMISSION, type ApprovalStage } from "@/modules/refit/lib/permissions";

type Pending = {
  entity_type: "change_order" | "crew_request" | "purchase_order";
  entity_id: string;
  vessel_id: string;
  reference: string;
  title: string;
  stage: string;
  approver_id: string | null;
  priority: "low" | "medium" | "high" | "critical";
  cost_value: number | null;
  schedule_days: number | null;
  due_date: string | null;
  submitted_at: string;
};

export default function ApprovalsPage() {
  const { activeVesselId } = useActiveVessel();
  const { roles } = useAuth();
  const [items, setItems] = useState<Pending[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");

  const load = async () => {
    if (!activeVesselId) return;
    const { data, error } = await db
      .from("v_pending_approvals")
      .select("*")
      .eq("vessel_id", activeVesselId)
      .order("submitted_at", { ascending: false });
    if (error) setError(error.message);
    setItems((data as Pending[]) ?? []);
  };
  useEffect(() => {
    load();
  }, [activeVesselId]);

  const filtered = useMemo(() => {
    if (!items) return null;
    return items.filter(
      (i) =>
        (filterType === "all" || i.entity_type === filterType) &&
        (filterPriority === "all" || i.priority === filterPriority),
    );
  }, [items, filterType, filterPriority]);

  const decideCO = async (
    entityId: string,
    stage: ApprovalStage,
    decision: "approved" | "rejected" | "more_info",
  ) => {
    const { error } = await db
      .from("rf_change_order_approvals" as any)
      .update({ decision, decided_at: new Date().toISOString() })
      .eq("change_order_id", entityId)
      .eq("stage", stage);
    if (error) {
      setError(error.message);
      return;
    }
    // re-evaluate CO status
    const [{ data: list }, { data: co }] = await Promise.all([
      db.from("rf_change_order_approvals" as any).select("*").eq("change_order_id", entityId),
      db.from("rf_change_orders" as any).select("required_stages").eq("id", entityId).maybeSingle(),
    ]);
    const required = (co as { required_stages: string[] } | null)?.required_stages ?? [];
    const arr = (list as Array<{ stage: string; decision: string }>) ?? [];
    const allApproved = required.every(
      (s) => arr.find((l) => l.stage === s)?.decision === "approved",
    );
    const anyRejected = arr.some((l) => l.decision === "rejected");
    const anyMoreInfo = arr.some((l) => l.decision === "more_info");
    let newStatus = "under_review";
    let nextStage: string | null = null;
    if (anyRejected) {
      newStatus = "rejected";
    } else if (anyMoreInfo) {
      newStatus = "more_info_required";
    } else if (allApproved) {
      newStatus = "approved";
    } else {
      nextStage =
        required.find((s) => arr.find((l) => l.stage === s)?.decision === "pending") ?? null;
    }
    await db
      .from("rf_change_orders" as any)
      .update({ status: newStatus, current_stage: nextStage })
      .eq("id", entityId);
    load();
  };

  const decideCR = async (entityId: string, decision: "approved" | "rejected") => {
    const newStatus = decision === "approved" ? "completed" : "rejected";
    const { error } = await db
      .from("rf_crew_requests" as any)
      .update({ status: newStatus })
      .eq("id", entityId);
    if (error) setError(error.message);
    load();
  };

  const decidePO = async (entityId: string, decision: "approved" | "rejected") => {
    const newStatus = decision === "approved" ? "approved" : "rejected";
    const { error } = await db
      .from("rf_purchase_orders" as any)
      .update({
        status: newStatus,
        approved_at: decision === "approved" ? new Date().toISOString() : null,
      })
      .eq("id", entityId);
    if (error) setError(error.message);
    load();
  };

  return (
    <AppShell>
      <div className="p-4 sm:p-6 md:p-8 w-full max-w-[1600px] mx-auto">
        <PageHeader
          title="Approvals Centre"
          subtitle="Everything across the project that is currently waiting on a decision"
        />

        <div className="mb-4 flex flex-wrap gap-2 items-end">
          <Field label="Type">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className={`${inputCls} w-44`}
            >
              <option value="all">All types</option>
              <option value="change_order">Change orders</option>
              <option value="crew_request">Crew requests</option>
              <option value="purchase_order">Purchase orders</option>
            </select>
          </Field>
          <Field label="Priority">
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value)}
              className={`${inputCls} w-32`}
            >
              <option value="all">All</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </Field>
          <PrimaryBtn onClick={load}>Refresh</PrimaryBtn>
        </div>

        {error && <ErrorBlock message={error} />}

        <ListShell>
          <ListHeader>
            <div
              style={{
                gridTemplateColumns: "150px 130px 1fr 110px 110px 130px 100px 200px",
                display: "grid",
                width: "100%",
              }}
            >
              <div>Type</div>
              <div>Reference</div>
              <div>Title</div>
              <div>Stage</div>
              <div>Priority</div>
              <div>Cost</div>
              <div>Due</div>
              <div>Action</div>
            </div>
          </ListHeader>
          {filtered === null ? (
            <>
              <LoadingRow />
              <LoadingRow />
            </>
          ) : filtered.length === 0 ? (
            <EmptyState
              title="Nothing awaiting approval"
              hint="When items reach an approval stage they will appear here."
            />
          ) : (
            filtered.map((i) => {
              const stageKey = i.stage as ApprovalStage;
              const allowed =
                i.entity_type === "change_order"
                  ? can(roles, APPROVAL_PERMISSION[stageKey] ?? "change_order.approve.captain")
                  : i.entity_type === "purchase_order"
                    ? can(roles, "po.approve")
                    : can(roles, "crew_request.triage");
              return (
                <div
                  key={`${i.entity_type}-${i.entity_id}-${i.stage}`}
                  className="border-b border-black/5"
                >
                  <div
                    className="px-4 py-3 grid items-center"
                    style={{ gridTemplateColumns: "150px 130px 1fr 110px 110px 130px 100px 200px" }}
                  >
                    <div className="text-xs uppercase tracking-wider text-ocean">
                      {i.entity_type.replace(/_/g, " ")}
                    </div>
                    <div className="font-mono text-xs">{i.reference}</div>
                    <div className="text-sm truncate pr-3">{i.title}</div>
                    <div>
                      <StatusBadge value={i.stage} />
                    </div>
                    <div>
                      <PriorityBadge value={i.priority} />
                    </div>
                    <div className="text-sm tabular-nums">{fmtMoney(i.cost_value)}</div>
                    <div className="text-xs text-muted-foreground">{fmtDate(i.due_date)}</div>
                    <div className="flex gap-1.5">
                      {allowed ? (
                        <>
                          <button
                            onClick={() =>
                              i.entity_type === "change_order"
                                ? decideCO(i.entity_id, stageKey, "approved")
                                : i.entity_type === "purchase_order"
                                  ? decidePO(i.entity_id, "approved")
                                  : decideCR(i.entity_id, "approved")
                            }
                            className="px-2 py-1 text-xs rounded-sm bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          >
                            Approve
                          </button>
                          {i.entity_type === "change_order" && (
                            <button
                              onClick={() => decideCO(i.entity_id, stageKey, "more_info")}
                              className="px-2 py-1 text-xs rounded-sm bg-amber-50 text-amber-800 hover:bg-amber-100"
                            >
                              Info
                            </button>
                          )}
                          <button
                            onClick={() =>
                              i.entity_type === "change_order"
                                ? decideCO(i.entity_id, stageKey, "rejected")
                                : i.entity_type === "purchase_order"
                                  ? decidePO(i.entity_id, "rejected")
                                  : decideCR(i.entity_id, "rejected")
                            }
                            className="px-2 py-1 text-xs rounded-sm bg-red-50 text-red-700 hover:bg-red-100"
                          >
                            Reject
                          </button>
                        </>
                      ) : (
                        <span className="text-[11px] text-muted-foreground">Not your stage</span>
                      )}
                    </div>
                  </div>
                  <div className="px-4 pb-2 text-[11px] text-muted-foreground">
                    Submitted {fmtDateTime(i.submitted_at)} · {i.schedule_days ?? 0}d schedule
                    impact
                  </div>
                </div>
              );
            })
          )}
        </ListShell>
      </div>
    </AppShell>
  );
}
