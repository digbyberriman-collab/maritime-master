import { AppShell, PageHeader } from "@/modules/refit/components/AppShell";
import { RequireAuth } from "@/modules/refit/components/RequireAuth";
import { useAuth, ROLE_LABEL } from "@/modules/refit/lib/auth";
import { useSession } from "@/modules/refit/lib/session";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function SessionDiagnosticsPage() {
  const { status: sessionStatus, session } = useSession();
  const { user, role, realRole, roles, previewRole, canPreview, loading: authLoading } = useAuth();

  const [clientInfo, setClientInfo] = useState({
    ua: "",
    screen: "",
    language: "",
    platform: "",
    online: false,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    setClientInfo({
      ua: navigator.userAgent,
      screen: `${window.screen.width}x${window.screen.height}`,
      language: navigator.language,
      platform: navigator.platform,
      online: navigator.onLine,
    });
    const onOnline = () => setClientInfo((s) => ({ ...s, online: true }));
    const onOffline = () => setClientInfo((s) => ({ ...s, online: false }));
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const copyDiagnostics = () => {
    const payload = {
      sessionStatus,
      userId: user?.id ?? null,
      email: user?.email ?? null,
      activeRole: role ?? null,
      realRole: realRole ?? null,
      previewRole: previewRole ?? null,
      allRoles: roles,
      canPreview,
      sessionExpiry: session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : null,
      provider: user?.app_metadata?.provider ?? null,
      client: clientInfo,
    };
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
  };

  const isLoading = authLoading;

  return (
    <AppShell>
      <div className="p-4 sm:p-6 md:p-10 w-full max-w-[1100px] mx-auto">
        <PageHeader
          title="Session Diagnostics"
          subtitle="Current Supabase session state, user identity, and active role — useful for troubleshooting access issues."
          action={
            <button
              onClick={copyDiagnostics}
              className="inline-flex items-center gap-2 rounded-sm border border-black/10 bg-white px-3 py-2 text-xs font-medium hover:bg-secondary transition"
            >
              <svg width="14" height="14" viewBox="0 2 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              Copy to clipboard
            </button>
          }
        />

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading session…</div>
        ) : (
          <div className="space-y-6">
            {/* Session State */}
            <section className="border border-black/10 rounded-sm overflow-hidden">
              <div className="bg-secondary/60 px-4 py-2 text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-semibold">
                Supabase Session State
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <DiagnosticRow label="Session status" value={sessionStatus} />
                <DiagnosticRow
                  label="Session expiry"
                  value={
                    session?.expires_at
                      ? new Date(session.expires_at * 1000).toLocaleString()
                      : "—"
                  }
                />
                <DiagnosticRow
                  label="Provider"
                  value={(user?.app_metadata?.provider as string) ?? "email"}
                />
                <DiagnosticRow
                  label="Last sign-in"
                  value={
                    user?.last_sign_in_at
                      ? new Date(user.last_sign_in_at).toLocaleString()
                      : "—"
                  }
                />
              </div>
            </section>

            {/* Identity */}
            <section className="border border-black/10 rounded-sm overflow-hidden">
              <div className="bg-secondary/60 px-4 py-2 text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-semibold">
                User Identity
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <DiagnosticRow label="User ID" value={user?.id ?? "—"} mono />
                <DiagnosticRow label="Email" value={user?.email ?? "—"} />
                <DiagnosticRow label="Email confirmed" value={user?.email_confirmed_at ? "Yes" : "No"} />
                <DiagnosticRow label="Created at" value={user?.created_at ? new Date(user.created_at).toLocaleString() : "—"} />
              </div>
            </section>

            {/* Role / Permissions */}
            <section className="border border-black/10 rounded-sm overflow-hidden">
              <div className="bg-secondary/60 px-4 py-2 text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-semibold">
                Role & Permissions
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <DiagnosticRow
                  label="Active role"
                  value={role ? ROLE_LABEL[role] : "—"}
                  highlight={!!previewRole}
                  highlightNote={previewRole ? "(preview)" : undefined}
                />
                <DiagnosticRow label="Real role" value={realRole ? ROLE_LABEL[realRole] : "—"} />
                <DiagnosticRow
                  label="All assigned roles"
                  value={roles.map((r) => ROLE_LABEL[r]).join(", ") || "—"}
                />
                <DiagnosticRow label="Can preview roles" value={canPreview ? "Yes" : "No"} />
                {previewRole && (
                  <div className="col-span-full text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-sm px-3 py-2">
                    You are currently previewing as <strong>{ROLE_LABEL[previewRole]}</strong>. Your real account permissions still apply to data access.
                  </div>
                )}
              </div>
            </section>

            {/* Client Environment */}
            <section className="border border-black/10 rounded-sm overflow-hidden">
              <div className="bg-secondary/60 px-4 py-2 text-[10px] tracking-[0.2em] uppercase text-muted-foreground font-semibold">
                Client Environment
              </div>
              <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <DiagnosticRow label="Browser" value={clientInfo.ua ? parseBrowser(clientInfo.ua) : "—"} />
                <DiagnosticRow label="Screen" value={clientInfo.screen} />
                <DiagnosticRow label="Language" value={clientInfo.language} />
                <DiagnosticRow label="Platform" value={clientInfo.platform} />
                <DiagnosticRow
                  label="Network"
                  value={clientInfo.online ? "Online" : "Offline"}
                  status={clientInfo.online ? "success" : "warning"}
                />
              </div>
            </section>

            {/* Actions */}
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                onClick={async () => {
                  await supabase.auth.refreshSession();
                }}
                className="inline-flex items-center gap-2 rounded-sm bg-navy px-4 py-2 text-xs font-medium text-white hover:opacity-90 transition"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 1 0 1 3.38-5.36L23 10M1 14l16.35-6.36A9 9 0 0 1 20.49 15" />
                </svg>
                Refresh session
              </button>
              <button
                onClick={() => supabase.auth.signOut()}
                className="inline-flex items-center gap-2 rounded-sm border border-danger/30 text-danger px-4 py-2 text-xs font-medium hover:bg-danger/5 transition"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Sign out
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function DiagnosticRow({
  label,
  value,
  mono = false,
  highlight = false,
  highlightNote,
  status,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
  highlightNote?: string;
  status?: "success" | "warning" | "danger";
}) {
  const statusDot =
    status === "success" ? "bg-emerald-500" :
    status === "warning" ? "bg-amber-500" :
    status === "danger" ? "bg-red-500" :
    null;

  return (
    <div>
      <div className="text-[10px] tracking-[0.15em] uppercase text-muted-foreground mb-0.5">{label}</div>
      <div className={`flex items-center gap-2 font-medium text-ink ${mono ? "font-mono text-xs" : ""} ${highlight ? "text-navy" : ""}`}>
        {statusDot && <span className={`inline-block size-2 rounded-full ${statusDot}`} />}
        <span className="break-all">{value}</span>
        {highlightNote && <span className="text-[10px] text-muted-foreground font-normal">{highlightNote}</span>}
      </div>
    </div>
  );
}

function parseBrowser(ua: string): string {
  if (/Edg\//.test(ua)) return "Microsoft Edge";
  if (/OPR\//.test(ua) || /Opera/.test(ua)) return "Opera";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua)) return "Safari";
  return "Other";
}
