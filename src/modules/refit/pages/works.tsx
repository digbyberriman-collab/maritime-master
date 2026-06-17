import { useEffect, useState } from "react";
import { supabase as supabaseClient } from "@/integrations/supabase/client";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase: any = supabaseClient;
import { useAuth } from "@/modules/refit/lib/auth";
import { useSession } from "@/modules/refit/lib/session";
import { AppShell, PageHeader } from "@/modules/refit/components/AppShell";
import { RequireAuth } from "@/modules/refit/components/RequireAuth";

const STATUS_TONE: Record<string, string> = {
  draft: "bg-secondary text-slate-deep",
  quoted: "bg-warning/10 text-warning",
  accepted: "bg-ocean/10 text-ocean",
  in_progress: "bg-ocean/15 text-ocean",
  complete: "bg-success/10 text-success",
  closed: "bg-secondary text-muted-foreground",
};

export default function WorksPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<
    Array<{
      id: string;
      reference: string;
      title: string;
      area: string | null;
      trade: string | null;
      priority: string | null;
      status: string | null;
      quoted_amount: number | null;
      accepted_amount: number | null;
    }>
  >([]);

  // Auth + email-confirmation guard handled by <RequireAuth> wrapper.
  useEffect(() => {
    if (!user) return;
    supabase
      .from("rf_works_orders" as any)
      .select("id, reference, title, area, trade, priority, status, quoted_amount, accepted_amount")
      .order("reference")
      .then(({ data }) => {
        if (data) setRows(data);
      });
  }, [user]);

  if (!user)
    return (
      <div className="min-h-dvh flex items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  const fmt = (n: number | null) => (n ? `$${n.toLocaleString()}` : "—");

  return (
    <AppShell>
      <div className="p-4 sm:p-6 md:p-8 w-full max-w-[1600px] mx-auto">
        <PageHeader
          title="Works Orders"
          subtitle={`${rows.length} works orders on Y709`}
          action={
            <button className="px-3 py-2 bg-navy text-white rounded-sm text-sm">
              + New works order
            </button>
          }
        />
        <div className="bg-card border border-black/5 rounded-sm shadow-sm overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3 font-medium">Ref</th>
                <th className="text-left p-3 font-medium">Title</th>
                <th className="text-left p-3 font-medium">Area</th>
                <th className="text-left p-3 font-medium">Trade</th>
                <th className="text-left p-3 font-medium">Priority</th>
                <th className="text-left p-3 font-medium">Status</th>
                <th className="text-right p-3 font-medium">Quoted</th>
                <th className="text-right p-3 font-medium">Accepted</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-black/5 hover:bg-secondary/30">
                  <td className="p-3 font-mono text-xs">{r.reference}</td>
                  <td className="p-3">{r.title}</td>
                  <td className="p-3 text-muted-foreground">{r.area}</td>
                  <td className="p-3 text-muted-foreground">{r.trade}</td>
                  <td className="p-3 text-xs uppercase tracking-wider text-muted-foreground">
                    {r.priority}
                  </td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 text-[10px] font-bold rounded-sm uppercase ${STATUS_TONE[r.status ?? ""] ?? "bg-secondary"}`}
                    >
                      {r.status?.replace("_", " ")}
                    </span>
                  </td>
                  <td className="p-3 text-right tabular-nums">{fmt(r.quoted_amount)}</td>
                  <td className="p-3 text-right tabular-nums">{fmt(r.accepted_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
