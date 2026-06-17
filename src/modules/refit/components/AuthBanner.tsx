import type { ReactNode } from "react";
import type { AppRole } from "@/modules/refit/lib/auth";

type Tone = "info" | "warning" | "success" | "danger";

const TONE: Record<Tone, { wrap: string; dot: string; title: string }> = {
  info: {
    wrap: "border-ocean/30 bg-ocean/5 text-slate-deep",
    dot: "bg-ocean",
    title: "text-ocean",
  },
  warning: {
    wrap: "border-warning/40 bg-warning/10 text-slate-deep",
    dot: "bg-warning",
    title: "text-warning",
  },
  success: {
    wrap: "border-success/40 bg-success/10 text-slate-deep",
    dot: "bg-success",
    title: "text-success",
  },
  danger: {
    wrap: "border-danger/40 bg-danger/10 text-slate-deep",
    dot: "bg-danger",
    title: "text-danger",
  },
};

export function AuthBanner({
  tone = "info",
  title,
  children,
  action,
}: {
  tone?: Tone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const t = TONE[tone];
  return (
    <div
      className={`border ${t.wrap} rounded-sm px-3 py-3 text-xs space-y-2`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <span className={`size-1.5 rounded-full ${t.dot}`} aria-hidden />
        <span className={`uppercase tracking-wider font-semibold ${t.title}`}>{title}</span>
      </div>
      {children && <div className="text-[12px] leading-relaxed">{children}</div>}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

// Role-tailored copy for the "confirm your email" banner. Owners and managers
// get a fleet-context message; suppliers get scope-of-access context.
export function emailConfirmCopy(role: AppRole | null): { title: string; body: string } {
  switch (role) {
    case "owner":
      return {
        title: "Confirm your email to access your fleet",
        body: "We sent a confirmation link to your inbox. Open it to unlock owner-level visibility across all OceancOS projects.",
      };
    case "captain":
      return {
        title: "Confirm your email to take command access",
        body: "Click the link we just sent to verify your address. Captain access to the bridge dashboard activates immediately after.",
      };
    case "project_manager":
      return {
        title: "Confirm your email to manage works orders",
        body: "Open the confirmation link in your inbox. Once verified, you'll be able to issue, accept, and close works orders on Y709.",
      };
    case "shore_management":
      return {
        title: "Confirm your email to enter shore management",
        body: "We've emailed a confirmation link. Verifying enables programme oversight, audit logs, and fleet-wide reporting.",
      };
    case "hod":
      return {
        title: "Confirm your email to access your department",
        body: "Verify your address via the link we sent so you can review, action, and sign off on items in your department.",
      };
    case "supplier":
      return {
        title: "Confirm your email to receive assigned works",
        body: "Open the confirmation email to activate your supplier account. You'll only see works orders assigned to your company.",
      };
    default:
      return {
        title: "Confirm your email to continue",
        body: "We've sent a confirmation link to your inbox. Click it to activate your OceancOS account and finish signing in.",
      };
  }
}
