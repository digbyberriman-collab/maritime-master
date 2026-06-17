import { SimpleModulePage } from "@/modules/refit/components/SimpleModule";
import { StatusBadge, fmtDate, fmtMoney } from "@/modules/refit/components/ui-kit";
import type { Contractor } from "@/modules/refit/lib/db";

export default function Page() {
  return (

    <SimpleModulePage<Contractor>
      config={{
        table: "contractors",
        title: "Contractors & Suppliers",
        subtitle: "Companies engaged across the project — contracts, insurance, scope",
        vesselScoped: false,
        createPermission: "contractor.manage",
        defaultStatus: "prospect",
        initialOrder: { column: "name", ascending: true },
        columns: [
          {
            key: "name",
            label: "Name",
            width: "1fr",
            render: (r) => <span className="text-sm font-medium">{r.name}</span>,
          },
          {
            key: "trade",
            label: "Trade",
            width: "200px",
            render: (r) => <span className="text-xs text-muted-foreground">{r.trade ?? "—"}</span>,
          },
          {
            key: "status",
            label: "Status",
            width: "130px",
            render: (r) => <StatusBadge value={r.status} />,
          },
          {
            key: "contract_value",
            label: "Contract",
            width: "150px",
            render: (r) => (
              <span className="text-sm tabular-nums">{fmtMoney(r.contract_value)}</span>
            ),
          },
          {
            key: "insurance",
            label: "Insurance exp.",
            width: "150px",
            render: (r) => (
              <span className="text-xs text-muted-foreground">
                {fmtDate(r.insurance_expires_at)}
              </span>
            ),
          },
        ],
        fields: [
          { name: "name", label: "Company name", type: "text", required: true },
          { name: "trade", label: "Trade / scope category", type: "text" },
          { name: "scope", label: "Scope of work", type: "textarea" },
          { name: "contact_name", label: "Contact name", type: "text" },
          { name: "contact_email", label: "Contact email", type: "text" },
          { name: "contact_phone", label: "Contact phone", type: "text" },
          { name: "contract_value", label: "Contract value (USD)", type: "number" },
          { name: "insurance_expires_at", label: "Insurance expires", type: "date" },
          {
            name: "status",
            label: "Status",
            type: "select",
            default: "prospect",
            options: ["prospect", "approved", "active", "suspended", "terminated"],
          },
          { name: "notes", label: "Notes", type: "textarea" },
        ],
      }}
    />
  );
}
