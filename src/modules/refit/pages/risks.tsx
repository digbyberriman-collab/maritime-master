import { SimpleModulePage } from "@/modules/refit/components/SimpleModule";
import { StatusBadge, fmtDate, fmtMoney } from "@/modules/refit/components/ui-kit";
import type { Risk } from "@/modules/refit/lib/db";

const CATEGORIES = ["safety", "cost", "schedule", "technical", "compliance", "commercial"];

export default function Page() {
  return (

    <SimpleModulePage<Risk>
      config={{
        table: "rf_risks",
        title: "Risk Register",
        subtitle: "Project risks scored on likelihood × impact, with mitigation and ownership",
        vesselScoped: true,
        createPermission: "risk.manage",
        defaultStatus: "open",
        initialOrder: { column: "rating", ascending: false },
        columns: [
          {
            key: "title",
            label: "Risk",
            width: "1fr",
            render: (r) => <span className="text-sm font-medium">{r.title}</span>,
          },
          {
            key: "cat",
            label: "Category",
            width: "140px",
            render: (r) => (
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {r.category ?? "—"}
              </span>
            ),
          },
          {
            key: "rating",
            label: "Rating",
            width: "80px",
            render: (r) => (
              <span
                className={`px-1.5 py-0.5 text-[10px] font-bold rounded-sm ${(r.rating ?? 0) >= 15 ? "bg-danger/10 text-danger" : (r.rating ?? 0) >= 8 ? "bg-warning/10 text-warning" : "bg-slate-100 text-slate-700"}`}
              >
                R{r.rating ?? 0}
              </span>
            ),
          },
          {
            key: "status",
            label: "Status",
            width: "120px",
            render: (r) => <StatusBadge value={r.status} />,
          },
          {
            key: "due",
            label: "Due",
            width: "120px",
            render: (r) => (
              <span className="text-xs text-muted-foreground">{fmtDate(r.due_date)}</span>
            ),
          },
          {
            key: "cost",
            label: "Cost impact",
            width: "140px",
            render: (r) => <span className="text-sm tabular-nums">{fmtMoney(r.cost_impact)}</span>,
          },
        ],
        fields: [
          { name: "title", label: "Risk title", type: "text", required: true },
          { name: "description", label: "Description", type: "textarea" },
          { name: "category", label: "Category", type: "select", options: CATEGORIES },
          { name: "likelihood", label: "Likelihood (1–5)", type: "number" },
          { name: "impact", label: "Impact (1–5)", type: "number" },
          { name: "mitigation", label: "Mitigation plan", type: "textarea" },
          { name: "due_date", label: "Mitigation due", type: "date" },
          {
            name: "status",
            label: "Status",
            type: "select",
            default: "open",
            options: ["open", "mitigating", "accepted", "closed"],
          },
          { name: "cost_impact", label: "Cost impact (USD)", type: "number" },
          { name: "schedule_impact_days", label: "Schedule impact (days)", type: "number" },
          { name: "safety_impact", label: "Safety impact", type: "text" },
        ],
      }}
    />
  );
}
