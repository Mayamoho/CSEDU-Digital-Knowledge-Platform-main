"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiClient, type RoleRequest } from "@/lib/api";
import { ROLE_DISPLAY_NAMES } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

const TABS: RoleRequest["status"][] = ["pending", "approved", "rejected"];

export function RoleRequestQueue() {
  const [tab, setTab] = useState<RoleRequest["status"]>("pending");
  const [requests, setRequests] = useState<RoleRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async (status: RoleRequest["status"]) => {
    setLoading(true);
    try {
      const res = await apiClient.adminListRoleRequests(status);
      setRequests(res?.data ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load requests");
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(tab);
  }, [tab]);

  const decide = async (r: RoleRequest, approve: boolean) => {
    const notes = approve
      ? ""
      : window.prompt("Optional note to the applicant (reason for declining):") ?? "";
    setBusyId(r.request_id);
    try {
      await apiClient.adminDecideRoleRequest(r.request_id, approve, notes);
      toast.success(
        approve
          ? `${r.name ?? "User"} is now ${ROLE_DISPLAY_NAMES[r.requested_role as keyof typeof ROLE_DISPLAY_NAMES]}.`
          : "Request declined."
      );
      setRequests((prev) => prev.filter((x) => x.request_id !== r.request_id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update request");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {TABS.map((t) => (
          <Button
            key={t}
            variant={tab === t ? "default" : "outline"}
            size="sm"
            onClick={() => setTab(t)}
            className="capitalize"
          >
            {t}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner className="h-8 w-8" />
        </div>
      ) : requests.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No {tab} requests.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <Card key={r.request_id}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{r.name || r.email}</span>
                    <span className="text-xs text-muted-foreground">{r.email}</span>
                    <Badge variant="outline" className="text-xs">
                      now: {r.current_role}
                    </Badge>
                    <Badge className="text-xs">
                      wants:{" "}
                      {ROLE_DISPLAY_NAMES[r.requested_role as keyof typeof ROLE_DISPLAY_NAMES] ??
                        r.requested_role}
                    </Badge>
                  </div>
                  {r.justification && (
                    <p className="text-sm text-muted-foreground">{r.justification}</p>
                  )}
                  {r.decision_notes && (
                    <p className="text-xs text-muted-foreground">Note: {r.decision_notes}</p>
                  )}
                </div>
                {tab === "pending" && (
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      disabled={busyId === r.request_id}
                      onClick={() => decide(r, true)}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === r.request_id}
                      onClick={() => decide(r, false)}
                    >
                      Decline
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
