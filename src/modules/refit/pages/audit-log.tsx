import { useEffect, useState } from "react";
import { supabase as supabaseClient } from "@/integrations/supabase/client";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase: any = supabaseClient;
import { AppShell, PageHeader } from "@/modules/refit/components/AppShell";
import { RequireAuth } from "@/modules/refit/components/RequireAuth";
import { useAuth } from "@/modules/refit/lib/auth";

type AuditChange = { old: string | null; new: string | null };
type AuditDetail = {
  vessel_name?: string;
  changes?: {
    name?: AuditChange;
    hull_number?: AuditChange;
  };
};

type AuditRow = {
  id: string;
  created_at: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  detail: AuditDetail | null;
};

const READER_ROLES = ["project_manager", "captain", "shore_management"] as const;

export default function AuditLogPage() {
  const { role, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [actors, setActors] = useState<
    Record<string, { display_name: string | null; email: string }>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "vessel">("vessel");

  const canRead = !!role && (READER_ROLES as readonly string[]).includes(role);

  useEffect(() => {
    if (authLoading || !canRead) return;
    (async () => {
      setLoading(true);
      setError(null);
      let q = supabase
        .from("rf_audit_log" as any)
        .select("id, created_at, user_id, action, entity_type, entity_id, detail")
        .order("created_at", { ascending: false })
        .limit(200);
      if (filter === "vessel") q = q.eq("entity_type", "vessel");
      const { data, error } = await q;
      if (error) {
        setError(error.message);
        setLoading(false);
        return;
      }
      const list = (data ?? []) as unknown as AuditRow[];
      setRows(list);

      const actorIds = Array.from(
        new Set(list.map((r) => r.user_id).filter((v): v is string => !!v)),
      );
      if (actorIds.length > 0) {
        const { data: profs } = await supabase
          .from("rf_profiles" as any)
          .select("id, display_name, email")
          .in("id", actorIds);
        const map: Record<string, { display_name: string | null; email: string }> = {};
        (profs ?? []).forEach((p) => {
          map[p.id] = { display_name: p.display_name, email: p.email };
        });
        setActors(map);
      } else {
        setActors({});
      }
      setLoading(false);
    })();
  }, [authLoading, canRead, filter]);

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  };

  const actorLabel = (id: string | null) => {
    if (!id) return "System";
    const a = actors[id];
    if (!a) return id.slice(0, 8) + "…";
    return a.display_name || a.email;
  };

  const actionPill = (action: string) => {
    const tone = action.startsWith("vessel.renamed")
      ? "bg-warning/10 text-warning"
      : action.startsWith("vessel.")
        ? "bg-ocean/10 text-ocean"
        : "bg-secondary text-ink";
    return (
      <span
        className={`inline-block px-2 py-0.5 rounded-sm text-[11px] font-mono tracking-tight ${tone}`}
      >
        {action}
      </span>
    );
  };

  const renderChanges = (detail: AuditDetail | null) => {
    const changes = detail?.changes;
    if (!changes) return <span className="text-muted-foreground">—</span>;
    const items: { field: string; old: string | null; next: string | null }[] = [];
    if (changes.name) items.push({ field: "Name", old: changes.name.old, next: changes.name.new });
    if (changes.hull_number)
      items.push({
        field: "Hull no.",
        old: changes.hull_number.old,
        next: changes.hull_number.new,
      });
    if (items.length === 0) return <span className="text-muted-foreground">—</span>;
    return (
      <div className="space-y-1">
        {items.map((it) => (
          <div key={it.field} className="text-xs">
            <span className="text-muted-foreground">{it.field}:</span>{" "}
            <span className="line-through text-muted-foreground">{it.old ?? "∅"}</span>{" "}
            <span aria-hidden>→</span>{" "}
            <span className="font-medium text-ink">{it.next ?? "∅"}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <AppShell>
      <div className="p-4 sm:p-6 md:p-8 w-full max-w-[1600px] mx-auto">
        <PageHeader
          title="Audit Log"
          subtitle="Vessel renames, hull number changes, and other tracked migrations."
          action={
            <div className="inline-flex border border-black/10 rounded-sm overflow-hidden text-xs">
              <button
                onClick={() => setFilter("vessel")}
                className={`px-3 py-1.5 ${filter === "vessel" ? "bg-navy text-white" : "bg-white hover:bg-secondary"}`}
              >
                Vessel changes
              </button>
              <button
                onClick={() => setFilter("all")}
                className={`px-3 py-1.5 border-l border-black/10 ${filter === "all" ? "bg-navy text-white" : "bg-white hover:bg-secondary"}`}
              >
                All entries
              </button>
            </div>
          }
        />

        {!canRead && !authLoading && (
          <div className="rounded-sm border border-warning/30 bg-warning/10 text-warning text-sm p-4">
            Your role doesn't have access to the audit log. Project Managers, Captains, and Shore
            Management can view this page.
          </div>
        )}

        {canRead && (
          <div className="bg-white border border-black/10 rounded-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="bg-secondary/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">When</th>
                    <th className="px-4 py-2.5 font-medium">Who</th>
                    <th className="px-4 py-2.5 font-medium">Action</th>
                    <th className="px-4 py-2.5 font-medium">Entity</th>
                    <th className="px-4 py-2.5 font-medium">Changes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {loading && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        Loading…
                      </td>
                    </tr>
                  )}
                  {error && !loading && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-danger">
                        {error}
                      </td>
                    </tr>
                  )}
                  {!loading && !error && rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        No audit entries yet. Vessel renames will appear here automatically.
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    rows.map((r) => (
                      <tr key={r.id} className="hover:bg-secondary/30">
                        <td className="px-4 py-3 align-top whitespace-nowrap text-muted-foreground text-xs">
                          {fmtTime(r.created_at)}
                        </td>
                        <td className="px-4 py-3 align-top">{actorLabel(r.user_id)}</td>
                        <td className="px-4 py-3 align-top">{actionPill(r.action)}</td>
                        <td className="px-4 py-3 align-top">
                          <div className="text-xs">
                            <div className="font-medium">
                              {r.detail?.vessel_name ?? r.entity_type ?? "—"}
                            </div>
                            {r.entity_id && (
                              <div className="font-mono text-[10px] text-muted-foreground">
                                {r.entity_id.slice(0, 8)}…
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">{renderChanges(r.detail)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <p className="mt-4 text-xs text-muted-foreground">
          Showing the most recent 200 entries. Vessel rename and hull-number changes are recorded
          automatically by a database trigger.
        </p>
      </div>
    </AppShell>
  );
}
