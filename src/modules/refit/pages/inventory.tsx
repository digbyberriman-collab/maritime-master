import { SimpleModulePage } from "@/modules/refit/components/SimpleModule";
import { StatusBadge, fmtDate, fmtMoney } from "@/modules/refit/components/ui-kit";
import type { InventoryItem } from "@/modules/refit/lib/db";

const CATEGORIES = [
  "spare",
  "tool",
  "consumable",
  "equipment",
  "lsa",
  "ffe",
  "av_it",
  "engineering",
  "deck",
  "interior",
  "galley",
  "medical",
  "dive",
];

export default function Page() {
  return (

    <SimpleModulePage<InventoryItem>
      config={{
        table: "inventory_items",
        title: "Inventory & Equipment",
        subtitle: "Spares, equipment, certificates, warranty, reorder levels",
        vesselScoped: true,
        createPermission: "inventory.manage",
        defaultStatus: "in_stock",
        initialOrder: { column: "name", ascending: true },
        columns: [
          {
            key: "name",
            label: "Item",
            width: "1fr",
            render: (r) => <span className="text-sm">{r.name}</span>,
          },
          {
            key: "category",
            label: "Category",
            width: "130px",
            render: (r) => (
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {r.category ?? "—"}
              </span>
            ),
          },
          {
            key: "qty",
            label: "Qty",
            width: "80px",
            render: (r) => (
              <span className="text-sm tabular-nums">
                {r.quantity}
                {r.uom ? ` ${r.uom}` : ""}
              </span>
            ),
          },
          {
            key: "min",
            label: "Min",
            width: "70px",
            render: (r) => (
              <span className="text-xs text-muted-foreground tabular-nums">
                {r.min_quantity ?? "—"}
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
            key: "loc",
            label: "Location",
            width: "150px",
            render: (r) => (
              <span className="text-xs text-muted-foreground">{r.location ?? "—"}</span>
            ),
          },
          {
            key: "warr",
            label: "Warranty",
            width: "120px",
            render: (r) => (
              <span className="text-xs text-muted-foreground">
                {fmtDate(r.warranty_expires_at)}
              </span>
            ),
          },
          {
            key: "rep",
            label: "Replace",
            width: "120px",
            render: (r) => (
              <span className="text-xs tabular-nums">{fmtMoney(r.replacement_cost)}</span>
            ),
          },
        ],
        fields: [
          { name: "name", label: "Item name", type: "text", required: true },
          { name: "category", label: "Category", type: "select", options: CATEGORIES },
          { name: "location", label: "Storage location", type: "text" },
          { name: "quantity", label: "Quantity", type: "number", default: "0" },
          { name: "uom", label: "Unit of measure", type: "text" },
          { name: "min_quantity", label: "Min quantity", type: "number" },
          { name: "manufacturer", label: "Manufacturer", type: "text" },
          { name: "model", label: "Model", type: "text" },
          { name: "serial_number", label: "Serial number", type: "text" },
          { name: "warranty_expires_at", label: "Warranty expires", type: "date" },
          { name: "certificate_number", label: "Certificate number", type: "text" },
          { name: "certificate_expires_at", label: "Certificate expires", type: "date" },
          { name: "replacement_cost", label: "Replacement cost (USD)", type: "number" },
          {
            name: "status",
            label: "Status",
            type: "select",
            default: "in_stock",
            options: ["in_stock", "low_stock", "reorder", "on_order", "out_of_stock", "retired"],
          },
        ],
      }}
    />
  );
}
