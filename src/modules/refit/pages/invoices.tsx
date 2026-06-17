import { SimpleModulePage } from "@/modules/refit/components/SimpleModule";
import { StatusBadge, fmtDate, fmtMoney } from "@/modules/refit/components/ui-kit";
import type { Invoice } from "@/modules/refit/lib/db";

export default function Page() {
  return (

    <SimpleModulePage<Invoice>
      config={{
        table: "rf_invoices",
        title: "Invoices",
        subtitle: "Supplier invoices — track received, approved, disputed and paid",
        vesselScoped: true,
        createPermission: "invoice.manage",
        defaultStatus: "received",
        initialOrder: { column: "received_at", ascending: false },
        columns: [
          {
            key: "ref",
            label: "Reference",
            width: "150px",
            render: (r) => <span className="font-mono text-xs">{r.reference}</span>,
          },
          {
            key: "amt",
            label: "Amount",
            width: "150px",
            render: (r) => (
              <span className="text-sm tabular-nums">{fmtMoney(r.amount, r.currency)}</span>
            ),
          },
          {
            key: "status",
            label: "Status",
            width: "120px",
            render: (r) => <StatusBadge value={r.status} />,
          },
          {
            key: "rec",
            label: "Received",
            width: "130px",
            render: (r) => (
              <span className="text-xs text-muted-foreground">{fmtDate(r.received_at)}</span>
            ),
          },
          {
            key: "due",
            label: "Due",
            width: "130px",
            render: (r) => (
              <span className="text-xs text-muted-foreground">{fmtDate(r.due_date)}</span>
            ),
          },
          {
            key: "paid",
            label: "Paid",
            width: "130px",
            render: (r) => (
              <span className="text-xs text-muted-foreground">{fmtDate(r.paid_at)}</span>
            ),
          },
        ],
        fields: [
          { name: "reference", label: "Invoice number", type: "text", required: true },
          { name: "amount", label: "Amount", type: "number", required: true, default: "0" },
          { name: "currency", label: "Currency", type: "text", default: "USD" },
          { name: "received_at", label: "Received", type: "date" },
          { name: "due_date", label: "Due date", type: "date" },
          {
            name: "status",
            label: "Status",
            type: "select",
            default: "received",
            options: ["received", "approved", "disputed", "paid", "cancelled"],
          },
          { name: "notes", label: "Notes", type: "textarea" },
        ],
      }}
    />
  );
}
