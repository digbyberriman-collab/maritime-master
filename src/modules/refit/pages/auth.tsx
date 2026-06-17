import { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth, type AppRole } from "@/modules/refit/lib/auth";
import { classifyAuthError, logAuthFailure } from "@/modules/refit/lib/diagnostics";
import { AuthBanner, emailConfirmCopy } from "@/modules/refit/components/AuthBanner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY) as string;

type VerifyState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ok"; userId: string; role: AppRole | null }
  | { status: "no_account" }
  | { status: "bad_password" }
  | { status: "unconfirmed" }
  | { status: "error"; message: string };

type AuthNotice =
  | "reset_sent"
  | "recovery"
  | "confirmed"
  | "session_expired"
  | "session_missing"
  | "email_unconfirmed";

type AuthSearch = {
  notice?: AuthNotice;
  email?: string;
  redirect?: string;
};

const NOTICES: readonly AuthNotice[] = [
  "reset_sent",
  "recovery",
  "confirmed",
  "session_expired",
  "session_missing",
  "email_unconfirmed",
];

// Allow only safe internal redirect targets — never an absolute external URL.
function safeRedirect(input: unknown): string | undefined {
  if (typeof input !== "string" || !input) return undefined;
  if (!input.startsWith("/") || input.startsWith("//")) return undefined;
  if (input.startsWith("/auth")) return undefined;
  return input;
}

const TEST_ACCOUNTS: { email: string; role: AppRole }[] = [
  { email: "owner@storm.app", role: "owner" },
  { email: "captain@storm.app", role: "captain" },
  { email: "pm@storm.app", role: "project_manager" },
  { email: "supplier@storm.app", role: "supplier" },
];

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { user, loading } = useAuth();
  const [email, setEmail] = useState(search.email ?? "pm@storm.app");
  const [password, setPassword] = useState("Storm-Y727-Refit-2026");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verify, setVerify] = useState<VerifyState>({ status: "idle" });
  // Tracks the last action so we can show post-action banners.
  const [postAction, setPostAction] = useState<"signed_up" | "resent" | null>(null);
  const [resending, setResending] = useState(false);

  // Infer the assigned role from the typed email so banner copy is appropriate
  // even before the account exists. Falls back to verified role after probe.
  const inferredRole: AppRole | null = useMemo(() => {
    if (verify.status === "ok") return verify.role;
    return TEST_ACCOUNTS.find((a) => a.email === email)?.role ?? null;
  }, [email, verify]);

  // Show the "confirm your email" banner whenever the system reports the
  // address is unverified, OR right after a fresh signup.
  const needsEmailConfirm =
    verify.status === "unconfirmed" || postAction === "signed_up" || postAction === "resent";

  const resendConfirmation = async () => {
    if (!email) return;
    setResending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth?notice=confirmed` },
    });
    setResending(false);
    if (error) {
      setError(error.message);
      return;
    }
    setPostAction("resent");
  };

  useEffect(() => {
    if (loading || !user) return;
    // Don't auto-leave the page if the user still needs to confirm their email —
    // the banner here will guide them. RequireAuth on protected pages bounces
    // them back with notice=email_unconfirmed if they try to navigate away.
    const confirmed =
      !!user.email_confirmed_at || !!(user as { confirmed_at?: string }).confirmed_at;
    if (!confirmed) return;
    const target = search.redirect ?? "/";
    if (target === "/") navigate({ to: "/" });
    else window.location.assign(target);
  }, [user, loading, navigate, search.redirect]);

  const ensureRoleAndVessel = async (userId: string, emailAddr: string) => {
    const match = TEST_ACCOUNTS.find((a) => a.email === emailAddr);
    const role: AppRole = match?.role ?? "captain";
    await supabase.from("user_roles").insert({
      user_id: userId,
      role,
      vessel_id: "00000000-0000-0000-0000-000000000727",
    });
  };

  // Verify credentials WITHOUT touching the active session.
  // Uses an isolated Supabase client (no localStorage persistence) so a
  // successful sign-in here does not log the user in for real.
  const runVerification = async () => {
    setVerify({ status: "checking" });
    setError(null);
    const probe = createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, storageKey: "storm-verify" },
    });
    const { data, error } = await probe.auth.signInWithPassword({ email, password });
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes("email not confirmed")) {
        await logAuthFailure({ reason: "unconfirmed_email", email, context: "verify" });
        return setVerify({ status: "unconfirmed" });
      }
      if (error.code === "invalid_credentials" || msg.includes("invalid login")) {
        // Distinguish missing account vs. wrong password by attempting a signup
        // with a throwaway password — Supabase returns "User already registered"
        // if the email exists.
        const { error: probeErr } = await probe.auth.signUp({
          email,
          password: `verify-only-${crypto.randomUUID()}`,
        });
        const probeMsg = (probeErr?.message ?? "").toLowerCase();
        if (probeMsg.includes("already registered") || probeMsg.includes("already exists")) {
          await logAuthFailure({ reason: "bad_password", email, context: "verify" });
          return setVerify({ status: "bad_password" });
        }
        await logAuthFailure({ reason: "no_account", email, context: "verify" });
        return setVerify({ status: "no_account" });
      }
      await logAuthFailure({ reason: classifyAuthError(error), email, context: "verify" });
      return setVerify({ status: "error", message: error.message });
    }
    // Success: read role, then sign the probe client out
    let role: AppRole | null = null;
    if (data.user) {
      const { data: r } = await probe
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id)
        .limit(1)
        .maybeSingle();
      role = (r?.role as AppRole) ?? null;
    }
    await probe.auth.signOut();
    setVerify({ status: "ok", userId: data.user!.id, role });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth?notice=confirmed` },
        });
        if (error) throw error;
        if (data.user) await ensureRoleAndVessel(data.user.id, email);
        // If email confirmation is required, signUp returns a user but NO session.
        // Stay on this page and surface the "confirm your email" banner instead
        // of navigating to a protected route the user can't yet reach.
        if (!data.session) {
          setPostAction("signed_up");
          setMode("signin");
          return;
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          // Auto-provision test accounts on first use
          if (TEST_ACCOUNTS.some((a) => a.email === email)) {
            const { data: signUp, error: suErr } = await supabase.auth.signUp({ email, password });
            if (suErr) throw suErr;
            if (signUp.user) {
              await ensureRoleAndVessel(signUp.user.id, email);
              const { error: siErr } = await supabase.auth.signInWithPassword({ email, password });
              if (siErr) throw siErr;
            }
          } else {
            throw error;
          }
        } else if (data.user) {
          // Ensure role exists for test accounts
          const { data: existing } = await supabase
            .from("user_roles")
            .select("id")
            .eq("user_id", data.user.id)
            .limit(1)
            .maybeSingle();
          if (!existing) await ensureRoleAndVessel(data.user.id, email);
        }
      }
      // Navigation handled by the auth-state effect (honors ?redirect=).
    } catch (err) {
      await logAuthFailure({ reason: classifyAuthError(err), email, context: mode });
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh grid md:grid-cols-2 bg-paper">
      <div className="hidden md:flex flex-col justify-between bg-navy text-white p-12">
        <div className="text-xs tracking-[0.25em] uppercase text-ocean font-semibold">
          OCEANCOS // REFIT
        </div>
        <div>
          <h2 className="text-4xl font-semibold leading-tight">
            Refit programme management for the world's most demanding vessels.
          </h2>
          <p className="mt-4 text-white/60 text-sm max-w-md">
            A single, immutable record of every works order, snag, drawing, and decision — from
            drydock entry to sea trials.
          </p>
        </div>
        <div className="text-xs text-white/40">© Oceanco — OceancOS Platform</div>
      </div>
      <div className="flex items-center justify-center p-4 sm:p-6 md:p-8">
        <div className="w-full max-w-sm">
          <h1 className="font-semibold mb-1">{mode === "signin" ? "Sign in" : "Create account"}</h1>
          <p className="text-sm text-muted-foreground mb-6">Access vessel Y727 refit programme.</p>

          {/* Contextual, role-appropriate banners shown above the form. */}
          <div className="space-y-2 mb-5">
            {search.notice === "session_expired" && (
              <AuthBanner tone="warning" title="Session ended">
                For your security, you were signed out after a period of inactivity. Sign in again
                to resume.
              </AuthBanner>
            )}

            {search.notice === "session_missing" && (
              <AuthBanner tone="warning" title="Sign-in required">
                You tried to open a protected page without an active session. Sign in below and
                we'll take you straight back to where you were.
              </AuthBanner>
            )}

            {search.notice === "email_unconfirmed" && (
              <AuthBanner tone="warning" title="Confirm your email to continue">
                Your account exists but the email address{" "}
                {search.email ? (
                  <>
                    <span className="font-mono">{search.email}</span>{" "}
                  </>
                ) : (
                  ""
                )}
                hasn't been verified yet. Open the confirmation link we emailed you, or request a
                new one below — protected pages stay locked until confirmation is complete.
              </AuthBanner>
            )}

            {search.notice === "confirmed" && (
              <AuthBanner tone="success" title="Email confirmed">
                Thanks — your email address is verified. You can sign in below.
              </AuthBanner>
            )}

            {search.notice === "reset_sent" && (
              <AuthBanner tone="info" title="Password reset email sent">
                We've emailed a password reset link to{" "}
                <span className="font-mono">{search.email ?? "your inbox"}</span>. Open it within 1
                hour, choose a new password, then return here to sign in. You won't be able to sign
                in with your old password until the reset is complete.
              </AuthBanner>
            )}

            {search.notice === "recovery" && (
              <AuthBanner
                tone="warning"
                title="Finish your password reset"
                action={
                  <Link
                    to="/reset-password"
                    className="inline-block text-xs px-3 py-1.5 bg-navy text-white rounded-sm hover:opacity-90"
                  >
                    Set a new password
                  </Link>
                }
              >
                You arrived from a password reset link. Set a new password to regain access — your
                old password is no longer valid.
              </AuthBanner>
            )}

            {needsEmailConfirm &&
              (() => {
                const copy = emailConfirmCopy(inferredRole);
                return (
                  <AuthBanner
                    tone={postAction === "resent" ? "success" : "warning"}
                    title={postAction === "resent" ? "Confirmation email re-sent" : copy.title}
                    action={
                      <button
                        type="button"
                        onClick={resendConfirmation}
                        disabled={resending || !email}
                        className="text-xs px-3 py-1.5 border border-black/15 bg-white rounded-sm hover:bg-secondary disabled:opacity-50"
                      >
                        {resending
                          ? "Sending…"
                          : postAction === "resent"
                            ? "Send again"
                            : "Resend confirmation email"}
                      </button>
                    }
                  >
                    {postAction === "resent" ? (
                      <>
                        We've sent a new confirmation link to{" "}
                        <span className="font-mono">{email}</span>. The previous link is now
                        invalid.
                      </>
                    ) : (
                      <>{copy.body} Check spam if it doesn't arrive within a few minutes.</>
                    )}
                  </AuthBanner>
                );
              })()}
          </div>

          <div className="mb-4 space-y-2">
            <button
              type="button"
              onClick={async () => {
                setError(null);
                setBusy(true);
                const result = await lovable.auth.signInWithOAuth("google", {
                  redirect_uri: window.location.origin,
                });
                if (result.error) {
                  setBusy(false);
                  setError(result.error.message ?? "Google sign-in failed");
                }
              }}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 bg-white border border-black/15 text-ink py-2.5 rounded-sm text-sm font-medium hover:bg-secondary disabled:opacity-50"
            >
              <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.9 32.4 29.4 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.7 6.3 29.1 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.4-.3-3.5z"/>
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.7 6.3 29.1 4.5 24 4.5 16.4 4.5 9.9 8.8 6.3 14.7z"/>
                <path fill="#4CAF50" d="M24 43.5c5 0 9.6-1.7 13.2-4.6l-6.1-5.1c-2 1.4-4.4 2.2-7.1 2.2-5.4 0-9.9-3.1-11.3-7.5l-6.5 5C9.7 39.1 16.2 43.5 24 43.5z"/>
                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.7 2-2 3.8-3.6 5.1l6.1 5.1c-.4.4 6.7-4.9 6.7-14.2 0-1.2-.1-2.4-.3-3.5z"/>
              </svg>
              Continue with Google
            </button>
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-black/10" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">or</span>
              <div className="flex-1 h-px bg-black/10" />
            </div>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setVerify({ status: "idle" });
                }}
                className="w-full px-3 py-2 bg-white border border-input rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setVerify({ status: "idle" });
                }}
                className="w-full px-3 py-2 bg-white border border-input rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            {/* Verification step */}
            <div className="border border-black/10 rounded-sm p-3 bg-secondary/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  Pre-flight check
                </span>
                <button
                  type="button"
                  onClick={runVerification}
                  disabled={verify.status === "checking" || !email || !password}
                  className="text-xs px-2 py-1 border border-black/15 bg-white rounded-sm hover:bg-secondary disabled:opacity-50"
                >
                  {verify.status === "checking" ? "Verifying…" : "Verify account"}
                </button>
              </div>
              <VerifyMessage state={verify} />
            </div>

            {error && (
              <div className="text-xs text-danger bg-danger/10 px-3 py-2 rounded-sm">{error}</div>
            )}
            <button
              type="submit"
              disabled={busy || (mode === "signin" && verify.status !== "ok")}
              className="w-full bg-navy text-white py-2.5 rounded-sm text-sm font-medium hover:opacity-90 disabled:opacity-50"
              title={
                mode === "signin" && verify.status !== "ok" ? "Verify the account first" : undefined
              }
            >
              {busy ? "Working..." : mode === "signin" ? "Sign in" : "Create account"}
            </button>
            <button
              type="button"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="w-full text-xs text-muted-foreground hover:text-ink"
            >
              {mode === "signin" ? "Need an account? Create one" : "Have an account? Sign in"}
            </button>
            <Link
              to="/forgot-password"
              className="block text-center text-xs text-muted-foreground hover:text-ink underline-offset-2 hover:underline"
            >
              Forgot your password?
            </Link>
          </form>
          <div className="mt-8 pt-6 border-t border-black/10">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Test accounts (password: Storm-Y727-Refit-2026)
              </p>
              <Link
                to="/login-help"
                className="text-[10px] text-ocean hover:text-navy underline-offset-2 hover:underline font-medium"
              >
                What does each role see?
              </Link>
            </div>
            <div className="space-y-1.5 text-xs">
              {TEST_ACCOUNTS.map((a) => (
                <button
                  key={a.email}
                  onClick={() => {
                    setEmail(a.email);
                    setPassword("Storm-Y727-Refit-2026");
                    setVerify({ status: "idle" });
                  }}
                  className="block w-full text-left px-2 py-1 hover:bg-secondary rounded-sm font-mono"
                >
                  {a.email} <span className="text-muted-foreground ml-1">— {a.role}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function VerifyMessage({ state }: { state: VerifyState }) {
  switch (state.status) {
    case "idle":
      return (
        <p className="text-xs text-muted-foreground">
          Confirm the account exists and the password works before signing in.
        </p>
      );
    case "checking":
      return (
        <p className="text-xs text-muted-foreground">
          Checking credentials against the auth service…
        </p>
      );
    case "ok":
      return (
        <p className="text-xs text-emerald-700 flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-emerald-600" />
          Verified · account exists, password accepted{state.role ? ` · role: ${state.role}` : ""}
        </p>
      );
    case "no_account":
      return (
        <p className="text-xs text-danger">
          No account found for this email. Use "Create one" below.
        </p>
      );
    case "bad_password":
      return (
        <p className="text-xs text-danger">
          Account exists but the password is incorrect. Try again or reset it.
        </p>
      );
    case "unconfirmed":
      return (
        <p className="text-xs text-danger">
          Account exists but the email has not been confirmed yet.
        </p>
      );
    case "error":
      return <p className="text-xs text-danger">Verification error: {state.message}</p>;
  }
}
