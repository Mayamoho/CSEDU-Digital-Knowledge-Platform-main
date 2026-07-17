"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { apiClient, type Notification } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// Poll interval for unread notifications (ms). Kept modest — this is a small
// query and the app is low-traffic.
const POLL_MS = 60_000;

export function NotificationBell() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.listNotifications();
      setItems(res?.data ?? []);
      setUnread(res?.unread ?? 0);
    } catch {
      // silent — a failed poll shouldn't disrupt the header
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [isAuthenticated, load]);

  if (!isAuthenticated) return null;

  const openItem = async (n: Notification) => {
    if (!n.read) {
      setItems((prev) =>
        prev.map((x) => (x.notification_id === n.notification_id ? { ...x, read: true } : x))
      );
      setUnread((u) => Math.max(0, u - 1));
      apiClient.markNotificationRead(n.notification_id).catch(() => {});
    }
    if (n.link) router.push(n.link);
  };

  const markAll = async () => {
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    setUnread(0);
    apiClient.markAllNotificationsRead().catch(() => {});
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
          <span className="sr-only">Notifications</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80" align="end" forceMount>
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0">Notifications</DropdownMenuLabel>
          {unread > 0 && (
            <button
              onClick={markAll}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Mark all read
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              No notifications yet.
            </p>
          ) : (
            items.map((n) => (
              <button
                key={n.notification_id}
                onClick={() => openItem(n)}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 border-b px-3 py-2.5 text-left last:border-0 hover:bg-muted",
                  !n.read && "bg-primary/5"
                )}
              >
                <div className="flex w-full items-start gap-2">
                  {!n.read && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{n.title}</p>
                    {n.body && (
                      <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-xs text-muted-foreground">
                        {n.body}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
