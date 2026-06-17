import { useEffect, useState } from "react";
import { AppShell, PageHeader } from "@/modules/refit/components/AppShell";
import { RequireAuth } from "@/modules/refit/components/RequireAuth";
import { useAuth } from "@/modules/refit/lib/auth";
import { db, type Notification } from "@/modules/refit/lib/db";
import {
  ListShell,
  EmptyState,
  ErrorBlock,
  fmtDateTime,
  GhostBtn,
  PriorityBadge,
} from "@/modules/refit/components/ui-kit";

export default function NotificationsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<"all" | "unread">("unread");
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    let q = db
      .from("rf_notifications" as any)
      .select("*")
      .eq("recipient_id", user.id)
      .order("created_at", { ascending: false });
    if (filter === "unread") q = q.eq("read", false);
    const { data, error } = await q;
    if (error) setError(error.message);
    setItems((data as unknown as Notification[]) ?? []);
  };

  useEffect(() => {
    load();
  }, [user, filter]);

  const markRead = async (id: string) => {
    await db.from("rf_notifications" as any).update({ read: true }).eq("id", id);
    load();
  };
  const markAllRead = async () => {
    if (!user) return;
    await db
      .from("rf_notifications" as any)
      .update({ read: true })
      .eq("recipient_id", user.id)
      .eq("read", false);
    load();
  };

  return (
    <AppShell>
      <div className="p-4 sm:p-6 md:p-8 w-full max-w-[1200px] mx-auto">
        <PageHeader
          title="Notifications"
          subtitle="Approval requests, status changes, comments and overdue items relevant to you"
          action={<GhostBtn onClick={markAllRead}>Mark all read</GhostBtn>}
        />

        <div className="mb-4 flex gap-2">
          {(["unread", "all"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs rounded-sm border ${filter === f ? "bg-navy text-white border-navy" : "bg-white border-black/10 hover:bg-secondary"}`}
            >
              {f}
            </button>
          ))}
        </div>

        {error && <ErrorBlock message={error} />}

        <ListShell>
          {items.length === 0 ? (
            <EmptyState
              title={filter === "unread" ? "Inbox zero" : "No notifications"}
              hint={
                filter === "unread"
                  ? "All caught up."
                  : "Notifications will appear here when relevant."
              }
            />
          ) : (
            items.map((n) => (
              <div
                key={n.id}
                className={`px-4 py-3 border-b border-black/5 ${n.read ? "bg-card" : "bg-paper"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] uppercase tracking-wider text-ocean font-medium">
                        {n.notification_type}
                      </span>
                      {n.priority && <PriorityBadge value={n.priority} />}
                      {!n.read && <span className="size-1.5 rounded-full bg-ocean" />}
                    </div>
                    <div className="text-sm font-medium">{n.title}</div>
                    {n.body && <div className="text-xs text-muted-foreground mt-1">{n.body}</div>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {fmtDateTime(n.created_at)}
                    </span>
                    {!n.read && (
                      <button
                        onClick={() => markRead(n.id)}
                        className="text-[11px] text-ocean hover:underline"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </ListShell>
      </div>
    </AppShell>
  );
}
