import { ReactNode, useEffect, useState, useMemo } from "react";
import { AppShell, PageHeader } from "@/modules/refit/components/AppShell";
import { RequireAuth } from "@/modules/refit/components/RequireAuth";
import { useAuth } from "@/modules/refit/lib/auth";
import { useActiveVessel } from "@/modules/refit/lib/activeVessel";
import { db } from "@/modules/refit/lib/db";
import {
  ListShell,
  ListHeader,
  EmptyState,
  LoadingRow,
  PrimaryBtn,
  GhostBtn,
  Drawer,
  Field,
  inputCls,
  ErrorBlock,
  StatusBadge,
  PriorityBadge,
  fmtDate,
  fmtDateTime,
  fmtMoney,
} from "@/modules/refit/components/ui-kit";
import { can, type PermissionKey } from "@/modules/refit/lib/permissions";

export type ColumnDef<T> = {
  key: string;
  label: string;
  width: string;
  render: (row: T) => ReactNode;
};

export type FieldDef = {
  name: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "select" | "datetime-local";
  required?: boolean;
  options?: ReadonlyArray<string | { value: string; label: string }>;
  default?: string | number;
  hint?: string;
};

export type SimpleModuleConfig<T> = {
  table: string;
  title: string;
  subtitle: string;
  vesselScoped?: boolean;
  referencePrefix?: string;
  createPermission?: PermissionKey;
  defaultStatus?: string;
  initialOrder?: { column: string; ascending?: boolean };
  columns: ColumnDef<T>[];
  fields: FieldDef[];
  // Static export of util renderers for column build callbacks
  utils?: undefined;
  rowFilter?: (row: T, ctx: { userId?: string }) => boolean;
};

export const cellUtils = {
  Status: StatusBadge,
  Priority: PriorityBadge,
  fmtDate,
  fmtDateTime,
  fmtMoney,
};

/**
 * Renders a list + create-drawer page over a single Supabase table.
 * Used by all "thin pass" modules so they share filter/empty/error UX.
 */
export function SimpleModulePage<T extends { id: string }>({
  config,
}: {
  config: SimpleModuleConfig<T>;
}) {
  return (
    <RequireAuth>
      <SimpleModuleInner<T> config={config} />
    </RequireAuth>
  );
}

function SimpleModuleInner<T extends { id: string }>({
  config,
}: {
  config: SimpleModuleConfig<T>;
}) {
  const { roles, user } = useAuth();
  const { activeVesselId } = useActiveVessel();
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = async () => {
    let q = db.from(config.table).select("*");
    if (config.vesselScoped !== false) {
      if (!activeVesselId) return;
      q = q.eq("vessel_id", activeVesselId);
    }
    if (config.initialOrder)
      q = q.order(config.initialOrder.column, {
        ascending: config.initialOrder.ascending ?? false,
      });
    const { data, error } = await q;
    if (error) setError(error.message);
    setItems((data as T[]) ?? []);
  };

  useEffect(() => {
    load();
  }, [activeVesselId, config.table]);

  const filtered = useMemo(() => {
    if (!items) return null;
    if (!config.rowFilter) return items;
    return items.filter((row) => config.rowFilter!(row, { userId: user?.id }));
  }, [items, user, config]);

  const canCreate = config.createPermission ? can(roles, config.createPermission) : true;

  const totalCols = config.columns.reduce(
    (s, c) => s + parseInt(c.width.replace("px", "")) || 0,
    0,
  );
  const gridTemplate = config.columns.map((c) => c.width).join(" ");

  return (
    <AppShell>
      <div className="p-4 sm:p-6 md:p-8 w-full max-w-[1600px] mx-auto">
        <PageHeader
          title={config.title}
          subtitle={config.subtitle}
          action={
            canCreate ? <PrimaryBtn onClick={() => setCreateOpen(true)}>New</PrimaryBtn> : undefined
          }
        />
        {error && <ErrorBlock message={error} />}
        <ListShell>
          <ListHeader>
            <div
              style={{
                gridTemplateColumns: gridTemplate,
                display: "grid",
                width: "100%",
                minWidth: totalCols,
              }}
            >
              {config.columns.map((c) => (
                <div key={c.key}>{c.label}</div>
              ))}
            </div>
          </ListHeader>
          {filtered === null ? (
            <>
              <LoadingRow cols={config.columns.length} />
              <LoadingRow cols={config.columns.length} />
            </>
          ) : filtered.length === 0 ? (
            <EmptyState title={`No ${config.title.toLowerCase()} yet`} />
          ) : (
            filtered.map((row) => (
              <div
                key={row.id}
                className="border-b border-black/5 hover:bg-paper px-4 py-3 grid items-center"
                style={{ gridTemplateColumns: gridTemplate }}
              >
                {config.columns.map((c) => (
                  <div key={c.key} className="text-sm truncate pr-2">
                    {c.render(row)}
                  </div>
                ))}
              </div>
            ))
          )}
        </ListShell>
      </div>
      <SimpleCreateDrawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          load();
        }}
        config={config}
      />
    </AppShell>
  );
}

function SimpleCreateDrawer<T extends { id: string }>({
  open,
  onClose,
  onCreated,
  config,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  config: SimpleModuleConfig<T>;
}) {
  const { activeVesselId } = useActiveVessel();
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of config.fields) v[f.name] = (f.default as string | undefined) ?? "";
    return v;
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    for (const f of config.fields) {
      if (f.required && !values[f.name]) {
        setErr(`${f.label} is required.`);
        return;
      }
    }
    setBusy(true);
    setErr(null);
    const payload: Record<string, unknown> = {};
    for (const f of config.fields) {
      const v = values[f.name];
      if (v === "") continue;
      if (f.type === "number") payload[f.name] = Number(v);
      else payload[f.name] = v;
    }
    if (config.vesselScoped !== false) payload.vessel_id = activeVesselId;
    if (config.referencePrefix && activeVesselId && !payload.reference) {
      const { data: refData } = await db.rpc("next_reference", {
        _vessel_id: activeVesselId,
        _prefix: config.referencePrefix,
        _table: config.table,
      });
      payload.reference =
        (refData as string) ?? `${config.referencePrefix}-${Date.now().toString().slice(-4)}`;
    }
    if (config.defaultStatus && !payload.status) payload.status = config.defaultStatus;

    const { error } = await db.from(config.table).insert(payload);
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    const reset: Record<string, string> = {};
    for (const f of config.fields) reset[f.name] = (f.default as string | undefined) ?? "";
    setValues(reset);
    onCreated();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`New ${config.title.replace(/s$/, "").toLowerCase()}`}
      footer={
        <div className="flex justify-end gap-2">
          <GhostBtn onClick={onClose}>Cancel</GhostBtn>
          <PrimaryBtn
            onClick={() =>
              (document.getElementById("simple-create-form") as HTMLFormElement)?.requestSubmit()
            }
            disabled={busy}
          >
            {busy ? "Saving…" : "Create"}
          </PrimaryBtn>
        </div>
      }
    >
      <form id="simple-create-form" onSubmit={submit} className="space-y-4">
        {err && <ErrorBlock message={err} />}
        {config.fields.map((f) => (
          <Field key={f.name} label={f.label} required={f.required} hint={f.hint}>
            {f.type === "textarea" ? (
              <textarea
                rows={4}
                value={values[f.name]}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                className={inputCls}
              />
            ) : f.type === "select" ? (
              <select
                value={values[f.name]}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                className={inputCls}
              >
                <option value="">—</option>
                {(f.options ?? []).map((o) => {
                  const value = typeof o === "string" ? o : o.value;
                  const label = typeof o === "string" ? o.replace(/_/g, " ") : o.label;
                  return (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  );
                })}
              </select>
            ) : (
              <input
                type={f.type === "datetime-local" ? "datetime-local" : f.type}
                step={f.type === "number" ? "0.01" : undefined}
                value={values[f.name]}
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
