import { useEffect, useState } from "react";
import { AppShell, PageHeader } from "@/modules/refit/components/AppShell";
import { RequireAuth } from "@/modules/refit/components/RequireAuth";
import { useActiveVessel } from "@/modules/refit/lib/activeVessel";
import { useAuth } from "@/modules/refit/lib/auth";
import { db } from "@/modules/refit/lib/db";
import {
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

type Drawing = {
  id: string;
  reference: string;
  name: string;
  system: string | null;
  area: string | null;
  current_revision: string | null;
  status: string | null;
  approval_status: string | null;
  approval_deadline: string | null;
  approved_revision: string | null;
};

export default function DrawingsPage() {
  const { roles } = useAuth();
  const { activeVesselId } = useActiveVessel();
  const [items, setItems] = useState<Drawing[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = async () => {
    if (!activeVesselId) return;
    const { data, error } = await db
      .from("rf_drawings" as any)
      .select("*")
      .eq("vessel_id", activeVesselId)
      .is("archived_at", null)
      .order("reference");
    if (error) setError(error.message);
    setItems((data as Drawing[]) ?? []);
  };
  useEffect(() => {
    load();
  }, [activeVesselId]);

  const canCreate = can(roles, "drawing.review");
  const canApprove = can(roles, "drawing.approve");

  const transition = async (id: string, status: string) => {
    const { error } = await db.from("rf_drawings" as any).update({ approval_status: status }).eq("id", id);
    if (error) setError(error.message);
    load();
  };

  return (
    <AppShell>
      <div className="p-4 sm:p-6 md:p-8 w-full max-w-[1600px] mx-auto">
        <PageHeader
          title="Drawings & Plan Approvals"
          subtitle="Drawing register, revision control, multi-approver review workflow"
          action={
            canCreate ? (
              <PrimaryBtn onClick={() => setCreateOpen(true)}>Add drawing</PrimaryBtn>
            ) : undefined
          }
        />
        {error && <ErrorBlock message={error} />}

        <ListShell>
          <ListHeader>
            <div
              style={{
                gridTemplateColumns: "150px 1fr 130px 130px 100px 130px",
                display: "grid",
                width: "100%",
              }}
            >
              <div>Reference</div>
              <div>Name</div>
              <div>System</div>
              <div>Approval</div>
              <div>Rev</div>
              <div>Approval due</div>
            </div>
          </ListHeader>
          {items.length === 0 ? (
            <EmptyState
              title="No drawings registered yet"
              hint="Add the first drawing to start the approval workflow."
            />
          ) : (
            items.map((d) => (
              <button
                key={d.id}
                onClick={() => setOpenId(d.id)}
                className="w-full text-left hover:bg-paper border-b border-black/5"
              >
                <div
                  className="px-4 py-3 grid items-center"
                  style={{ gridTemplateColumns: "150px 1fr 130px 130px 100px 130px" }}
                >
                  <span className="font-mono text-xs">{d.reference}</span>
                  <span className="text-sm truncate pr-2">{d.name}</span>
                  <span className="text-xs text-muted-foreground">{d.system ?? "—"}</span>
                  <StatusBadge value={d.approval_status ?? d.status ?? "draft"} />
                  <span className="text-xs tabular-nums">{d.current_revision ?? "—"}</span>
                  <span className="text-xs text-muted-foreground">
                    {fmtDate(d.approval_deadline)}
                  </span>
                </div>
              </button>
            ))
          )}
        </ListShell>
      </div>

      <CreateDrawingDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          load();
        }}
        vesselId={activeVesselId}
      />
      <DrawingDetailDrawer
        id={openId}
        onClose={() => setOpenId(null)}
        canApprove={canApprove}
        onTransition={transition}
      />
    </AppShell>
  );
}

function CreateDrawingDrawer(props: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  vesselId: string | null;
}) {
  const [reference, setReference] = useState("");
  const [name, setName] = useState("");
  const [system, setSystem] = useState("");
  const [area, setArea] = useState("");
  const [revision, setRevision] = useState("A");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!props.vesselId || !reference || !name) {
      setErr("Reference and name required.");
      return;
    }
    setBusy(true);
    setErr(null);
    const { error } = await db.from("rf_drawings" as any).insert({
      vessel_id: props.vesselId,
      reference,
      name,
      system: system || null,
      area: area || null,
      current_revision: revision,
      approval_status: "submitted",
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setReference("");
    setName("");
    setSystem("");
    setArea("");
    setRevision("A");
    props.onCreated();
  };

  return (
    <Drawer
      open={props.open}
      onClose={props.onClose}
      title="Add drawing"
      footer={
        <div className="flex justify-end gap-2">
          <GhostBtn onClick={props.onClose}>Cancel</GhostBtn>
          <PrimaryBtn
            onClick={() =>
              (document.getElementById("dwg-form") as HTMLFormElement)?.requestSubmit()
            }
            disabled={busy}
          >
            {busy ? "Saving…" : "Save"}
          </PrimaryBtn>
        </div>
      }
    >
      <form id="dwg-form" onSubmit={submit} className="space-y-3">
        {err && <ErrorBlock message={err} />}
        <Field label="Drawing reference" required>
          <input
            required
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Name" required>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="System">
          <input value={system} onChange={(e) => setSystem(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Area">
          <input value={area} onChange={(e) => setArea(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Initial revision">
          <input
            value={revision}
            onChange={(e) => setRevision(e.target.value)}
            className={inputCls}
          />
        </Field>
      </form>
    </Drawer>
  );
}

function DrawingDetailDrawer({
  id,
  onClose,
  canApprove,
  onTransition,
}: {
  id: string | null;
  onClose: () => void;
  canApprove: boolean;
  onTransition: (id: string, status: string) => void;
}) {
  const [d, setD] = useState<Drawing | null>(null);
  const [revs, setRevs] = useState<
    Array<{ id: string; revision: string; reason: string; created_at: string }>
  >([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [a, b] = await Promise.all([
        db.from("rf_drawings" as any).select("*").eq("id", id).maybeSingle(),
        db
          .from("rf_drawing_revisions" as any)
          .select("*")
          .eq("drawing_id", id)
          .order("created_at", { ascending: false }),
      ]);
      setD((a.data as Drawing) ?? null);
      setRevs((b.data as never) ?? []);
    })();
  }, [id]);

  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      title={d ? `${d.reference} · ${d.name}` : "Loading…"}
      wide
    >
      {!d ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2 items-center">
            <StatusBadge value={d.approval_status ?? d.status ?? "draft"} />
            <span className="text-xs text-muted-foreground">
              Current rev {d.current_revision ?? "—"}
            </span>
            {d.approved_revision && (
              <span className="text-xs text-emerald-700">Approved rev {d.approved_revision}</span>
            )}
          </div>
          {canApprove && (
            <div className="flex flex-wrap gap-2">
              {[
                "submitted",
                "under_review",
                "comments_issued",
                "revised",
                "approved",
                "approved_with_comments",
                "rejected",
                "superseded",
                "archived",
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => onTransition(d.id, s)}
                  className="px-2 py-1 text-xs rounded-sm bg-white border border-black/10 hover:bg-secondary"
                >
                  {s.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          )}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Revision history
            </div>
            {revs.length === 0 ? (
              <div className="text-xs text-muted-foreground">No revisions logged.</div>
            ) : (
              <div className="divide-y divide-black/5">
                {revs.map((r) => (
                  <div key={r.id} className="flex justify-between py-2 text-sm">
                    <span className="font-mono">{r.revision}</span>
                    <span className="text-xs text-muted-foreground">{r.reason}</span>
                    <span className="text-xs text-muted-foreground">{fmtDate(r.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}
