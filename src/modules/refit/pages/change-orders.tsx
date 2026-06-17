import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Paperclip, History, FileText, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, PageHeader } from "@/modules/refit/components/AppShell";
import { RequireAuth } from "@/modules/refit/components/RequireAuth";
import { useAuth } from "@/modules/refit/lib/auth";
import { useActiveVessel } from "@/modules/refit/lib/activeVessel";
import { db, type ChangeOrder, type ChangeOrderApproval, type Comment } from "@/modules/refit/lib/db";
import {
  ListShell,
  ListHeader,
  EmptyState,
  LoadingRow,
  StatusBadge,
  PriorityBadge,
  PrimaryBtn,
  GhostBtn,
  DangerBtn,
  Drawer,
  Field,
  inputCls,
  fmtMoney,
  fmtDate,
  fmtDateTime,
  ErrorBlock,
  MetaGrid,
  Meta,
  Section,
} from "@/modules/refit/components/ui-kit";
import {
  can,
  APPROVAL_PERMISSION,
  APPROVAL_STAGE_LABEL,
  type ApprovalStage,
} from "@/modules/refit/lib/permissions";

type ChangeOrderAttachment = {
  id: string;
  change_order_id: string;
  vessel_id: string;
  version: number;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  note: string | null;
  is_current: boolean;
  uploaded_by: string | null;
  created_at: string;
};

const STATUS_OPTIONS = [
  "draft",
  "submitted",
  "under_review",
  "more_info_required",
  "approved",
  "rejected",
  "in_progress",
  "completed",
  "closed",
  "cancelled",
];

export default function ChangeOrdersPage() {
  const { roles } = useAuth();
  const { activeVesselId } = useActiveVessel();
  const [items, setItems] = useState<ChangeOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [q, setQ] = useState("");

  const load = async () => {
    if (!activeVesselId) return;
    const { data, error } = await db
      .from("rf_change_orders" as any)
      .select("*")
      .eq("vessel_id", activeVesselId)
      .is("archived_at", null)
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    setItems((data as unknown as ChangeOrder[]) ?? []);
  };

  useEffect(() => {
    load();
  }, [activeVesselId]);

  const filtered = useMemo(() => {
    if (!items) return null;
    return items.filter(
      (co) =>
        (statusFilter === "all" || co.status === statusFilter) &&
        (priorityFilter === "all" || co.priority === priorityFilter) &&
        (q === "" || `${co.reference} ${co.title}`.toLowerCase().includes(q.toLowerCase())),
    );
  }, [items, statusFilter, priorityFilter, q]);

  const canCreate = can(roles, "change_order.create");

  return (
    <AppShell>
      <div className="p-4 sm:p-6 md:p-8 w-full max-w-[1600px] mx-auto">
        <PageHeader
          title="Change Orders"
          subtitle="Formal change requests tracked through every approval stage with full attachment history"
          action={
            <div className="flex gap-2 items-center">
              <Link
                to="/yard/refit/approvals"
                className="px-3 py-2 bg-white border border-black/10 rounded-sm text-sm hover:bg-secondary"
              >
                Approvals
              </Link>
              {canCreate && (
                <button
                  onClick={() => setCreateOpen(true)}
                  aria-label="New change order"
                  title="New change order"
                  className="inline-flex items-center justify-center h-9 w-9 rounded-sm bg-navy text-white hover:opacity-90 transition"
                >
                  <Plus size={18} />
                </button>
              )}
            </div>
          }
        />

        <div className="mb-4 flex flex-wrap gap-2 items-end">
          <Field label="Search">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Title or reference"
              className={`${inputCls} w-64`}
            />
          </Field>
          <Field label="Status">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`${inputCls} w-44`}
            >
              <option value="all">All</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className={`${inputCls} w-32`}
            >
              <option value="all">All</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </Field>
        </div>

        {error && <ErrorBlock message={error} />}

        <ListShell>
          <ListHeader>
            <div
              style={{
                gridTemplateColumns: "120px 1fr 120px 100px 130px 110px 80px",
                display: "grid",
                width: "100%",
              }}
            >
              <div>Reference</div>
              <div>Title</div>
              <div>Status</div>
              <div>Priority</div>
              <div>Cost est.</div>
              <div>Due</div>
              <div>Days</div>
            </div>
          </ListHeader>
          {filtered === null ? (
            <>
              <LoadingRow />
              <LoadingRow />
              <LoadingRow />
            </>
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No change orders match"
              hint={
                items && items.length === 0
                  ? "Raise the first one when you have a scope or cost change to track."
                  : "Adjust the filters above."
              }
              action={
                canCreate && items && items.length === 0 ? (
                  <PrimaryBtn onClick={() => setCreateOpen(true)}>Create</PrimaryBtn>
                ) : undefined
              }
            />
          ) : (
            filtered.map((co) => (
              <button
                key={co.id}
                onClick={() => setOpenId(co.id)}
                className="block w-full text-left cursor-pointer hover:bg-paper transition border-b border-black/5"
              >
                <div
                  className="px-4 py-3 grid items-center"
                  style={{ gridTemplateColumns: "120px 1fr 120px 100px 130px 110px 80px" }}
                >
                  <div className="font-mono text-xs">{co.reference}</div>
                  <div className="text-sm truncate pr-3">{co.title}</div>
                  <div>
                    <StatusBadge value={co.status} />
                  </div>
                  <div>
                    <PriorityBadge value={co.priority} />
                  </div>
                  <div className="text-sm tabular-nums">{fmtMoney(co.cost_estimate)}</div>
                  <div className="text-xs text-muted-foreground">{fmtDate(co.due_date)}</div>
                  <div className="text-xs tabular-nums">{co.schedule_impact_days ?? 0}d</div>
                </div>
              </button>
            ))
          )}
        </ListShell>
      </div>

      <CreateChangeOrderDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          load();
        }}
      />
      <ChangeOrderDetailDrawer id={openId} onClose={() => setOpenId(null)} onUpdated={load} />
    </AppShell>
  );
}

function CreateChangeOrderDrawer({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { activeVesselId } = useActiveVessel();
  const [title, setTitle] = useState("");
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [costEstimate, setCostEstimate] = useState("");
  const [scheduleDays, setScheduleDays] = useState("0");
  const [dueDate, setDueDate] = useState("");
  const [requireCaptain, setRequireCaptain] = useState(true);
  const [requireOwnerRep, setRequireOwnerRep] = useState(true);
  const [requireYard, setRequireYard] = useState(true);
  const [requireFinance, setRequireFinance] = useState(true);
  const [requireTechnical, setRequireTechnical] = useState(false);
  const [requireClassFlag, setRequireClassFlag] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [attachNote, setAttachNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const stages = useMemo(() => {
    const s: string[] = [];
    if (requireCaptain) s.push("captain");
    if (requireOwnerRep) s.push("owner_rep");
    if (requireYard) s.push("yard");
    if (requireFinance) s.push("finance");
    if (requireTechnical) s.push("technical");
    if (requireClassFlag) s.push("class_flag");
    return s;
  }, [
    requireCaptain,
    requireOwnerRep,
    requireYard,
    requireFinance,
    requireTechnical,
    requireClassFlag,
  ]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeVesselId || stages.length === 0) {
      setErr("At least one approval stage is required.");
      return;
    }
    if (!title.trim()) {
      setErr("Title is required.");
      return;
    }
    setBusy(true);
    setErr(null);

    const { data: refData } = await db.rpc("next_reference", {
      _vessel_id: activeVesselId,
      _prefix: "CO",
      _table: "change_orders",
    });
    const reference = (refData as string) ?? `CO-${Date.now().toString().slice(-4)}`;

    const { data, error } = await db
      .from("rf_change_orders" as any)
      .insert({
        vessel_id: activeVesselId,
        reference,
        title,
        description: description || null,
        reason: reason || null,
        priority,
        cost_estimate: costEstimate ? Number(costEstimate) : null,
        schedule_impact_days: Number(scheduleDays) || 0,
        due_date: dueDate || null,
        required_stages: stages,
        status: "submitted",
        current_stage: stages[0],
      })
      .select()
      .maybeSingle();

    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }

    if (data) {
      const coId = (data as { id: string }).id;
      const rows = stages.map((stage) => ({
        change_order_id: coId,
        stage,
        decision: "pending",
      }));
      const { error: appErr } = await db.from("rf_change_order_approvals" as any).insert(rows);
      if (appErr) {
        setErr(`Created but failed to seed approvals: ${appErr.message}`);
        setBusy(false);
        return;
      }

      // Upload initial attachments as v1, v2, … all marked current
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const version = i + 1;
        const ext = f.name.split(".").pop() || "bin";
        const path = `${activeVesselId}/${coId}/v${version}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("change-order-attachments")
          .upload(path, f, { contentType: f.type || undefined });
        if (upErr) {
          setErr(`Created but attachment upload failed: ${upErr.message}`);
          setBusy(false);
          return;
        }
        await db.from("change_order_attachments").insert({
          change_order_id: coId,
          vessel_id: activeVesselId,
          version,
          file_path: path,
          file_name: f.name,
          mime_type: f.type || null,
          size_bytes: f.size,
          note: attachNote || null,
          is_current: version === files.length,
        });
      }
    }

    setBusy(false);
    setTitle("");
    setReason("");
    setDescription("");
    setCostEstimate("");
    setScheduleDays("0");
    setDueDate("");
    setFiles([]);
    setAttachNote("");
    onCreated();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="New change order"
      wide
      footer={
        <div className="flex justify-end gap-2">
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <PrimaryBtn
            onClick={() =>
              (document.getElementById("co-create-form") as HTMLFormElement)?.requestSubmit()
            }
            disabled={busy}
          >
            {busy ? "Creating…" : "Submit for review"}
          </PrimaryBtn>
        </div>
      }
    >
      <form id="co-create-form" onSubmit={submit} className="space-y-4">
        {err && <ErrorBlock message={err} />}
        <Field label="Title" required>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Reason for change" hint="Why is this change being raised?">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className={inputCls}
          />
        </Field>
        <Field label="Description / scope">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className={inputCls}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Priority" required>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as typeof priority)}
              className={inputCls}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </Field>
          <Field label="Due date">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Cost estimate (USD)">
            <input
              type="number"
              step="0.01"
              value={costEstimate}
              onChange={(e) => setCostEstimate(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="Schedule impact (days)">
            <input
              type="number"
              value={scheduleDays}
              onChange={(e) => setScheduleDays(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>
        <div className="border border-black/5 rounded-sm bg-white p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Required approval stages
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={requireCaptain}
                onChange={(e) => setRequireCaptain(e.target.checked)}
              />{" "}
              Captain
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={requireOwnerRep}
                onChange={(e) => setRequireOwnerRep(e.target.checked)}
              />{" "}
              Owner's Rep
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={requireYard}
                onChange={(e) => setRequireYard(e.target.checked)}
              />{" "}
              Yard PM
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={requireFinance}
                onChange={(e) => setRequireFinance(e.target.checked)}
              />{" "}
              Finance
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={requireTechnical}
                onChange={(e) => setRequireTechnical(e.target.checked)}
              />{" "}
              Technical Manager
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={requireClassFlag}
                onChange={(e) => setRequireClassFlag(e.target.checked)}
              />{" "}
              Class / Flag
            </label>
          </div>
        </div>

        <div className="border border-black/10 rounded-sm bg-white p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
            <Paperclip size={12} /> Supporting attachments
          </div>
          <label className="inline-flex items-center gap-2 px-3 py-2 text-xs rounded-sm border border-black/10 bg-paper hover:bg-secondary cursor-pointer">
            <Paperclip size={14} />
            <span>Attach files (PDF, drawings, quotes)</span>
            <input
              type="file"
              multiple
              accept="application/pdf,image/*,.dwg,.dxf,.xlsx,.xls,.doc,.docx"
              className="hidden"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
          </label>
          {files.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs">
              {files.map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-muted-foreground">
                  <FileText size={12} /> v{i + 1} · {f.name} · {Math.round(f.size / 1024)} KB
                </li>
              ))}
            </ul>
          )}
          {files.length > 0 && (
            <div className="mt-2">
              <Field label="Note (optional)">
                <input
                  value={attachNote}
                  onChange={(e) => setAttachNote(e.target.value)}
                  className={inputCls}
                  placeholder="e.g. initial yard quotation"
                />
              </Field>
            </div>
          )}
        </div>
      </form>
    </Drawer>
  );
}

function ChangeOrderDetailDrawer({
  id,
  onClose,
  onUpdated,
}: {
  id: string | null;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { roles } = useAuth();
  const [co, setCo] = useState<ChangeOrder | null>(null);
  const [approvals, setApprovals] = useState<ChangeOrderApproval[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [attachments, setAttachments] = useState<ChangeOrderAttachment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadAttachments = async (coId: string) => {
    const { data } = await db
      .from("change_order_attachments")
      .select("*")
      .eq("change_order_id", coId)
      .order("version", { ascending: false });
    setAttachments((data as unknown as ChangeOrderAttachment[]) ?? []);
  };

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [coRes, apRes, cmRes] = await Promise.all([
        db.from("rf_change_orders" as any).select("*").eq("id", id).maybeSingle(),
        db.from("rf_change_order_approvals" as any).select("*").eq("change_order_id", id).order("created_at"),
        db
          .from("rf_request_comments" as any)
          .select("*")
          .eq("parent_type", "change_order")
          .eq("parent_id", id)
          .order("created_at"),
      ]);
      if (coRes.error) setErr(coRes.error.message);
      setCo((coRes.data as ChangeOrder) ?? null);
      setApprovals((apRes.data as unknown as ChangeOrderApproval[]) ?? []);
      setComments((cmRes.data as unknown as Comment[]) ?? []);
      await loadAttachments(id);
    })();
  }, [id]);

  const uploadNewRevision = async (file: File, note: string) => {
    if (!co) return;
    setBusy(true);
    setErr(null);
    const nextVersion = (attachments[0]?.version ?? 0) + 1;
    const ext = file.name.split(".").pop() || "bin";
    const path = `${co.vessel_id}/${co.id}/v${nextVersion}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("change-order-attachments")
      .upload(path, file, { contentType: file.type || undefined });
    if (upErr) {
      setErr(upErr.message);
      setBusy(false);
      return;
    }
    // Mark previous as superseded
    await db
      .from("change_order_attachments")
      .update({ is_current: false })
      .eq("change_order_id", co.id);
    await db.from("change_order_attachments").insert({
      change_order_id: co.id,
      vessel_id: co.vessel_id,
      version: nextVersion,
      file_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      note: note || null,
      is_current: true,
    });
    await loadAttachments(co.id);
    setBusy(false);
  };

  const decide = async (stage: ApprovalStage, decision: "approved" | "rejected" | "more_info") => {
    if (!co) return;
    setBusy(true);
    setErr(null);
    const { error } = await db
      .from("rf_change_order_approvals" as any)
      .update({ decision, decided_at: new Date().toISOString() })
      .eq("change_order_id", co.id)
      .eq("stage", stage);
    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }

    // Re-evaluate CO status based on stage decisions.
    const { data: latest } = await db
      .from("rf_change_order_approvals" as any)
      .select("*")
      .eq("change_order_id", co.id);
    const list = (latest as unknown as ChangeOrderApproval[]) ?? [];
    const required = co.required_stages.filter((s) => list.some((l) => l.stage === s));
    const allApproved = required.every(
      (s) => list.find((l) => l.stage === s)?.decision === "approved",
    );
    const anyRejected = list.some((l) => l.decision === "rejected");
    const anyMoreInfo = list.some((l) => l.decision === "more_info");

    let newStatus = co.status;
    let nextStage: string | null = co.current_stage;
    if (anyRejected) {
      newStatus = "rejected";
      nextStage = null;
    } else if (anyMoreInfo) {
      newStatus = "more_info_required";
    } else if (allApproved) {
      newStatus = "approved";
      nextStage = null;
    } else {
      newStatus = "under_review";
      nextStage =
        co.required_stages.find((s) => list.find((l) => l.stage === s)?.decision === "pending") ??
        null;
    }

    await db
      .from("rf_change_orders" as any)
      .update({ status: newStatus, current_stage: nextStage })
      .eq("id", co.id);

    setBusy(false);
    onUpdated();
    // refresh local
    const { data: coNew } = await db
      .from("rf_change_orders" as any)
      .select("*")
      .eq("id", co.id)
      .maybeSingle();
    setCo((coNew as ChangeOrder) ?? null);
    setApprovals(list);
  };

  const addComment = async () => {
    if (!co || !newComment.trim()) return;
    setBusy(true);
    const { error } = await db.from("rf_request_comments" as any).insert({
      parent_type: "change_order",
      parent_id: co.id,
      vessel_id: co.vessel_id,
      body: newComment,
    });
    if (error) setErr(error.message);
    setNewComment("");
    const { data } = await db
      .from("rf_request_comments" as any)
      .select("*")
      .eq("parent_type", "change_order")
      .eq("parent_id", co.id)
      .order("created_at");
    setComments((data as unknown as Comment[]) ?? []);
    setBusy(false);
  };

  const transition = async (newStatus: ChangeOrder["status"]) => {
    if (!co) return;
    setBusy(true);
    const { error } = await db.from("rf_change_orders" as any).update({ status: newStatus }).eq("id", co.id);
    if (error) setErr(error.message);
    const { data } = await db.from("rf_change_orders" as any).select("*").eq("id", co.id).maybeSingle();
    setCo((data as ChangeOrder) ?? null);
    setBusy(false);
    onUpdated();
  };

  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      title={co ? `${co.reference} · ${co.title}` : "Loading…"}
      wide
    >
      {!co ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="space-y-6">
          {err && <ErrorBlock message={err} />}

          <div className="flex flex-wrap gap-2 items-center">
            <StatusBadge value={co.status} />
            <PriorityBadge value={co.priority} />
            {co.current_stage && (
              <span className="text-xs text-muted-foreground">
                Awaiting{" "}
                {APPROVAL_STAGE_LABEL[co.current_stage as ApprovalStage] ?? co.current_stage}
              </span>
            )}
          </div>

          <Section title="Details">
            <MetaGrid>
              <Meta label="Reason" value={co.reason ?? "—"} />
              <Meta label="Cost estimate" value={fmtMoney(co.cost_estimate)} />
              <Meta label="Approved cost" value={fmtMoney(co.approved_cost)} />
              <Meta label="Schedule impact" value={`${co.schedule_impact_days ?? 0} day(s)`} />
              <Meta label="Due" value={fmtDate(co.due_date)} />
              <Meta label="Created" value={fmtDateTime(co.created_at)} />
            </MetaGrid>
            {co.description && (
              <div className="mt-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  Description
                </div>
                <div className="text-sm whitespace-pre-wrap">{co.description}</div>
              </div>
            )}
          </Section>

          <AttachmentsSection
            attachments={attachments}
            canUpload={can(roles, "change_order.create")}
            busy={busy}
            onUpload={uploadNewRevision}
          />



          <Section title="Approval chain">
            <div className="space-y-2">
              {co.required_stages.map((stage) => {
                const a = approvals.find((x) => x.stage === stage);
                const stageKey = stage as ApprovalStage;
                const allowed = can(roles, APPROVAL_PERMISSION[stageKey]);
                return (
                  <div
                    key={stage}
                    className="flex flex-wrap items-center gap-2 py-2 border-b border-black/5 text-sm"
                  >
                    <span className="font-medium w-32">
                      {APPROVAL_STAGE_LABEL[stageKey] ?? stage}
                    </span>
                    <StatusBadge value={a?.decision ?? "pending"} />
                    <span className="text-xs text-muted-foreground ml-2">
                      {a?.decided_at ? fmtDateTime(a.decided_at) : ""}
                    </span>
                    <div className="ml-auto flex gap-1.5">
                      {a?.decision === "pending" &&
                        allowed &&
                        co.status !== "rejected" &&
                        co.status !== "approved" && (
                          <>
                            <button
                              onClick={() => decide(stageKey, "approved")}
                              disabled={busy}
                              className="px-2 py-1 text-xs rounded-sm bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => decide(stageKey, "more_info")}
                              disabled={busy}
                              className="px-2 py-1 text-xs rounded-sm bg-amber-50 text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                            >
                              Need info
                            </button>
                            <button
                              onClick={() => decide(stageKey, "rejected")}
                              disabled={busy}
                              className="px-2 py-1 text-xs rounded-sm bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </>
                        )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title="Workflow">
            <div className="flex flex-wrap gap-2">
              {co.status === "approved" && (
                <PrimaryBtn onClick={() => transition("in_progress")}>
                  Move to in progress
                </PrimaryBtn>
              )}
              {co.status === "in_progress" && (
                <PrimaryBtn onClick={() => transition("completed")}>Mark completed</PrimaryBtn>
              )}
              {co.status === "completed" && (
                <PrimaryBtn onClick={() => transition("closed")}>Close</PrimaryBtn>
              )}
              {!["closed", "cancelled", "rejected"].includes(co.status) && (
                <DangerBtn onClick={() => transition("cancelled")}>Cancel</DangerBtn>
              )}
            </div>
          </Section>

          <Section title={`Comments (${comments.length})`}>
            <div className="space-y-3 mb-3">
              {comments.length === 0 ? (
                <div className="text-xs text-muted-foreground">No comments yet.</div>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="text-sm border-b border-black/5 pb-2">
                    <div className="text-[11px] text-muted-foreground mb-0.5">
                      {fmtDateTime(c.created_at)}
                    </div>
                    <div className="whitespace-pre-wrap">{c.body}</div>
                  </div>
                ))
              )}
            </div>
            <div className="flex gap-2">
              <input
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                className={inputCls}
                placeholder="Add a comment…"
              />
              <PrimaryBtn onClick={addComment} disabled={busy || !newComment.trim()}>
                Post
              </PrimaryBtn>
            </div>
          </Section>
        </div>
      )}
    </Drawer>
  );
}

function AttachmentsSection({
  attachments,
  canUpload,
  busy,
  onUpload,
}: {
  attachments: ChangeOrderAttachment[];
  canUpload: boolean;
  busy: boolean;
  onUpload: (file: File, note: string) => Promise<void>;
}) {
  const [pending, setPending] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const current = attachments.find((a) => a.is_current) ?? attachments[0];
  const history = attachments.filter((a) => a.id !== current?.id);
  const [showHistory, setShowHistory] = useState(false);

  return (
    <Section
      title={`Attachments${attachments.length ? ` (${attachments.length})` : ""}`}
    >
      {!current && (
        <div className="text-xs text-muted-foreground mb-3">No attachments yet.</div>
      )}
      {current && (
        <div className="mb-3 border border-emerald-200 bg-emerald-50/40 rounded-sm p-3">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-emerald-700 mb-1">
            <CheckCircle2 size={12} /> Current revision · v{current.version}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <FileText size={14} />
            <SignedFileLink path={current.file_path} label={current.file_name} />
            <span className="text-xs text-muted-foreground ml-auto">
              {fmtDateTime(current.created_at)}
            </span>
          </div>
          {current.note && (
            <div className="text-xs text-muted-foreground mt-1">{current.note}</div>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="mb-3">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <History size={12} />
            {showHistory ? "Hide" : "Show"} previous revisions ({history.length})
          </button>
          {showHistory && (
            <ul className="mt-2 space-y-1.5">
              {history.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-2 text-sm py-1.5 border-b border-black/5 text-muted-foreground"
                >
                  <span className="font-mono text-[11px] w-8">v{a.version}</span>
                  <FileText size={12} />
                  <SignedFileLink path={a.file_path} label={a.file_name} />
                  <span className="text-[11px] ml-auto">{fmtDateTime(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {canUpload && (
        <div className="border-t border-black/10 pt-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
            Upload new revision
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <label className="inline-flex items-center gap-2 px-3 py-2 text-xs rounded-sm border border-black/10 bg-white hover:bg-secondary cursor-pointer">
              <Paperclip size={14} />
              <span className="truncate max-w-[200px]">
                {pending ? pending.name : "Choose file"}
              </span>
              <input
                type="file"
                accept="application/pdf,image/*,.dwg,.dxf,.xlsx,.xls,.doc,.docx"
                className="hidden"
                onChange={(e) => setPending(e.target.files?.[0] ?? null)}
              />
            </label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Revision note (optional)"
              className={`${inputCls} flex-1 min-w-[180px]`}
            />
            <PrimaryBtn
              disabled={!pending || busy}
              onClick={async () => {
                if (!pending) return;
                await onUpload(pending, note);
                setPending(null);
                setNote("");
              }}
            >
              {busy ? "Uploading…" : `Upload v${(current?.version ?? 0) + 1}`}
            </PrimaryBtn>
          </div>
        </div>
      )}
    </Section>
  );
}

function SignedFileLink({ path, label }: { path: string; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.storage
        .from("change-order-attachments")
        .createSignedUrl(path, 3600);
      setUrl(data?.signedUrl ?? null);
    })();
  }, [path]);
  if (!url) return <span>{label}</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="underline underline-offset-2 hover:text-navy truncate"
    >
      {label}
    </a>
  );
}
