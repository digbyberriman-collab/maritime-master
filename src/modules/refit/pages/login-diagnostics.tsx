import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/modules/refit/lib/auth";
import { AppShell, PageHeader } from "@/modules/refit/components/AppShell";
import { RequireAuth } from "@/modules/refit/components/RequireAuth";

interface DiagRow {
  id: string;
  occurred_at: string;
  reason_code: string;
  reason_label: string;
  email_masked: string | null;
  email_domain: string | null;
  client_hash: string | null;
  user_agent_family: string | null;
  context: string | null;
}

const ADMIN_ROLES = ["owner", "shore_management"] as const;

export default function LoginDiagnosticsPage() {
  const { user, role, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<DiagRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const isAdmin = !!role && (ADMIN_ROLES as readonly string[]).includes(role);

  useEffect(() => {
    if (authLoading || !user || !isAdmin) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("rf_auth_diagnostics" as any)
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(200);
      if (cancelled) return;
      if (error) setError(error.message);
      else setRows((data ?? []) as unknown as DiagRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, isAdmin]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    if (filter === "all") return rows;
    return rows.filter((r) => r.reason_code === filter);
  }, [rows, filter]);

  const tally = useMemo(() => {
    const t: Record<string, number> = {};
    (rows ?? []).forEach((r) => {
      t[r.reason_code] = (t[r.reason_code] ?? 0) + 1;
    });
    return t;
  }, [rows]);

  if (authLoading) {
    return (
      <AppShell>
        <div className="p-10 text-sm text-muted-foreground">Loading session…</div>
      </AppShell>
    );
  }

  if (!user) {
    return (
      <AppShell>
        <div className="p-4 sm:p-10 w-full max-w-[1600px] mx-auto">
          <PageHeader title="Login Diagnostics" subtitle="Sign in to view." />
          <Link to="/auth" className="text-sm underline">
            Go to sign in
          </Link>
        </div>
      </AppShell>
    );
  }

  if (!isAdmin) {
    return (
      <AppShell>
        <div className="p-4 sm:p-10 w-full max-w-[1600px] mx-auto">
          <PageHeader
            title="Login Diagnostics"
            subtitle="Restricted area — Owner or Shore Management role required."
          />
          <div className="border border-danger/30 bg-danger/5 text-danger text-sm rounded-sm p-4 max-w-xl">
            Your role ({role ?? "none"}) does not have permission to view authentication failure
            diagnostics. This protects user privacy: only administrators can see why other users
            fail to sign in.
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="p-4 sm:p-6 md:p-10 w-full max-w-[1600px] mx-auto">
        <PageHeader
          title="Login Diagnostics"
          subtitle="Recent authentication failures (last 200). Emails are masked, IPs are not stored, and passwords are never recorded."
        />

        {error && (
          <div className="text-xs text-danger bg-danger/10 px-3 py-2 rounded-sm mb-4">{error}</div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {Object.entries(tally).map(([code, n]) => (
            <button
              key={code}
              onClick={() => setFilter(code)}
              className={`text-left border rounded-sm p-3 transition ${filter === code ? "border-navy bg-navy/5" : "border-black/10 hover:border-black/30"}`}
            >
              <div className="text-2xl font-semibold tabular-nums">{n}</div>
              <div className="text-xs text-muted-foreground mt-0.5 font-mono">{code}</div>
            </button>
          ))}
          <button
            onClick={() => setFilter("all")}
            className={`text-left border rounded-sm p-3 transition ${filter === "all" ? "border-navy bg-navy/5" : "border-black/10 hover:border-black/30"}`}
          >
            <div className="text-2xl font-semibold tabular-nums">{rows?.length ?? 0}</div>
            <div className="text-xs text-muted-foreground mt-0.5 font-mono">all events</div>
          </button>
        </div>

        <div className="border border-black/10 rounded-sm overflow-x-auto">
          <table className="w-full min-w-[820px] text-xs">
            <thead className="bg-secondary/60 text-muted-foreground uppercase tracking-wider">
              <tr>
                <th className="text-left px-3 py-2 font-medium">When</th>
                <th className="text-left px-3 py-2 font-medium">Reason</th>
                <th className="text-left px-3 py-2 font-medium">Email (masked)</th>
                <th className="text-left px-3 py-2 font-medium">Domain</th>
                <th className="text-left px-3 py-2 font-medium">Context</th>
                <th className="text-left px-3 py-2 font-medium">Client</th>
                <th className="text-left px-3 py-2 font-medium">UA</th>
              </tr>
            </thead>
            <tbody>
              {rows === null ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                    No events recorded for this filter.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="border-t border-black/5 hover:bg-secondary/30">
                    <td className="px-3 py-2 font-mono whitespace-nowrap">
                      {new Date(r.occurred_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.reason_label}</div>
                      <div className="text-muted-foreground font-mono text-[10px]">
                        {r.reason_code}
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono">{r.email_masked ?? "—"}</td>
                    <td className="px-3 py-2 font-mono">{r.email_domain ?? "—"}</td>
                    <td className="px-3 py-2 font-mono">{r.context ?? "—"}</td>
                    <td className="px-3 py-2 font-mono">{r.client_hash ?? "—"}</td>
                    <td className="px-3 py-2">{r.user_agent_family ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground mt-4 max-w-2xl">
          Privacy notes: passwords, full email addresses, IP addresses, and session tokens are never
          logged. Email local-parts are masked (e.g.{" "}
          <span className="font-mono">c***h@storm.app</span>), and the client column is a one-way
          hash of browser/screen attributes used only to group repeated attempts.
        </p>
      </div>
    </AppShell>
  );
}
