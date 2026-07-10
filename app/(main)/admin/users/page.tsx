import type { Metadata } from "next";
import { AuthGuard } from "@/components/auth/auth-guard";
import { RoleGate } from "@/components/auth/role-gate";
import { UserRoleManager } from "@/components/admin/user-role-manager";

export const metadata: Metadata = {
  title: "User Role Management",
  description: "Assign and manage user roles across the platform.",
};

export default function AdminUsersPage() {
  return (
    <AuthGuard requireAuth>
      <RoleGate allowedRoles={["administrator"]}>
        <div className="container max-w-5xl px-4 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              User Role Management
            </h1>
            <p className="mt-2 text-muted-foreground">
              Promote users to Researcher, Librarian, or Administrator. Role
              changes take effect after the user logs out and back in.
            </p>
          </div>

          <UserRoleManager />
        </div>
      </RoleGate>
    </AuthGuard>
  );
}
