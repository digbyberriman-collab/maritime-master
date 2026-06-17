import { supabase } from "@/integrations/supabase/client";

export type AuthFailureReason =
  | "no_account"
  | "bad_password"
  | "unconfirmed_email"
  | "rate_limited"
  | "weak_password"
  | "user_already_registered"
  | "network_error"
  | "unknown";

const REASON_LABELS: Record<AuthFailureReason, string> = {
  no_account: "No account exists for this email",
  bad_password: "Password did not match the account",
  unconfirmed_email: "Email address has not been confirmed",
  rate_limited: "Too many attempts — temporarily blocked",
  weak_password: "Password rejected by policy (length / leaked-password check)",
  user_already_registered: "Sign-up attempted on an existing account",
  network_error: "Could not reach the authentication service",
  unknown: "Unclassified authentication failure",
};

// Mask the local-part of an email so we never store the full address.
// e.g. "captain.smith@storm.app" -> "c***h@storm.app"
function maskEmail(email: string): { masked: string; domain: string } {
  const [local, domain = ""] = email.split("@");
  if (!local) return { masked: "***", domain };
  if (local.length <= 2) return { masked: `${local[0]}***@${domain}`, domain };
  const masked = `${local[0]}***${local[local.length - 1]}@${domain}`;
  return { masked, domain };
}

// One-way client fingerprint: hash of UA + screen — never the IP, never identifying.
async function clientFingerprint(): Promise<string> {
  if (typeof window === "undefined") return "ssr";
  const raw = `${navigator.userAgent}|${screen.width}x${screen.height}|${navigator.language}`;
  const buf = new TextEncoder().encode(raw);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function userAgentFamily(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "Edge";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua)) return "Safari";
  return "Other";
}

// Classify a Supabase AuthError-ish object into a redacted reason code.
export function classifyAuthError(err: unknown): AuthFailureReason {
  if (!err) return "unknown";
  const e = err as { message?: string; code?: string; status?: number };
  const msg = (e.message ?? "").toLowerCase();
  const code = (e.code ?? "").toLowerCase();
  if (code === "invalid_credentials" || msg.includes("invalid login")) return "bad_password";
  if (msg.includes("email not confirmed")) return "unconfirmed_email";
  if (msg.includes("already registered") || msg.includes("already exists"))
    return "user_already_registered";
  if (msg.includes("rate limit") || e.status === 429) return "rate_limited";
  if (
    msg.includes("password") &&
    (msg.includes("weak") || msg.includes("leaked") || msg.includes("short"))
  )
    return "weak_password";
  if (msg.includes("fetch") || msg.includes("network")) return "network_error";
  return "unknown";
}

export async function logAuthFailure(opts: {
  reason: AuthFailureReason;
  email?: string;
  context?: string; // e.g. "signin", "signup", "verify"
}) {
  try {
    const { masked, domain } = opts.email ? maskEmail(opts.email) : { masked: null, domain: null };
    const client_hash = await clientFingerprint();
    await supabase.from("rf_auth_diagnostics" as any).insert({
      reason_code: opts.reason,
      reason_label: REASON_LABELS[opts.reason],
      email_masked: masked,
      email_domain: domain,
      client_hash,
      user_agent_family: userAgentFamily(),
      context: opts.context ?? null,
    });
  } catch {
    // Diagnostics must never break the auth flow.
  }
}

export { REASON_LABELS };
