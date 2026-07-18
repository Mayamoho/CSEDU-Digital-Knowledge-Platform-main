"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiClient, type RoleRequest } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { ROLE_DISPLAY_NAMES } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Roles a user may request for themselves (must match the API allow-list).
const REQUESTABLE = ["student", "researcher", "librarian"] as const;

const statusVariant: Record<RoleRequest["status"], "secondary" | "default" | "outline"> = {
  pending: "secondary",
  approved: "default",
  rejected: "outline",
};

export function RoleRequestCard() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<RoleRequest[]>([]);
  const [role, setRole] = useState<string>("student");
  const [justification, setJustification] = useState("");
  const [universityId, setUniversityId] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const justOk = justification.trim().length >= 40;
  const idOk = universityId.trim().length > 0;
  const urlOk = /^https?:\/\//.test(evidenceUrl.trim());
  const canSubmit = justOk && idOk && urlOk;

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiClient.listMyRoleRequests();
      setRequests(res?.data ?? []);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const hasPending = requests.some((r) => r.status === "pending");

  const submit = async () => {
    setSubmitting(true);
    try {
      await apiClient.createRoleRequest(role, justification.trim(), universityId.trim(), evidenceUrl.trim());
      toast.success("Request submitted — an administrator will review it.");
      setJustification("");
      setUniversityId("");
      setEvidenceUrl("");
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Request a role upgrade</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            You are currently a{" "}
            <span className="font-medium text-foreground">
              {user ? ROLE_DISPLAY_NAMES[user.role_tier] : "user"}
            </span>
            . New accounts start as Public. If you are a student, researcher or library
            staff member, request the matching role below. An administrator will
            review it and you will be notified of the outcome.
          </p>

          {hasPending ? (
            <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              You already have a pending request. Please wait for an
              administrator to review it.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Desired role</label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger className="w-full max-w-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REQUESTABLE.map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_DISPLAY_NAMES[r as keyof typeof ROLE_DISPLAY_NAMES]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  University / registration ID <span className="text-destructive">*</span>
                </label>
                <Input
                  value={universityId}
                  onChange={(e) => setUniversityId(e.target.value)}
                  placeholder="e.g. CSE registration/roll or staff ID at University of Dhaka"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Evidence link <span className="text-destructive">*</span>
                </label>
                <Input
                  value={evidenceUrl}
                  onChange={(e) => setEvidenceUrl(e.target.value)}
                  placeholder="Public proof: DU/CSE department profile, ORCID, or faculty page (https://...)"
                />
                {evidenceUrl.length > 0 && !urlOk && (
                  <p className="text-xs text-destructive">Must start with http:// or https://</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Justification <span className="text-destructive">*</span>
                </label>
                <Textarea
                  value={justification}
                  onChange={(e) => setJustification(e.target.value)}
                  placeholder="Explain your affiliation with the CSE department, University of Dhaka — your role, batch/session or designation, and why you need this access."
                  rows={4}
                />
                <p className={`text-xs ${justOk ? "text-muted-foreground" : "text-destructive"}`}>
                  {justification.trim().length}/40 characters minimum
                </p>
              </div>

              <p className="text-xs text-muted-foreground">
                Requests are manually verified against your ID and evidence link before any
                elevated access is granted. False information will be rejected.
              </p>

              <Button onClick={submit} disabled={submitting || !canSubmit}>
                {submitting ? "Submitting..." : "Submit request"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your requests</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner className="h-6 w-6" />
            </div>
          ) : requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No requests yet.</p>
          ) : (
            <ul className="space-y-3">
              {requests.map((r) => (
                <li
                  key={r.request_id}
                  className="flex items-start justify-between gap-4 rounded-md border p-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {ROLE_DISPLAY_NAMES[r.requested_role as keyof typeof ROLE_DISPLAY_NAMES] ??
                        r.requested_role}
                    </p>
                    {r.justification && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{r.justification}</p>
                    )}
                    {r.decision_notes && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Admin note: {r.decision_notes}
                      </p>
                    )}
                  </div>
                  <Badge variant={statusVariant[r.status]}>{r.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
