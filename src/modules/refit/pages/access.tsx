import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, ROLE_LABEL, type AppRole } from "@/modules/refit/lib/auth";
import { AppShell, PageHeader } from "@/modules/refit/components/AppShell";
import { RequireAuth } from "@/modules/refit/components/RequireAuth";
import { ConsistencyCheck } from "@/modules/refit/components/ConsistencyCheck";

// Module access matrix — derived from the RLS policies in the database.
// `read` = expected SELECT permission. `write` = expected INSERT/UPDATE permission.
type ModuleKey =
  | "works"
  | "budget"
  | "snags"
  | "schedule"
  | "drawings"
  | "files"
  | "document-control"
  | "communications"
  | "crew"
  | "compliance"
  | "reporting"
  | "suppliers";

interface ModuleSpec {
  key: ModuleKey;
  label: string;
  route: string;
  // Probe table for live RLS validation
  probeTable: string;
  // Roles allowed by RLS to read this module
  readRoles: AppRole[] | "all";
  // Roles allowed by RLS to write this module
  writeRoles: AppRole[];
  // Per-role deep link to the most relevant first screen / section anchor.
  // Falls back to `route` when role isn't listed.
  deepLinks?: Partial<Record<AppRole, string>>;
}

// Returns the first screen the given role should land on for this module.
function firstAccessibleRoute(spec: ModuleSpec, role: AppRole | null): string {
  if (role && spec.deepLinks?.[role]) return spec.deepLinks[role]!;
  return spec.route;
}

// Human-readable reason a module is restricted for the current role.
function restrictionReason(spec: ModuleSpec, role: AppRole | null): string {
  if (!role) {
    return "No role assigned to your account. Contact your project manager to request access.";
  }
  const allowed =
    spec.readRoles === "all"
      ? "all signed-in roles"
      : spec.readRoles.map((r) => ROLE_LABEL[r]).join(", ");
  return `Restricted by row-level security. Your role (${ROLE_LABEL[role]}) is not permitted to view ${spec.label}. Allowed roles: ${allowed}.`;
}

const MODULES: ModuleSpec[] = [
  {
    key: "works",
    label: "Works Orders",
    route: "/works",
    probeTable: "works_orders",
    readRoles: "all",
    writeRoles: ["project_manager"],
    deepLinks: {
      supplier: "/suppliers",
      project_manager: "/works",
      hod: "/works",
      captain: "/works",
    },
  },
  {
    key: "budget",
    label: "Budget & Financials",
    route: "/budget",
    probeTable: "budget_items",
    readRoles: ["owner", "captain", "project_manager", "shore_management", "hod"],
    writeRoles: ["project_manager"],
    deepLinks: {
      owner: "/budget#summary",
      project_manager: "/budget#items",
      shore_management: "/budget#summary",
      captain: "/budget#items",
      hod: "/budget#items",
    },
  },
  {
    key: "snags",
    label: "Snags & Warranty",
    route: "/snags",
    probeTable: "snags",
    readRoles: "all",
    writeRoles: ["project_manager", "captain", "hod"],
    deepLinks: {
      supplier: "/snags#assigned",
      project_manager: "/snags#open",
      captain: "/snags#open",
      hod: "/snags#open",
    },
  },
  {
    key: "schedule",
    label: "Schedule & Timeline",
    route: "/schedule",
    probeTable: "schedule_items",
    readRoles: ["owner", "captain", "project_manager", "shore_management", "hod"],
    writeRoles: ["project_manager"],
    deepLinks: {
      owner: "/schedule#milestones",
      project_manager: "/schedule#gantt",
      shore_management: "/schedule#milestones",
      captain: "/schedule#gantt",
      hod: "/schedule#gantt",
    },
  },
  {
    key: "drawings",
    label: "Drawings",
    route: "/drawings",
    probeTable: "drawings",
    readRoles: ["owner", "captain", "project_manager", "shore_management", "hod"],
    writeRoles: ["project_manager"],
  },
  {
    key: "files",
    label: "Files & Documents",
    route: "/files",
    probeTable: "documents",
    readRoles: ["owner", "captain", "project_manager", "shore_management", "hod"],
    writeRoles: ["project_manager", "captain"],
  },
  {
    key: "document-control",
    label: "Document Control",
    route: "/document-control",
    probeTable: "transmittals",
    readRoles: ["owner", "captain", "project_manager", "shore_management", "hod"],
    writeRoles: ["project_manager"],
    deepLinks: {
      project_manager: "/document-control#transmittals",
      shore_management: "/document-control#transmittals",
    },
  },
  {
    key: "communications",
    label: "Communications",
    route: "/communications",
    probeTable: "messages",
    readRoles: ["captain", "project_manager", "shore_management", "hod"],
    writeRoles: ["captain", "project_manager", "shore_management", "hod", "supplier"],
    deepLinks: {
      supplier: "/communications#assigned",
    },
  },
  {
    key: "crew",
    label: "Crew & Certification",
    route: "/crew",
    probeTable: "crew",
    readRoles: ["owner", "captain", "project_manager", "shore_management", "hod"],
    writeRoles: ["captain", "project_manager"],
    deepLinks: {
      captain: "/crew#roster",
      project_manager: "/crew#certs",
    },
  },
  {
    key: "compliance",
    label: "Compliance & Audit",
    route: "/compliance",
    probeTable: "audit_log",
    readRoles: ["captain", "project_manager", "shore_management"],
    writeRoles: [],
  },
  {
    key: "reporting",
    label: "Reporting",
    route: "/reporting",
    probeTable: "milestones",
    readRoles: ["owner", "captain", "project_manager", "shore_management", "hod"],
    writeRoles: ["project_manager"],
    deepLinks: {
      owner: "/reporting#executive",
      shore_management: "/reporting#executive",
      project_manager: "/reporting#progress",
    },
  },
  {
    key: "suppliers",
    label: "Supplier Portal",
    route: "/suppliers",
    probeTable: "works_orders",
    readRoles: "all",
    writeRoles: ["project_manager"],
    deepLinks: {
      supplier: "/suppliers#my-orders",
    },
  },
];

type ProbeStatus = "pending" | "allowed" | "denied" | "error";

interface ProbeResult {
  status: ProbeStatus;
  rowsVisible: number;
  errorCode?: string;
  errorMessage?: string;
}

function expectedRead(spec: ModuleSpec, role: AppRole | null): boolean {
  if (!role) return false;
  if (spec.readRoles === "all") return true;
  return spec.readRoles.includes(role);
}

function expectedWrite(spec: ModuleSpec, role: AppRole | null): boolean {
  if (!role) return false;
  return spec.writeRoles.includes(role);
}

export default function AccessPage() {
  const { user, role, loading } = useAuth();
  const [vesselName, setVesselName] = useState<string | null>(null);
  const [vesselId, setVesselId] = useState<string | null>(null);
  const [probes, setProbes] = useState<Record<ModuleKey, ProbeResult>>(
    () =>
      Object.fromEntries(
        MODULES.map((m) => [m.key, { status: "pending", rowsVisible: 0 }]),
      ) as Record<ModuleKey, ProbeResult>,
  );
  const [running, setRunning] = useState(false);

  // Auth + email-confirmation guard handled by <RequireAuth> wrapper.

  useEffect(() => {
    if (!user) return;
    supabase
      .from("rf_profiles" as any)
      .select("vessel_id, vessels(name, hull_number)")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        const row = data as {
          vessel_id?: string | null;
          vessels?: { name?: string; hull_number?: string };
        } | null;
        setVesselId(row?.vessel_id ?? null);
        const v = row?.vessels;
        if (v?.name) setVesselName(`${v.name}${v.hull_number ? ` · ${v.hull_number}` : ""}`);
      });
  }, [user]);

  const runProbes = async () => {
    if (!user) return;
    setRunning(true);
    const results: Record<ModuleKey, ProbeResult> = { ...probes };
    for (const spec of MODULES) {
      results[spec.key] = { status: "pending", rowsVisible: 0 };
    }
    setProbes({ ...results });

    await Promise.all(
      MODULES.map(async (spec) => {
        const { data, error, count } = await supabase
          .from(spec.probeTable as never)
          .select("id", { count: "exact", head: false })
          .limit(1);
        if (error) {
          results[spec.key] = {
            status:
              error.code === "42501" || /permission denied|policy/i.test(error.message)
                ? "denied"
                : "error",
            rowsVisible: 0,
            errorCode: error.code,
            errorMessage: error.message,
          };
        } else {
          results[spec.key] = {
            status: (count ?? data?.length ?? 0) > 0 || data !== null ? "allowed" : "allowed",
            rowsVisible: count ?? data?.length ?? 0,
          };
        }
      }),
    );
    setProbes({ ...results });
    setRunning(false);
  };

  useEffect(() => {
    if (user && role !== undefined) void runProbes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, role]);

  const summary = useMemo(() => {
    let mismatches = 0;
    let allowed = 0;
    let denied = 0;
    for (const spec of MODULES) {
      const probe = probes[spec.key];
      const expected = expectedRead(spec, role);
      if (probe.status === "allowed") allowed += 1;
      if (probe.status === "denied") denied += 1;
      if (probe.status === "allowed" && !expected) mismatches += 1;
      if (probe.status === "denied" && expected) mismatches += 1;
    }
    return { allowed, denied, mismatches };
  }, [probes, role]);

  if (loading || !user) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-paper text-sm text-muted-foreground">
        Loading access profile…
      </div>
    );
  }

  return (
    <AppShell>
      <div className="p-4 sm:p-6 md:p-8 w-full max-w-6xl mx-auto">
        <PageHeader
          title="Access Profile"
          subtitle="Your assigned role and validated module permissions for this vessel."
          action={
            <button
              onClick={runProbes}
              disabled={running}
              className="text-xs uppercase tracking-wider px-3 py-2 border border-black/15 rounded-sm hover:bg-secondary disabled:opacity-50"
            >
              {running ? "Probing…" : "Re-run validation"}
            </button>
          }
        />

        {/* Identity card */}
        <section className="grid md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white border border-black/10 p-5 rounded-sm">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Signed in as
            </div>
            <div className="font-mono text-sm break-all">{user.email}</div>
            <div className="text-xs text-muted-foreground mt-1">UID {user.id.slice(0, 8)}…</div>
          </div>
          <div className="bg-white border border-black/10 p-5 rounded-sm">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Assigned role
            </div>
            {role ? (
              <>
                <div className="text-lg font-semibold">{ROLE_LABEL[role]}</div>
                <div className="font-mono text-xs text-muted-foreground mt-1">{role}</div>
              </>
            ) : (
              <div className="text-sm text-danger">
                No role assigned — contact your project manager.
              </div>
            )}
          </div>
          <div className="bg-white border border-black/10 p-5 rounded-sm">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
              Vessel
            </div>
            <div className="text-lg font-semibold">{vesselName ?? "—"}</div>
          </div>
        </section>

        {/* Summary */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <Stat label="Modules accessible" value={summary.allowed} tone="ok" />
          <Stat label="Modules denied by RLS" value={summary.denied} tone="muted" />
          <Stat
            label="Policy / expectation mismatches"
            value={summary.mismatches}
            tone={summary.mismatches > 0 ? "danger" : "ok"}
          />
        </section>

        {/* Matrix */}
        <section className="bg-white border border-black/10 rounded-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-black/10 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider">Module access matrix</h2>
            <div className="text-xs text-muted-foreground">
              Live-tested against database row-level security
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-5 py-2.5">Module</th>
                  <th className="text-left px-5 py-2.5">Expected read</th>
                  <th className="text-left px-5 py-2.5">Expected write</th>
                  <th className="text-left px-5 py-2.5">Live RLS check</th>
                  <th className="text-left px-5 py-2.5">Open</th>
                </tr>
              </thead>
              <tbody>
                {MODULES.map((spec) => {
                  const probe = probes[spec.key];
                  const eRead = expectedRead(spec, role);
                  const eWrite = expectedWrite(spec, role);
                  const mismatch =
                    (probe.status === "allowed" && !eRead) || (probe.status === "denied" && eRead);
                  return (
                    <tr
                      key={spec.key}
                      className={`border-t border-black/5 ${mismatch ? "bg-danger/5" : ""}`}
                    >
                      <td className="px-5 py-3">
                        <div className="font-medium">{spec.label}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {spec.probeTable}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <Badge ok={eRead}>{eRead ? "Allowed" : "Restricted"}</Badge>
                      </td>
                      <td className="px-5 py-3">
                        <Badge ok={eWrite}>{eWrite ? "Allowed" : "Read-only"}</Badge>
                      </td>
                      <td className="px-5 py-3">
                        <ProbePill probe={probe} />
                        {mismatch && (
                          <div className="text-[11px] text-danger mt-1">
                            ⚠ Does not match expected policy
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {eRead || probe.status === "allowed" ? (
                          <a
                            href={firstAccessibleRoute(spec, role)}
                            title={`Open ${spec.label} — first accessible screen for ${role ? ROLE_LABEL[role] : "your role"}`}
                            className="text-xs text-ocean hover:underline"
                          >
                            Open →
                          </a>
                        ) : (
                          <span
                            tabIndex={0}
                            role="img"
                            aria-label={restrictionReason(spec, role)}
                            title={restrictionReason(spec, role)}
                            className="inline-flex items-center gap-1 text-xs text-muted-foreground cursor-help underline decoration-dotted underline-offset-2"
                          >
                            <span aria-hidden>🔒</span> Restricted
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Database consistency check */}
        <ConsistencyCheck />

        {/* Troubleshooting panel */}
        <TroubleshootingPanel
          role={role}
          vesselId={vesselId}
          vesselName={vesselName}
          probes={probes}
        />

        <p className="text-xs text-muted-foreground mt-4">
          Read = SELECT permission · Write = INSERT/UPDATE permission. Live checks query each table
          directly; a denial here means PostgreSQL row-level security blocked the request, not the
          UI. Hover a restricted module to see why access is blocked; click <em>Open</em> to jump
          straight to the first screen your role can use.
        </p>
      </div>
    </AppShell>
  );
}

// ----------------------------------------------------------------------------
// Troubleshooting panel
// ----------------------------------------------------------------------------

interface DiagnosisCheck {
  id: string;
  ok: boolean;
  title: string;
  detail: string;
  inspect: { label: string; tables: string[]; policies: string[] }[];
  fix: string;
}

function TroubleshootingPanel({
  role,
  vesselId,
  vesselName,
  probes,
}: {
  role: AppRole | null;
  vesselId: string | null;
  vesselName: string | null;
  probes: Record<ModuleKey, ProbeResult>;
}) {
  // Aggregate signals from probes
  const denials = MODULES.filter((m) => probes[m.key]?.status === "denied");
  const errors = MODULES.filter((m) => probes[m.key]?.status === "error");
  const allowedButEmpty = MODULES.filter(
    (m) => probes[m.key]?.status === "allowed" && probes[m.key]?.rowsVisible === 0,
  );
  const unexpectedDenials = denials.filter((m) => expectedRead(m, role));

  const checks: DiagnosisCheck[] = [
    {
      id: "role",
      ok: role !== null,
      title: role ? `Role assigned: ${ROLE_LABEL[role]}` : "No role mapped to this account",
      detail: role
        ? "A row exists in user_roles for your auth UID, so RLS helpers like has_role() will resolve."
        : "Without a row in user_roles, every has_role() check returns false and you'll be denied on virtually every module.",
      inspect: [
        {
          label: "Verify a user_roles row exists for your UID",
          tables: ["user_roles"],
          policies: ["read own roles"],
        },
      ],
      fix: "Ask a Project Manager to insert a user_roles row mapping your auth UID to the correct app_role (and vessel_id).",
    },
    {
      id: "vessel",
      ok: vesselId !== null,
      title: vesselId
        ? `Vessel mapped: ${vesselName ?? vesselId.slice(0, 8) + "…"}`
        : "No vessel mapped on your profile",
      detail: vesselId
        ? "Your profiles.vessel_id is set, so vessel-scoped queries will return rows belonging to your vessel."
        : "Most tables (works_orders, snags, schedule_items, …) are vessel-scoped. A null profiles.vessel_id usually means modules look empty even when RLS allows SELECT.",
      inspect: [
        {
          label: "Check your profile's vessel mapping",
          tables: ["profiles", "vessels"],
          policies: ["read own profile"],
        },
      ],
      fix: "Update your profile so vessel_id points at the correct vessel (Y709). The handle_new_user() trigger sets this for new sign-ups, but legacy accounts may need a manual fix.",
    },
    {
      id: "expectations",
      ok: unexpectedDenials.length === 0,
      title:
        unexpectedDenials.length === 0
          ? "No unexpected RLS denials"
          : `${unexpectedDenials.length} module${unexpectedDenials.length === 1 ? "" : "s"} denied despite your role being allowed`,
      detail:
        unexpectedDenials.length === 0
          ? "Every module your role should access returned an Allowed status from PostgreSQL."
          : `RLS rejected: ${unexpectedDenials.map((m) => m.label).join(", ")}. This usually means the policy USING expression doesn't match your role, or has_role() returned false.`,
      inspect: unexpectedDenials.length
        ? unexpectedDenials.map((m) => ({
            label: `Inspect ${m.label} policy`,
            tables: [m.probeTable],
            policies: [`read ${m.probeTable.replace(/_/g, " ")}`],
          }))
        : [],
      fix: "Re-check the SELECT policy USING clause on the affected tables. Confirm your user_roles row uses the exact app_role enum value referenced in the policy.",
    },
    {
      id: "empty",
      ok: allowedButEmpty.length === 0,
      title:
        allowedButEmpty.length === 0
          ? "All allowed modules returned data"
          : `${allowedButEmpty.length} allowed module${allowedButEmpty.length === 1 ? "" : "s"} returned 0 rows`,
      detail:
        allowedButEmpty.length === 0
          ? "Tables your role can read are populated for your vessel."
          : `Allowed but empty: ${allowedButEmpty.map((m) => m.label).join(", ")}. RLS isn't blocking you — the table simply has no rows your filter matched (often a vessel mismatch).`,
      inspect: allowedButEmpty.map((m) => ({
        label: `Confirm ${m.label} has rows for your vessel`,
        tables: [m.probeTable],
        policies: [],
      })),
      fix: "Verify rows in those tables have vessel_id matching your profile's vessel_id. Suppliers also need supplier_id = auth.uid() on works_orders rows.",
    },
    {
      id: "errors",
      ok: errors.length === 0,
      title:
        errors.length === 0
          ? "No backend errors during validation"
          : `${errors.length} module${errors.length === 1 ? "" : "s"} returned a non-RLS error`,
      detail:
        errors.length === 0
          ? "All probe queries returned cleanly (allowed or denied — never errored)."
          : `Errored: ${errors.map((m) => `${m.label} (${probes[m.key].errorCode ?? "?"})`).join(", ")}. These are not RLS denials — usually a missing column, broken policy expression, or schema drift.`,
      inspect: errors.map((m) => ({
        label: `Investigate ${m.label}`,
        tables: [m.probeTable],
        policies: [],
      })),
      fix: "Check the SQL editor for the failing query. Common causes: a policy referencing a dropped column, or a security-definer function with a stale search_path.",
    },
  ];

  const failing = checks.filter((c) => !c.ok);
  const tone =
    failing.length === 0
      ? "ok"
      : failing.some((c) => c.id === "role" || c.id === "vessel")
        ? "danger"
        : "warn";

  return (
    <section className="bg-white border border-black/10 rounded-sm overflow-hidden mt-8">
      <div
        className={`px-5 py-3 border-b border-black/10 flex items-center justify-between ${
          tone === "danger" ? "bg-danger/5" : tone === "warn" ? "bg-amber-50" : "bg-emerald-50"
        }`}
      >
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider">RLS troubleshooting</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Why a module might be denied or empty, and exactly which tables &amp; policies to
            inspect.
          </p>
        </div>
        <span
          className={`text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-sm border ${
            tone === "danger"
              ? "bg-danger/10 text-danger border-danger/30"
              : tone === "warn"
                ? "bg-amber-100 text-amber-800 border-amber-300"
                : "bg-emerald-100 text-emerald-800 border-emerald-300"
          }`}
        >
          {failing.length === 0
            ? "All checks pass"
            : `${failing.length} issue${failing.length === 1 ? "" : "s"}`}
        </span>
      </div>

      <ul className="divide-y divide-black/5">
        {checks.map((c) => (
          <li key={c.id} className="px-5 py-4">
            <div className="flex items-start gap-3">
              <span
                className={`mt-1 inline-block size-2 rounded-full shrink-0 ${
                  c.ok ? "bg-emerald-600" : "bg-amber-500"
                }`}
                aria-hidden
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold">{c.title}</h3>
                  <span
                    className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm ${
                      c.ok
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-amber-50 text-amber-800 border border-amber-200"
                    }`}
                  >
                    {c.ok ? "OK" : "Action needed"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{c.detail}</p>

                {!c.ok && (
                  <div className="mt-3 grid md:grid-cols-2 gap-3">
                    <div className="bg-secondary/40 border border-black/10 rounded-sm p-3">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                        Inspect
                      </div>
                      {c.inspect.length === 0 ? (
                        <div className="text-xs text-muted-foreground">
                          Nothing specific to inspect.
                        </div>
                      ) : (
                        <ul className="space-y-1.5">
                          {c.inspect.map((insp, i) => (
                            <li key={i} className="text-xs">
                              <div className="font-medium">{insp.label}</div>
                              {insp.tables.length > 0 && (
                                <div className="text-muted-foreground mt-0.5">
                                  Tables:{" "}
                                  {insp.tables.map((t, j) => (
                                    <code
                                      key={t}
                                      className="font-mono bg-white border border-black/10 px-1 py-0.5 rounded-sm mr-1"
                                    >
                                      {t}
                                      {j < insp.tables.length - 1 ? "" : ""}
                                    </code>
                                  ))}
                                </div>
                              )}
                              {insp.policies.length > 0 && (
                                <div className="text-muted-foreground mt-0.5">
                                  Policies:{" "}
                                  {insp.policies.map((p) => (
                                    <code
                                      key={p}
                                      className="font-mono bg-white border border-black/10 px-1 py-0.5 rounded-sm mr-1"
                                    >
                                      {p}
                                    </code>
                                  ))}
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="bg-secondary/40 border border-black/10 rounded-sm p-3">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                        Suggested fix
                      </div>
                      <p className="text-xs">{c.fix}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="px-5 py-3 border-t border-black/10 bg-secondary/30 text-[11px] text-muted-foreground">
        Tip: RLS denials show error code <code className="font-mono">42501</code> in PostgreSQL
        logs. If a query returns rows but the UI looks empty, suspect a vessel mismatch (
        <code className="font-mono">vessel_id</code>) before suspecting a policy.
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "danger" | "muted";
}) {
  const toneCls =
    tone === "danger"
      ? "text-danger"
      : tone === "ok"
        ? "text-emerald-700"
        : "text-muted-foreground";
  return (
    <div className="bg-white border border-black/10 p-5 rounded-sm">
      <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{label}</div>
      <div className={`text-3xl font-semibold ${toneCls}`}>{value}</div>
    </div>
  );
}

function Badge({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`inline-block text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-sm ${
        ok
          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
          : "bg-secondary text-muted-foreground border border-black/10"
      }`}
    >
      {children}
    </span>
  );
}

function ProbePill({ probe }: { probe: ProbeResult }) {
  if (probe.status === "pending") {
    return <span className="text-xs text-muted-foreground">Probing…</span>;
  }
  if (probe.status === "allowed") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
        <span className="size-1.5 rounded-full bg-emerald-600" />
        Allowed · {probe.rowsVisible} row{probe.rowsVisible === 1 ? "" : "s"} visible
      </span>
    );
  }
  if (probe.status === "denied") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="size-1.5 rounded-full bg-muted-foreground/60" />
        Denied by RLS
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-danger"
      title={probe.errorMessage}
    >
      <span className="size-1.5 rounded-full bg-danger" />
      Error {probe.errorCode ?? ""}
    </span>
  );
}
