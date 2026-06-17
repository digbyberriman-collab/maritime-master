import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/modules/refit/lib/auth";

export type AccessProbe = {
  table: string;
  label: string;
  expected: "allow" | "deny";
  actual: "allow" | "deny" | "error";
  ok: boolean;
  rows: number | null;
  error?: string;
  rlsBlocked?: boolean;
};

export type AccessCheckResult = {
  ranAt: string;
  userId: string | null;
  role: AppRole | null;
  probes: AccessProbe[];
  problems: AccessProbe[];
  ok: boolean;
};

// Tables every authenticated non-supplier role should be able to read.
const CORE_TABLES = [
  "vessels",
  "profiles",
  "user_roles",
  "works_orders",
  "snags",
  "rfis",
  "documents",
  "drawings",
  "milestones",
  "schedule_items",
  "budget_items",
  "crew",
  "certifications",
  "activity_feed",
  "notifications",
] as const;

function expectedForRole(table: string, role: AppRole | null): "allow" | "deny" {
  if (!role) return "deny";
  // Suppliers are scoped — only see their own works_orders/snags/rfis/notifications.
  if (role === "supplier") {
    return ["works_orders", "snags", "rfis", "notifications", "vessels", "profiles", "user_roles"].includes(table)
      ? "allow"
      : "deny";
  }
  // Owner cannot read messages, but we don't probe messages here.
  return "allow";
}

function isRlsError(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const m = (err.message || "").toLowerCase();
  return (
    err.code === "42501" ||
    m.includes("row-level security") ||
    m.includes("permission denied") ||
    m.includes("rls")
  );
}

export async function runAccessCheck(role: AppRole | null): Promise<AccessCheckResult> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;

  const probes: AccessProbe[] = await Promise.all(
    CORE_TABLES.map(async (table): Promise<AccessProbe> => {
      const expected = expectedForRole(table, role);
      try {
        const { data, error, count } = await supabase
          .from(table)
          .select("*", { count: "exact", head: true })
          .limit(1);
        if (error) {
          const blocked = isRlsError(error);
          return {
            table,
            label: table,
            expected,
            actual: blocked ? "deny" : "error",
            ok: blocked && expected === "deny",
            rows: null,
            error: error.message,
            rlsBlocked: blocked,
          };
        }
        const rows = count ?? (Array.isArray(data) ? data.length : 0);
        return {
          table,
          label: table,
          expected,
          actual: "allow",
          ok: expected === "allow",
          rows,
        };
      } catch (e) {
        return {
          table,
          label: table,
          expected,
          actual: "error",
          ok: false,
          rows: null,
          error: (e as Error).message,
        };
      }
    }),
  );

  const problems = probes.filter((p) => !p.ok);
  return {
    ranAt: new Date().toISOString(),
    userId,
    role,
    probes,
    problems,
    ok: problems.length === 0,
  };
}

const STORAGE_KEY = "oceancos.lastAccessCheck";

export function saveAccessCheck(result: AccessCheckResult) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
  } catch {
    // ignore quota errors
  }
}

export function loadAccessCheck(): AccessCheckResult | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AccessCheckResult) : null;
  } catch {
    return null;
  }
}
