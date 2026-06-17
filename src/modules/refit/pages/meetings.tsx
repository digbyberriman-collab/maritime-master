import { SimpleModulePage } from "@/modules/refit/components/SimpleModule";
import { fmtDateTime } from "@/modules/refit/components/ui-kit";
import type { Meeting } from "@/modules/refit/lib/db";

export default function Page() {
  return (

    <SimpleModulePage<Meeting>
      config={{
        table: "meetings",
        title: "Meetings",
        subtitle: "Coordination meetings with linked actions and minutes",
        vesselScoped: true,
        createPermission: "meeting.manage",
        initialOrder: { column: "scheduled_at", ascending: false },
        columns: [
          {
            key: "title",
            label: "Title",
            width: "1fr",
            render: (r) => <span className="text-sm font-medium">{r.title}</span>,
          },
          {
            key: "kind",
            label: "Type",
            width: "180px",
            render: (r) => (
              <span className="text-[10px] uppercase tracking-wider text-ocean">
                {r.kind.replace(/_/g, " ")}
              </span>
            ),
          },
          {
            key: "when",
            label: "When",
            width: "200px",
            render: (r) => (
              <span className="text-xs text-muted-foreground tabular-nums">
                {fmtDateTime(r.scheduled_at)}
              </span>
            ),
          },
          {
            key: "loc",
            label: "Location",
            width: "200px",
            render: (r) => (
              <span className="text-xs text-muted-foreground">{r.location ?? "—"}</span>
            ),
          },
        ],
        fields: [
          { name: "title", label: "Title", type: "text", required: true },
          {
            name: "kind",
            label: "Meeting type",
            type: "select",
            default: "other",
            options: [
              "owner_team",
              "yard_progress",
              "technical",
              "interior",
              "class_flag",
              "finance",
              "hod",
              "contractor",
              "other",
            ],
          },
          { name: "scheduled_at", label: "When", type: "datetime-local" },
          { name: "location", label: "Location", type: "text" },
          {
            name: "attendees",
            label: "Attendees",
            type: "textarea",
            hint: "Comma-separated names or roles",
          },
          { name: "agenda", label: "Agenda", type: "textarea" },
          { name: "minutes", label: "Minutes / notes", type: "textarea" },
        ],
      }}
    />
  );
}
