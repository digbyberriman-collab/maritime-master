import { useEffect, useState } from "react";
import { AppShell, PageHeader } from "@/modules/refit/components/AppShell";
import { RequireAuth } from "@/modules/refit/components/RequireAuth";
import { useAuth, ROLE_LABEL } from "@/modules/refit/lib/auth";
import {
  runAccessCheck,
  saveAccessCheck,
  loadAccessCheck,
  type AccessCheckResult,
} from "@/modules/refit/lib/accessCheck";

export default function AccessCheckPage() {
  const { realRole } = useAuth();
  const [result, setResult] = useState<AccessCheckResult | null>(() => loadAccessCheck());
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      const r = await runAccessCheck(realRole);
      saveAccessCheck(r);
      setResult(r);
    } finally {
      setRunning(false);
    }
  };

  useEffect(() => {
    if (!result && realRole) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realRole]);

  return (
    <AppShell>
      <PageHeader
        title="Access Check"
        subtitle="Automated RLS & role-based access verification"
      />

      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={run}
          disabled={running}
          className="px-4 py-2 rounded-sm bg-ocean text-white text-sm hover:bg-ocean/90 disabled:opacity-50"
        >
          {running ? "Running…" : "Re-run check"}
        </button>
        {result && (
          <div className="text-xs text-white/60">
            Last run: {new Date(result.ranAt).toLocaleString()} · role:{" "}
            {result.role ? ROLE_LABEL[result.role] : "—"}
          </div>
        )}
      </div>

      {result && (
        <div
          className={`mb-4 px-4 py-3 rounded-sm border text-sm ${
            result.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-amber-500/40 bg-amber-500/10 text-amber-200"
          }`}
        >
          {result.ok
            ? `All ${result.probes.length} access probes passed.`
            : `${result.problems.length} of ${result.probes.length} probes failed — review below.`}
        </div>
      )}

      <div className="overflow-x-auto border border-white/10 rounded-sm">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-white/70 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left px-3 py-2">Table</th>
              <th className="text-left px-3 py-2">Expected</th>
              <th className="text-left px-3 py-2">Actual</th>
              <th className="text-left px-3 py-2">Rows</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Detail</th>
            </tr>
          </thead>
          <tbody>
            {result?.probes.map((p) => (
              <tr key={p.table} className="border-t border-white/5">
                <td className="px-3 py-2 font-mono text-xs">{p.table}</td>
                <td className="px-3 py-2 text-white/70">{p.expected}</td>
                <td className="px-3 py-2 text-white/70">{p.actual}</td>
                <td className="px-3 py-2 text-white/60">{p.rows ?? "—"}</td>
                <td className="px-3 py-2">
                  {p.ok ? (
                    <span className="text-emerald-300">OK</span>
                  ) : p.rlsBlocked ? (
                    <span className="text-amber-300">RLS blocked</span>
                  ) : (
                    <span className="text-red-300">Error</span>
                  )}
                </td>
                <td className="px-3 py-2 text-white/60 text-xs max-w-md truncate">
                  {p.error ?? ""}
                </td>
              </tr>
            ))}
            {!result && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-white/50">
                  {running ? "Running access check…" : "No results yet."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-white/50">
        This check runs automatically once per signed-in session and on demand here.
        It probes the core tables with the current user's session, so it reflects
        the real RLS outcome — not a preview role. If an expected-allow table is
        blocked, your role assignment or RLS policy needs attention.
      </p>
    </AppShell>
  );
}
