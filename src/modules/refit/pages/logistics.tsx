import { SimpleModulePage } from "@/modules/refit/components/SimpleModule";
import { StatusBadge, fmtDateTime, fmtMoney } from "@/modules/refit/components/ui-kit";
import type { LogisticsItem } from "@/modules/refit/lib/db";

const KINDS = [
  "crew_travel",
  "contractor_travel",
  "yard_access",
  "delivery",
  "shipment",
  "customs",
  "courier",
  "accommodation",
  "transport",
  "crane",
  "dock",
  "tug",
  "pilot",
  "linesmen",
  "fuel",
  "waste",
  "provisioning",
  "guest",
  "other",
];

export default function Page() {
  return (

    <SimpleModulePage<LogisticsItem>
      config={{
        table: "logistics_items",
        title: "Logistics",
        subtitle: "Crew & contractor travel, deliveries, dock movements, bookings",
        vesselScoped: true,
        createPermission: "logistics.manage",
        defaultStatus: "planned",
        initialOrder: { column: "scheduled_at", ascending: true },
        columns: [
          {
            key: "kind",
            label: "Type",
            width: "150px",
            render: (r) => (
              <span className="text-[10px] uppercase tracking-wider text-ocean">
                {r.kind.replace(/_/g, " ")}
              </span>
            ),
          },
          {
            key: "title",
            label: "Description",
            width: "1fr",
            render: (r) => <span className="text-sm">{r.title}</span>,
          },
          {
            key: "scheduled_at",
            label: "When",
            width: "180px",
            render: (r) => (
              <span className="text-xs text-muted-foreground tabular-nums">
                {fmtDateTime(r.scheduled_at)}
              </span>
            ),
          },
          {
            key: "status",
            label: "Status",
            width: "110px",
            render: (r) => <StatusBadge value={r.status} />,
          },
          {
            key: "cost",
            label: "Cost",
            width: "120px",
            render: (r) => <span className="text-sm tabular-nums">{fmtMoney(r.cost)}</span>,
          },
        ],
        fields: [
          {
            name: "kind",
            label: "Type",
            type: "select",
            required: true,
            options: KINDS,
            default: "delivery",
          },
          { name: "title", label: "Description", type: "text", required: true },
          { name: "details", label: "Details", type: "textarea" },
          { name: "scheduled_at", label: "Scheduled", type: "datetime-local" },
          { name: "cost", label: "Cost (USD)", type: "number" },
          {
            name: "status",
            label: "Status",
            type: "select",
            default: "planned",
            options: ["planned", "booked", "in_transit", "arrived", "completed", "cancelled"],
          },
          { name: "notes", label: "Notes", type: "textarea" },
        ],
      }}
    />
  );
}
