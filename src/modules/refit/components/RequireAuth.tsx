import { useEffect, type ReactNode } from "react";
import { useNavigate, useLocation  } from "react-router-dom";
import { useSession } from "@/modules/refit/lib/session";

/**
 * Single source of truth for protecting a page.
 *
 * Behavior:
 *  - `loading`            → render a neutral skeleton (no flicker of guarded content)
 *  - `unauthenticated`    → redirect to /auth with `notice=session_missing` and a
 *                           `redirect` param so we can return the user here after sign-in
 *  - email is unconfirmed → redirect to /auth with `notice=email_unconfirmed`
 *  - `expired`            → render children; the SessionProvider already shows an in-place
 *                           re-auth modal so the user keeps their place
 *  - `authenticated`      → render children
 *
 * Use it by wrapping the page body, OR via the helper <Protected /> used in route configs.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, session } = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  const emailConfirmed = !!session?.user?.email_confirmed_at || !!session?.user?.confirmed_at;

  useEffect(() => {
    if (status === "loading") return;

    if (status === "unauthenticated") {
      navigate({
        to: "/auth",
        search: {
          notice: "session_missing" as const,
          redirect: location.href,
        },
        replace: true,
      });
      return;
    }

    // Authenticated but email not yet confirmed — bounce to /auth with the
    // role-aware confirmation banner. We sign no one out here; the auth page
    // shows resend + sign-in options.
    if (status === "authenticated" && session && !emailConfirmed) {
      navigate({
        to: "/auth",
        search: {
          notice: "email_unconfirmed" as const,
          email: session.user.email ?? undefined,
          redirect: location.href,
        },
        replace: true,
      });
    }
  }, [status, session, emailConfirmed, navigate, location.href]);

  if (status === "loading") {
    return (
      <div className="min-h-dvh flex items-center justify-center text-sm text-muted-foreground">
        Verifying session…
      </div>
    );
  }

  if (status === "unauthenticated" || (status === "authenticated" && !emailConfirmed)) {
    return (
      <div className="min-h-dvh flex items-center justify-center text-sm text-muted-foreground">
        Redirecting…
      </div>
    );
  }

  // status === "authenticated" with confirmed email, OR "expired" (modal handles re-auth)
  return <>{children}</>;
}
