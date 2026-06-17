import { type ReactNode } from "react";

/**
 * Shim of Ship Shape Command's RequireAuth.
 * STORM's top-level `ProtectedRoute` (applied in `RefitShell` / route wrappers)
 * is the real auth gate, so this just renders children through.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
