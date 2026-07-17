import type { Metadata } from "next";
import { AuthGuard } from "@/components/auth/auth-guard";
import { RoleGate } from "@/components/auth/role-gate";
import { RoleRequestQueue } from "@/components/admin/role-request-queue";

export const metadata: Metadata = {
  title: "Role Requests",
  description: "Review and decide user role-upgrade requests.",
};

export default function AdminRoleRequestsPage() {
  return (
    <AuthGuard requireAuth>
      <RoleGate allowedRoles={["administrator"]}>
        <div className="container max-w-5xl px-4 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Role Requests
            </h1>
            <p className="mt-2 text-muted-foreground">
              Approve or decline requests from users asking to become Researcher
              or Librarian. Approval applies the role immediately.
            </p>
          </div>
          <RoleRequestQueue />
        </div>
      </RoleGate>
    </AuthGuard>
  );
}
