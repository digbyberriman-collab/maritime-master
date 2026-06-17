import { SimpleModulePage } from "@/modules/refit/components/SimpleModule";
import { StatusBadge, fmtDate, fmtMoney } from "@/modules/refit/components/ui-kit";
import type { PurchaseOrder } from "@/modules/refit/lib/db";

export default function Page() {
  return (

    <SimpleModulePage<PurchaseOrder>
      config={{
        table: "purchase_orders",
        title: "Purchase Orders",
        subtitle: "Procurement commitments — submit, approve, track receipt",
        vesselScoped: true,
        referencePrefix: "PO",
        createPermission: "po.create",
        defaultStatus: "draft",
        initialOrder: { column: "created_at", ascending: false },
        columns: [
          {
            key: "ref",
            label: "Reference",
            width: "130px",
            render: (r) => <span className="font-mono text-xs">{r.reference}</span>,
          },
          {
            key: "title",
            label: "Title",
            width: "1fr",
            render: (r) => <span className="text-sm">{r.title}</span>,
          },
          {
            key: "amount",
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
            key: "req",
            label: "Required by",
            width: "130px",
            render: (r) => (
              <span className="text-xs text-muted-foreground">{fmtDate(r.required_by)}</span>
            ),
          },
        ],
        fields: [
          { name: "title", label: "Title", type: "text", required: true },
          { name: "description", label: "Description", type: "textarea" },
          { name: "amount", label: "Amount", type: "number", required: true, default: "0" },
          { name: "currency", label: "Currency", type: "text", default: "USD" },
          { name: "required_by", label: "Required by", type: "date" },
          {
            name: "status",
            label: "Status",
            type: "select",
            default: "draft",
            options: [
              "draft",
              "submitted",
              "approved",
              "rejected",
              "sent",
              "received",
              "closed",
              "cancelled",
            ],
          },
        ],
      }}
    />
  );
}
