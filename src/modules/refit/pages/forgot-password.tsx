import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset email");
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
        <h1 className="text-2xl font-semibold mb-1">Reset your password</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Enter your account email. We'll send you a secure link to set a new password.
        </p>
        {sent ? (
          <div className="space-y-4">
            <div className="text-sm bg-secondary border border-black/10 px-4 py-3 rounded-sm">
              If an account exists for <span className="font-mono">{email}</span>, a reset link has
              been sent. Check your inbox (and spam folder).
            </div>
            <Link
              to="/auth"
              search={{ notice: "reset_sent" as const, email }}
              className="block text-center text-xs text-muted-foreground hover:text-ink underline-offset-2 hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1.5">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
              {busy ? "Sending..." : "Send reset link"}
            </button>
            <Link
              to="/auth"
              className="block text-center text-xs text-muted-foreground hover:text-ink underline-offset-2 hover:underline"
            >
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
