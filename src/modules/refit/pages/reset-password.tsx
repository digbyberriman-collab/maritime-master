import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthBanner } from "@/modules/refit/components/AuthBanner";

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [validSession, setValidSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    // Supabase emits PASSWORD_RECOVERY event when the user lands here from a recovery email
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        setValidSession(true);
        setReady(true);
      }
    });

    // Also handle the case where session is already restored on load
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setValidSession(true);
      setReady(true);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      setTimeout(() => navigate({ to: "/" }), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh flex items-center justify-center bg-paper p-4 sm:p-8">
      <div className="w-full max-w-sm">
        <div className="text-xs tracking-[0.25em] uppercase text-muted-foreground font-semibold mb-6">
          OCEANCOS // REFIT
        </div>
        <h1 className="text-2xl font-semibold mb-1">Set a new password</h1>
        <p className="text-sm text-muted-foreground mb-4">
          Choose a strong password — at least 12 characters, not a known leaked password.
        </p>

        {ready && validSession && !done && (
          <div className="mb-5">
            <AuthBanner tone="info" title="Password reset in progress">
              You're signed in temporarily via the reset link. Set a new password below to complete
              the reset — afterwards you'll be signed in to your account normally.
            </AuthBanner>
          </div>
        )}

        {!ready ? (
          <div className="text-sm text-muted-foreground">Verifying reset link…</div>
        ) : !validSession ? (
          <div className="space-y-4">
            <div className="text-sm bg-danger/10 text-danger border border-danger/20 px-4 py-3 rounded-sm">
              This reset link is invalid or has expired. Request a new one.
            </div>
            <Link
              to="/forgot-password"
              className="block text-center text-xs text-muted-foreground hover:text-ink underline-offset-2 hover:underline"
            >
              Request new link
            </Link>
          </div>
        ) : done ? (
          <div className="text-sm bg-secondary border border-black/10 px-4 py-3 rounded-sm">
            Password updated. Redirecting…
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
                New password
              </label>
              <input
                type="password"
                required
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-input rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
                Confirm password
              </label>
              <input
                type="password"
                required
                minLength={12}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-input rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            {error && (
              <div className="text-xs text-danger bg-danger/10 px-3 py-2 rounded-sm">{error}</div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="w-full bg-navy text-white py-2.5 rounded-sm text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Updating..." : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
