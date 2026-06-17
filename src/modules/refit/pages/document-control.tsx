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

type Doc = {
  id: string;
  name: string;
  folder: string | null;
  doc_type: string | null;
  expiry_date: string | null;
  review_due_at: string | null;
  approval_status: string | null;
};

const DOC_TYPES = [
  "contract",
  "specification",
  "drawing",
  "certificate",
  "class",
  "flag",
  "manual",
  "warranty",
  "quote",
  "invoice",
  "po",
  "risk_assessment",
  "method_statement",
  "minutes",
  "report",
  "other",
];

export default function DocumentControl() {
  const { roles } = useAuth();
  const { activeVesselId } = useActiveVessel();
  const [items, setItems] = useState<Doc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = async () => {
    if (!activeVesselId) return;
    const { data, error } = await db
      .from("rf_documents" as any)
      .select("*")
      .eq("vessel_id", activeVesselId)
      .is("archived_at", null)
      .order("name");
    if (error) setError(error.message);
    setItems((data as unknown as Doc[]) ?? []);
  };
  useEffect(() => {
    load();
  }, [activeVesselId]);

  const canManage = can(roles, "document.manage");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <AppShell>
      <div className="p-4 sm:p-6 md:p-8 w-full max-w-[1600px] mx-auto">
        <PageHeader
          title="Document Control"
          subtitle="Contracts, certificates, class submissions, manuals, transmittals — with expiry tracking"
          action={
            canManage ? (
              <PrimaryBtn onClick={() => setCreateOpen(true)}>Add document</PrimaryBtn>
            ) : undefined
          }
        />
        {error && <ErrorBlock message={error} />}

        <ListShell>
          <ListHeader>
            <div
              style={{
                gridTemplateColumns: "1fr 150px 130px 130px 130px 130px",
                display: "grid",
                width: "100%",
              }}
            >
              <div>Name</div>
              <div>Folder</div>
              <div>Type</div>
              <div>Approval</div>
              <div>Expires</div>
              <div>Review due</div>
            </div>
          </ListHeader>
          {items.length === 0 ? (
            <EmptyState title="No documents yet" />
          ) : (
            items.map((d) => {
              const expSoon = d.expiry_date && d.expiry_date < today;
              return (
                <div
                  key={d.id}
                  className="px-4 py-3 grid items-center border-b border-black/5"
                  style={{ gridTemplateColumns: "1fr 150px 130px 130px 130px 130px" }}
                >
                  <span className="text-sm">{d.name}</span>
                  <span className="text-xs text-muted-foreground">{d.folder ?? "—"}</span>
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">
                    {d.doc_type ?? "—"}
                  </span>
                  <StatusBadge value={d.approval_status ?? "draft"} />
                  <span
                    className={`text-xs tabular-nums ${expSoon ? "text-danger font-medium" : "text-muted-foreground"}`}
                  >
                    {fmtDate(d.expiry_date)}
                  </span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {fmtDate(d.review_due_at)}
                  </span>
                </div>
              );
            })
          )}
        </ListShell>
      </div>

      <CreateDocDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          load();
        }}
        vesselId={activeVesselId}
      />
    </AppShell>
  );
}

function CreateDocDrawer(props: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  vesselId: string | null;
}) {
  const [name, setName] = useState("");
  const [folder, setFolder] = useState("");
  const [docType, setDocType] = useState("");
  const [expiry, setExpiry] = useState("");
  const [reviewDue, setReviewDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!props.vesselId || !name.trim()) {
      setErr("Name required");
      return;
    }
    setBusy(true);
    const { error } = await db.from("rf_documents" as any).insert({
      vessel_id: props.vesselId,
      name,
      folder: folder || null,
      doc_type: docType || null,
      expiry_date: expiry || null,
      review_due_at: reviewDue || null,
    });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    setName("");
    setFolder("");
    setDocType("");
    setExpiry("");
    setReviewDue("");
    props.onCreated();
  };

  return (
    <Drawer
      open={props.open}
      onClose={props.onClose}
      title="Add document"
      footer={
        <div className="flex justify-end gap-2">
          <GhostBtn onClick={props.onClose}>Cancel</GhostBtn>
          <PrimaryBtn
            onClick={() =>
              (document.getElementById("doc-form") as HTMLFormElement)?.requestSubmit()
            }
            disabled={busy}
          >
            {busy ? "Saving…" : "Save"}
          </PrimaryBtn>
        </div>
      }
    >
      <form id="doc-form" onSubmit={submit} className="space-y-3">
        {err && <ErrorBlock message={err} />}
        <Field label="Name" required>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Folder">
          <input
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            className={inputCls}
            placeholder="e.g. /class/initial"
          />
        </Field>
        <Field label="Type">
          <select value={docType} onChange={(e) => setDocType(e.target.value)} className={inputCls}>
            <option value="">—</option>
            {DOC_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Expiry date">
          <input
            type="date"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Review due">
          <input
            type="date"
            value={reviewDue}
            onChange={(e) => setReviewDue(e.target.value)}
            className={inputCls}
          />
        </Field>
      </form>
    </Drawer>
  );
}
