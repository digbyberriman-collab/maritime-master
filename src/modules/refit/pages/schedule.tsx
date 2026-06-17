import { useEffect, useState } from "react";
import { AppShell, PageHeader } from "@/modules/refit/components/AppShell";
import { RequireAuth } from "@/modules/refit/components/RequireAuth";
import { useActiveVessel } from "@/modules/refit/lib/activeVessel";
import { useAuth } from "@/modules/refit/lib/auth";
import { db } from "@/modules/refit/lib/db";
import {
  Section,
  ListShell,
  ListHeader,
  EmptyState,
  ErrorBlock,
  fmtDate,
  StatusBadge,
  PrimaryBtn,
  Drawer,
  GhostBtn,
  Field,
  inputCls,
} from "@/modules/refit/components/ui-kit";
import { can } from "@/modules/refit/lib/permissions";

type Milestone = {
  id: string;
  name: string;
  planned_date: string;
  actual_date: string | null;
  rag: string;
};
type ScheduleItem = {
  id: string;
  name: string;
  trade: string | null;
  baseline_start: string | null;
  baseline_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  on_critical_path: boolean | null;
};

export default function SchedulePage() {
  const { roles } = useAuth();
  const { activeVesselId } = useActiveVessel();
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [tasks, setTasks] = useState<ScheduleItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [openMs, setOpenMs] = useState(false);
  const [openTask, setOpenTask] = useState(false);

  const load = async () => {
    if (!activeVesselId) return;
    const [m, s] = await Promise.all([
      db.from("rf_milestones" as any).select("*").eq("vessel_id", activeVesselId).order("planned_date"),
      db.from("rf_schedule_items" as any).select("*").eq("vessel_id", activeVesselId).order("baseline_start"),
    ]);
    if (m.error) setError(m.error.message);
    setMilestones((m.data as Milestone[]) ?? []);
    setTasks((s.data as ScheduleItem[]) ?? []);
  };
  useEffect(() => {
    load();
  }, [activeVesselId]);

  const canManage = can(roles, "schedule.manage");

  return (
    <AppShell>
      <div className="p-4 sm:p-6 md:p-8 w-full max-w-[1600px] mx-auto">
        <PageHeader
          title="Schedule & Planning"
          subtitle="Master timeline, milestones, sea trials, class inspections and yard windows"
          action={
            canManage ? (
              <div className="flex gap-2">
                <GhostBtn onClick={() => setOpenMs(true)}>Add milestone</GhostBtn>
                <PrimaryBtn onClick={() => setOpenTask(true)}>Add task</PrimaryBtn>
              </div>
            ) : undefined
          }
        />

        {error && <ErrorBlock message={error} />}

        <div className="grid grid-cols-1 gap-6">
          <Section title="Milestones">
            {milestones.length === 0 ? (
              <EmptyState
                title="No milestones yet"
                hint="Add HATs, SATs, class inspections, delivery dates here."
              />
            ) : (
              <ListShell>
                <ListHeader>
                  <div
                    style={{
                      gridTemplateColumns: "1fr 140px 140px 80px",
                      display: "grid",
                      width: "100%",
                    }}
                  >
                    <div>Milestone</div>
                    <div>Planned</div>
                    <div>Actual</div>
                    <div>RAG</div>
                  </div>
                </ListHeader>
                {milestones.map((m) => (
                  <div
                    key={m.id}
                    className="px-4 py-2.5 grid items-center border-b border-black/5"
                    style={{ gridTemplateColumns: "1fr 140px 140px 80px" }}
                  >
                    <span className="text-sm">{m.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {fmtDate(m.planned_date)}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {fmtDate(m.actual_date)}
                    </span>
                    <StatusBadge value={m.rag} />
                  </div>
                ))}
              </ListShell>
            )}
          </Section>

          <Section title="Schedule tasks">
            {tasks.length === 0 ? (
              <EmptyState title="No tasks yet" />
            ) : (
              <ListShell>
                <ListHeader>
                  <div
                    style={{
                      gridTemplateColumns: "1fr 140px 140px 140px 140px 100px",
                      display: "grid",
                      width: "100%",
                    }}
                  >
                    <div>Task</div>
                    <div>Trade</div>
                    <div>Baseline start</div>
                    <div>Baseline end</div>
                    <div>Actual end</div>
                    <div>Critical</div>
                  </div>
                </ListHeader>
                {tasks.map((t) => (
                  <div
                    key={t.id}
                    className="px-4 py-2.5 grid items-center border-b border-black/5"
                    style={{ gridTemplateColumns: "1fr 140px 140px 140px 140px 100px" }}
                  >
                    <span className="text-sm">{t.name}</span>
                    <span className="text-xs text-muted-foreground">{t.trade ?? "—"}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {fmtDate(t.baseline_start)}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {fmtDate(t.baseline_end)}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {fmtDate(t.actual_end)}
                    </span>
                    {t.on_critical_path ? (
                      <span className="text-[10px] uppercase tracking-wider text-danger font-bold">
                        Critical
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                  </div>
                ))}
              </ListShell>
            )}
          </Section>
        </div>
      </div>

      <CreateDrawer
        open={openMs}
        onClose={() => setOpenMs(false)}
        onCreated={() => {
          setOpenMs(false);
          load();
        }}
        title="Add milestone"
        table="milestones"
        fields={[
          { name: "name", label: "Name", type: "text", required: true },
          { name: "planned_date", label: "Planned date", type: "date", required: true },
          {
            name: "rag",
            label: "RAG",
            type: "select",
            default: "green",
            options: ["green", "amber", "red"],
          },
        ]}
        vesselId={activeVesselId}
      />
      <CreateDrawer
        open={openTask}
        onClose={() => setOpenTask(false)}
        onCreated={() => {
          setOpenTask(false);
          load();
        }}
        title="Add schedule task"
        table="schedule_items"
        fields={[
          { name: "name", label: "Task name", type: "text", required: true },
          { name: "trade", label: "Trade / dept", type: "text" },
          { name: "baseline_start", label: "Baseline start", type: "date" },
          { name: "baseline_end", label: "Baseline end", type: "date" },
        ]}
        vesselId={activeVesselId}
      />
    </AppShell>
  );
}

function CreateDrawer(props: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  title: string;
  table: string;
  vesselId: string | null;
  fields: Array<{
    name: string;
    label: string;
    type: "text" | "date" | "select";
    required?: boolean;
    default?: string;
    options?: string[];
  }>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const v: Record<string, string> = {};
    for (const f of props.fields) v[f.name] = f.default ?? "";
    setValues(v);
  }, [props.fields, props.open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!props.vesselId) return;
    for (const f of props.fields)
      if (f.required && !values[f.name]) {
        setErr(`${f.label} required`);
        return;
      }
    setBusy(true);
    const payload: Record<string, unknown> = { vessel_id: props.vesselId };
    for (const f of props.fields) if (values[f.name]) payload[f.name] = values[f.name];
    const { error } = await db.from(props.table).insert(payload);
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    props.onCreated();
  };

  return (
    <Drawer
      open={props.open}
      onClose={props.onClose}
      title={props.title}
      footer={
        <div className="flex justify-end gap-2">
          <GhostBtn onClick={props.onClose}>Cancel</GhostBtn>
          <PrimaryBtn
            onClick={() =>
              (document.getElementById("sched-form") as HTMLFormElement)?.requestSubmit()
            }
            disabled={busy}
          >
            {busy ? "Saving…" : "Save"}
          </PrimaryBtn>
        </div>
      }
    >
      <form id="sched-form" onSubmit={submit} className="space-y-4">
        {err && <ErrorBlock message={err} />}
        {props.fields.map((f) => (
          <Field key={f.name} label={f.label} required={f.required}>
            {f.type === "select" ? (
              <select
                value={values[f.name] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                className={inputCls}
              >
                {(f.options ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={f.type}
                value={values[f.name] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                className={inputCls}
              />
            )}
          </Field>
        ))}
      </form>
    </Drawer>
  );
}
