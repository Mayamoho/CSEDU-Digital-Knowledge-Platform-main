"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiClient, type User } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ROLE_DISPLAY_NAMES, type RoleTier } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROLES: RoleTier[] = ["public", "student", "researcher", "librarian", "administrator"];

const roleBadgeVariant: Record<RoleTier, "secondary" | "outline" | "default"> = {
  public: "outline",
  student: "secondary",
  researcher: "secondary",
  librarian: "default",
  administrator: "default",
};

export function UserRoleManager() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.adminListUsers({ per_page: 100 });
      setUsers(res?.data ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load users");
      setUsers([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const changeRole = async (target: User, nextRole: RoleTier) => {
    if (nextRole === target.role_tier) return;
    setSavingId(target.user_id);
    try {
      await apiClient.adminUpdateRole(target.user_id, nextRole);
      setUsers((prev) =>
        prev.map((u) =>
          u.user_id === target.user_id ? { ...u, role_tier: nextRole } : u
        )
      );
      toast.success(
        `${target.name || target.email} is now ${ROLE_DISPLAY_NAMES[nextRole]}. They must log out and back in for it to take effect.`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update role");
    } finally {
      setSavingId(null);
    }
  };

  const filtered = users.filter((u) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      u.email.toLowerCase().includes(q) ||
      (u.name ?? "").toLowerCase().includes(q)
    );
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or email..."
        className="max-w-sm"
      />

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr className="text-left text-muted-foreground">
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Current role</th>
                  <th className="px-4 py-3 font-medium">Change role</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const isSelf = u.user_id === currentUser?.user_id;
                  return (
                    <tr key={u.user_id} className="border-b last:border-0">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">
                          {u.name || "—"}
                          {isSelf && (
                            <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={roleBadgeVariant[u.role_tier] ?? "secondary"}>
                          {ROLE_DISPLAY_NAMES[u.role_tier] ?? u.role_tier}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Select
                          value={u.role_tier}
                          disabled={isSelf || savingId === u.user_id}
                          onValueChange={(v: RoleTier) => changeRole(u, v)}
                        >
                          <SelectTrigger className="w-48">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((role) => (
                              <SelectItem key={role} value={role}>
                                {ROLE_DISPLAY_NAMES[role]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {isSelf && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Can&apos;t change your own role
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                      No users found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
