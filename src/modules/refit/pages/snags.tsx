import { useEffect, useState } from "react";
import { supabase as supabaseClient } from "@/integrations/supabase/client";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase: any = supabaseClient;
import { useAuth } from "@/modules/refit/lib/auth";
import { AppShell, PageHeader } from "@/modules/refit/components/AppShell";
import { RequireAuth } from "@/modules/refit/components/RequireAuth";

const SEV: Record<string, string> = {
  critical: "bg-danger/10 text-danger",
  major: "bg-warning/10 text-warning",
  minor: "bg-success/10 text-success",
};

export default function SnagsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<
    Array<{
      id: string;
      reference: string;
      title: string;
      severity: string;
      category: string;
      status: string | null;
      location: string | null;
    }>
  >([]);

  // Auth + email-confirmation guard handled by <RequireAuth> wrapper.
  useEffect(() => {
    if (!user) return;
    supabase
      .from("rf_snags" as any)
      .select("id, reference, title, severity, category, status, location")
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

  return (
    <AppShell>
      <div className="p-4 sm:p-6 md:p-8 w-full max-w-[1600px] mx-auto">
        <PageHeader
          title="Snags & Warranty"
          subtitle={`${rows.length} active snags on Y709`}
          action={
            <button className="px-3 py-2 bg-navy text-white rounded-sm text-sm">
              + Raise snag
            </button>
          }
        />
        <div className="bg-card border border-black/5 rounded-sm shadow-sm overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-secondary/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left p-3 font-medium">Ref</th>
                <th className="text-left p-3 font-medium">Title</th>
                <th className="text-left p-3 font-medium">Severity</th>
                <th className="text-left p-3 font-medium">Category</th>
                <th className="text-left p-3 font-medium">Location</th>
                <th className="text-left p-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-black/5 hover:bg-secondary/30">
                  <td className="p-3 font-mono text-xs">{r.reference}</td>
                  <td className="p-3">{r.title}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 text-[10px] font-bold rounded-sm uppercase ${SEV[r.severity]}`}
                    >
                      {r.severity}
                    </span>
                  </td>
                  <td className="p-3 text-muted-foreground capitalize">
                    {r.category.replace("_", " ")}
                  </td>
                  <td className="p-3 text-muted-foreground">{r.location}</td>
                  <td className="p-3 capitalize">{r.status?.replace("_", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
