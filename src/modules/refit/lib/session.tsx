import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { classifyAuthError, logAuthFailure } from "@/modules/refit/lib/diagnostics";

type Status = "loading" | "authenticated" | "unauthenticated" | "expired";

interface SessionContextValue {
  status: Status;
  session: Session | null;
  // Open the in-place re-auth modal, preserving current URL.
  promptReauth: (reason?: string) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [reauthOpen, setReauthOpen] = useState(false);
  const [reauthReason, setReauthReason] = useState<string | null>(null);
  // Track whether the user has been authenticated this tab so we can
  // distinguish "never signed in" (→ /auth) from "session expired"
  // (→ in-place re-auth).
  const wasAuthed = useRef(false);
  const lastEmail = useRef<string | null>(null);

  useEffect(() => {
    let resolved = false;
    const settle = (s: Session | null) => {
      resolved = true;
      setSession(s);
      if (s) {
        wasAuthed.current = true;
        lastEmail.current = s.user.email ?? lastEmail.current;
        setStatus("authenticated");
      } else {
        setStatus("unauthenticated");
      }
    };

    // Subscribe FIRST, then read the current session — order matters per Supabase docs.
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (s) lastEmail.current = s.user.email ?? lastEmail.current;

      // INITIAL_SESSION fires once on subscription with the restored session
      // (or null). Treat it as the authoritative first answer so we never get
      // stuck on "Verifying session…" if getSession() is slow or hangs.
      if (event === "INITIAL_SESSION") {
        settle(s);
        return;
      }

      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        wasAuthed.current = true;
        resolved = true;
        setStatus("authenticated");
        setReauthOpen(false);
        setReauthReason(null);
      } else if (event === "SIGNED_OUT") {
        resolved = true;
        if (wasAuthed.current) {
          setStatus("expired");
          setReauthReason("Your session has expired. Sign in to continue.");
          setReauthOpen(true);
        } else {
          setStatus("unauthenticated");
        }
      }
    });

    // Belt-and-braces: explicitly read the persisted session too. If it errors
    // or returns null, fall back to unauthenticated rather than hanging.
    supabase.auth
      .getSession()
      .then(({ data: { session: s } }) => {
        if (resolved) return;
        settle(s);
      })
      .catch((err) => {
        console.error("[session] getSession failed", err);
        if (!resolved) settle(null);
      });

    // Hard safety net — if neither path settles within 4s (e.g. flaky network,
    // blocked storage), don't trap the user on the loading screen.
    const safetyTimer = window.setTimeout(() => {
      if (!resolved) {
        console.warn("[session] timed out waiting for session — assuming unauthenticated");
        settle(null);
      }
    }, 4000);

    // Re-validate when the tab becomes visible again — covers laptop sleep / long idle.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      supabase.auth.getSession().then(({ data: { session: s }, error }) => {
        if (error || (!s && wasAuthed.current)) {
          setStatus("expired");
          setReauthReason("Your session expired while you were away.");
          setReauthOpen(true);
        }
      });
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      sub.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      window.clearTimeout(safetyTimer);
    };
  }, []);


  const promptReauth = (reason?: string) => {
    setReauthReason(reason ?? "Please confirm your password to continue.");
    setReauthOpen(true);
  };

  return (
    <SessionContext.Provider value={{ status, session, promptReauth }}>
      {children}
      {reauthOpen && (
        <ReauthModal
          email={lastEmail.current}
          reason={reauthReason}
          onCancel={() => setReauthOpen(false)}
          onSuccess={() => {
            setReauthOpen(false);
            setReauthReason(null);
          }}
        />
      )}
    </SessionContext.Provider>
  );
}

function ReauthModal({
  email: initialEmail,
  reason,
  onCancel,
  onSuccess,
}: {
  email: string | null;
  reason: string | null;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      await logAuthFailure({ reason: classifyAuthError(error), email, context: "reauth" });
      setErr(error.message);
      return;
    }
    onSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-paper border border-black/10 rounded-sm shadow-xl w-full max-w-sm p-6">
        <div className="text-xs tracking-[0.25em] uppercase text-ocean font-semibold mb-2">
          OCEANCOS // RE-AUTH
        </div>
        <h2 className="text-lg font-semibold mb-1">Continue your session</h2>
        <p className="text-xs text-muted-foreground mb-5">{reason}</p>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">
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
          <div>
            <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">
              Password
            </label>
            <input
              type="password"
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-input rounded-sm text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          {err && (
            <div className="text-xs text-danger bg-danger/10 px-3 py-2 rounded-sm">{err}</div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={busy}
              className="flex-1 bg-navy text-white py-2 rounded-sm text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Signing in…" : "Continue"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-2 text-xs text-muted-foreground hover:text-ink"
            >
              Sign out
            </button>
          </div>
        </form>
        <p className="text-[11px] text-muted-foreground mt-4">
          You'll return to the same page after signing in — no work is lost.
        </p>
      </div>
    </div>
  );
}
