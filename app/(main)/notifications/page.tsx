"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiClient, type Notification } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Bell, CheckCheck } from "lucide-react";

export default function NotificationsPage() {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await apiClient.listNotifications();
      setItems(res.data || []);
    } catch {
      /* leave empty */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const open = (n: Notification) => {
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.notification_id === n.notification_id ? { ...x, read: true } : x)));
      apiClient.markNotificationRead(n.notification_id).catch(() => {});
    }
    if (n.link) router.push(n.link);
  };

  const markAll = () => {
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    apiClient.markAllNotificationsRead().catch(() => {});
  };

  return (
    <div className="container max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-foreground">
          <Bell className="h-7 w-7 text-primary" /> Notifications
        </h1>
        {items.some((n) => !n.read) && (
          <Button variant="outline" size="sm" onClick={markAll}>
            <CheckCheck className="mr-2 h-4 w-4" /> Mark all read
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">You have no notifications yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li
              key={n.notification_id}
              onClick={() => open(n)}
              className={`cursor-pointer rounded-lg border border-border p-4 transition-colors hover:bg-muted ${
                !n.read ? "bg-primary/5" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{n.title}</p>
                  {n.body && <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
