import { useEffect, useMemo, useState } from "react";
import { Plus, Paperclip, FileText } from "lucide-react";
import { supabase as supabaseClient } from "@/integrations/supabase/client";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase: any = supabaseClient;
import { AppShell, PageHeader } from "@/modules/refit/components/AppShell";
import { RequireAuth } from "@/modules/refit/components/RequireAuth";
import { useAuth } from "@/modules/refit/lib/auth";
import { useActiveVessel } from "@/modules/refit/lib/activeVessel";
import { db, type CrewRequest, type Comment } from "@/modules/refit/lib/db";
import {
  ListShell,
  ListHeader,
  EmptyState,
  LoadingRow,
  StatusBadge,
  PriorityBadge,
  PrimaryBtn,
  GhostBtn,
  Drawer,
  Field,
  inputCls,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  ErrorBlock,
  MetaGrid,
  Meta,
  Section,
} from "@/modules/refit/components/ui-kit";
import { can } from "@/modules/refit/lib/permissions";

const STATUSES = [
  "new",
  "triaged",
  "assigned",
  "in_progress",
  "blocked",
  "awaiting_approval",
  "completed",
  "rejected",
  "closed",
] as const;
const KINDS = [
  "defect",
  "operational",
  "safety",
  "interior",
  "engineering",
  "deck",
  "it",
  "procurement",
  "accommodation",
  "access",
  "readiness",
  "other",
] as const;

export default function CrewRequestsPage() {
  const { roles, user } = useAuth();
  const { activeVesselId } = useActiveVessel();
  const [items, setItems] = useState<CrewRequest[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "mine">("open");
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!activeVesselId) return;
    const { data, error } = await db
      .from("rf_crew_requests" as any)
      .select("*")
      .eq("vessel_id", activeVesselId)
      .is("archived_at", null)
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    setItems((data as unknown as CrewRequest[]) ?? []);
  };
  useEffect(() => {
    load();
  }, [activeVesselId]);

  const filtered = useMemo(() => {
    if (!items) return null;
    return items.filter((r) => {
      if (filter === "open")
        return !["completed", "closed", "cancelled", "rejected"].includes(r.status);
      if (filter === "mine") return r.assigned_to === user?.id || r.requested_by === user?.id;
      return true;
    });
  }, [items, filter, user]);

  const canCreate = can(roles, "crew_request.create");

  return (
    <AppShell>
      <div className="p-4 sm:p-6 md:p-8 w-full max-w-[1600px] mx-auto">
        <PageHeader
          title="Crew Requests"
          subtitle="Yard-processed requests tracked through ITR with invoice attachments for financial history"
          action={
            canCreate ? (
              <button
                onClick={() => setCreateOpen(true)}
                aria-label="New crew request"
                title="New crew request"
                className="inline-flex items-center justify-center h-9 w-9 rounded-sm bg-navy text-white hover:opacity-90 transition"
              >
                <Plus size={18} />
              </button>
            ) : undefined
          }
        />

        <div className="mb-4 flex gap-2">
          {(["open", "mine", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs rounded-sm border ${filter === f ? "bg-navy text-white border-navy" : "bg-white border-black/10 hover:bg-secondary"}`}
            >
              {f === "open" ? "Open" : f === "mine" ? "Mine" : "All"}
            </button>
          ))}
        </div>

        {error && <ErrorBlock message={error} />}

        <ListShell>
          <ListHeader>
            <div
              style={{
                gridTemplateColumns: "120px 1fr 110px 110px 100px 110px",
                display: "grid",
                width: "100%",
              }}
            >
              <div>Reference</div>
              <div>Title</div>
              <div>Kind</div>
              <div>Status</div>
              <div>Priority</div>
              <div>Due</div>
            </div>
          </ListHeader>
          {filtered === null ? (
            <>
              <LoadingRow />
              <LoadingRow />
            </>
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No crew requests"
              hint={
                items?.length === 0
                  ? "Crew can raise defects, requests or safety items here."
                  : "No items match the current filter."
              }
            />
          ) : (
            filtered.map((r) => (
              <button
                key={r.id}
                onClick={() => setOpenId(r.id)}
                className="w-full text-left hover:bg-paper border-b border-black/5"
              >
                <div
                  className="px-4 py-3 grid items-center"
                  style={{ gridTemplateColumns: "120px 1fr 110px 110px 100px 110px" }}
                >
                  <div className="font-mono text-xs">{r.reference}</div>
                  <div className="text-sm truncate pr-3">{r.title}</div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    {r.kind.replace(/_/g, " ")}
                  </div>
                  <div>
                    <StatusBadge value={r.status} />
                  </div>
                  <div>
                    <PriorityBadge value={r.priority} />
                  </div>
                  <div className="text-xs text-muted-foreground">{fmtDate(r.due_date)}</div>
                </div>
              </button>
            ))
          )}
        </ListShell>
      </div>

      <CreateCrewRequestDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          load();
        }}
      />
      <CrewRequestDetailDrawer id={openId} onClose={() => setOpenId(null)} onUpdated={load} />
    </AppShell>
  );
}

function CreateCrewRequestDrawer({
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
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("operational");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [dueDate, setDueDate] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [invoiceCurrency, setInvoiceCurrency] = useState("EUR");
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reset = () => {
    setTitle("");
    setDescription("");
    setDueDate("");
    setInvoiceNumber("");
    setInvoiceAmount("");
    setInvoiceCurrency("EUR");
    setInvoiceFile(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeVesselId || !title.trim()) {
      setErr("Title required.");
      return;
    }
    setBusy(true);
    setErr(null);
    const { data: refData } = await db.rpc("next_reference", {
      _vessel_id: activeVesselId,
      _prefix: "CR",
      _table: "crew_requests",
    });
    const reference = (refData as string) ?? `CR-${Date.now().toString().slice(-4)}`;

    let invoiceFilePath: string | null = null;
    let invoiceUploadedAt: string | null = null;
    if (invoiceFile) {
      const ext = invoiceFile.name.split(".").pop() || "bin";
      const path = `${activeVesselId}/${reference}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("crew-request-invoices")
        .upload(path, invoiceFile, { contentType: invoiceFile.type || undefined });
      if (upErr) {
        setBusy(false);
        setErr(`Invoice upload failed: ${upErr.message}`);
        return;
      }
      invoiceFilePath = path;
      invoiceUploadedAt = new Date().toISOString();
    }

    const { error } = await db.from("rf_crew_requests" as any).insert({
      vessel_id: activeVesselId,
      reference,
      title,
      description: description || null,
      kind,
      priority,
      due_date: dueDate || null,
      status: "new",
      invoice_number: invoiceNumber || null,
      invoice_amount: invoiceAmount ? Number(invoiceAmount) : null,
      invoice_currency: invoiceFile || invoiceAmount ? invoiceCurrency : null,
      invoice_file_path: invoiceFilePath,
      invoice_uploaded_at: invoiceUploadedAt,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    reset();
    onCreated();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="New crew request"
      footer={
        <div className="flex justify-end gap-2">
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <PrimaryBtn
            onClick={() =>
              (document.getElementById("cr-create-form") as HTMLFormElement)?.requestSubmit()
            }
            disabled={busy}
          >
            {busy ? "Saving…" : "Submit"}
          </PrimaryBtn>
        </div>
      }
    >
      <form id="cr-create-form" onSubmit={submit} className="space-y-4">
        {err && <ErrorBlock message={err} />}
        <Field label="Title" required>
          <input
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Description">
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={inputCls}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kind" required>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as (typeof KINDS)[number])}
              className={inputCls}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {k.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </Field>
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
        </div>

        <div className="mt-2 pt-4 border-t border-black/10">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
            <FileText size={12} /> Invoice for ITR / yard processing
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Invoice number">
              <input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className={inputCls}
                placeholder="e.g. INV-2025-0042"
              />
            </Field>
            <Field label="Amount">
              <input
                type="number"
                step="0.01"
                value={invoiceAmount}
                onChange={(e) => setInvoiceAmount(e.target.value)}
                className={inputCls}
                placeholder="0.00"
              />
            </Field>
            <Field label="Currency">
              <select
                value={invoiceCurrency}
                onChange={(e) => setInvoiceCurrency(e.target.value)}
                className={inputCls}
              >
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
              </select>
            </Field>
            <Field label="Invoice file">
              <label className="inline-flex items-center gap-2 px-3 py-2 text-xs rounded-sm border border-black/10 bg-white hover:bg-secondary cursor-pointer">
                <Paperclip size={14} />
                <span className="truncate">
                  {invoiceFile ? invoiceFile.name : "Attach PDF / image"}
                </span>
                <input
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={(e) => setInvoiceFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </Field>
          </div>
        </div>
      </form>
    </Drawer>
  );
}

function InvoiceLink({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.storage
        .from("crew-request-invoices")
        .createSignedUrl(path, 3600);
      setUrl(data?.signedUrl ?? null);
    })();
  }, [path]);
  if (!url) return <div className="text-xs text-muted-foreground mt-3">Loading invoice…</div>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="mt-3 inline-flex items-center gap-2 px-3 py-2 text-xs rounded-sm border border-black/10 bg-white hover:bg-secondary"
    >
      <Paperclip size={14} /> View attached invoice
    </a>
  );
}

function CrewRequestDetailDrawer({
  id,
  onClose,
  onUpdated,
}: {
  id: string | null;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { roles } = useAuth();
  const [r, setR] = useState<CrewRequest | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [rr, cr] = await Promise.all([
        db.from("rf_crew_requests" as any).select("*").eq("id", id).maybeSingle(),
        db
          .from("rf_request_comments" as any)
          .select("*")
          .eq("parent_type", "crew_request")
          .eq("parent_id", id)
          .order("created_at"),
      ]);
      setR((rr.data as CrewRequest) ?? null);
      setComments((cr.data as unknown as Comment[]) ?? []);
    })();
  }, [id]);

  const transition = async (status: CrewRequest["status"]) => {
    if (!r) return;
    setBusy(true);
    const { error } = await db.from("rf_crew_requests" as any).update({ status }).eq("id", r.id);
    if (error) setErr(error.message);
    const { data } = await db.from("rf_crew_requests" as any).select("*").eq("id", r.id).maybeSingle();
    setR((data as CrewRequest) ?? null);
    setBusy(false);
    onUpdated();
  };

  const post = async () => {
    if (!r || !body.trim()) return;
    setBusy(true);
    const { error } = await db.from("rf_request_comments" as any).insert({
      parent_type: "crew_request",
      parent_id: r.id,
      vessel_id: r.vessel_id,
      body,
    });
    if (error) setErr(error.message);
    setBody("");
    const { data } = await db
      .from("rf_request_comments" as any)
      .select("*")
      .eq("parent_type", "crew_request")
      .eq("parent_id", r.id)
      .order("created_at");
    setComments((data as unknown as Comment[]) ?? []);
    setBusy(false);
  };

  const canTriage = can(roles, "crew_request.triage");

  return (
    <Drawer
      open={!!id}
      onClose={onClose}
      title={r ? `${r.reference} · ${r.title}` : "Loading…"}
      wide
    >
      {!r ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="space-y-6">
          {err && <ErrorBlock message={err} />}
          <div className="flex flex-wrap gap-2 items-center">
            <StatusBadge value={r.status} />
            <PriorityBadge value={r.priority} />
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              {r.kind.replace(/_/g, " ")}
            </span>
          </div>
          <Section title="Details">
            <MetaGrid>
              <Meta label="Created" value={fmtDateTime(r.created_at)} />
              <Meta label="Due" value={fmtDate(r.due_date)} />
              <Meta label="Cost impact" value={fmtMoney(r.cost_impact)} />
              <Meta label="Schedule impact" value={`${r.schedule_impact_days ?? 0} day(s)`} />
              <Meta label="Safety" value={r.safety_impact ?? "—"} />
            </MetaGrid>
            {r.description && (
              <div className="mt-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                  Description
                </div>
                <div className="text-sm whitespace-pre-wrap">{r.description}</div>
              </div>
            )}
          </Section>
          {(r.invoice_number || r.invoice_amount || r.invoice_file_path) && (
            <Section title="Invoice (ITR / yard processing)">
              <MetaGrid>
                <Meta label="Invoice #" value={r.invoice_number ?? "—"} />
                <Meta
                  label="Amount"
                  value={
                    r.invoice_amount != null
                      ? fmtMoney(r.invoice_amount, r.invoice_currency ?? "EUR")
                      : "—"
                  }
                />
                <Meta label="Uploaded" value={fmtDateTime(r.invoice_uploaded_at)} />
              </MetaGrid>
              {r.invoice_file_path && <InvoiceLink path={r.invoice_file_path} />}
            </Section>
          )}
          {canTriage && (
            <Section title="Workflow">
              <div className="flex flex-wrap gap-2">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => transition(s)}
                    disabled={busy || r.status === s}
                    className={`px-2.5 py-1.5 text-xs rounded-sm border ${r.status === s ? "bg-navy text-white border-navy" : "bg-white border-black/10 hover:bg-secondary"}`}
                  >
                    {s.replace(/_/g, " ")}
                  </button>
                ))}
              </div>
            </Section>
          )}
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
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className={inputCls}
                placeholder="Add a comment…"
              />
              <PrimaryBtn onClick={post} disabled={busy || !body.trim()}>
                Post
              </PrimaryBtn>
            </div>
          </Section>
        </div>
      )}
    </Drawer>
  );
}
