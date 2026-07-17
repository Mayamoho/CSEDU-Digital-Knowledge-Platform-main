import type { Metadata } from "next";
import { AuthGuard } from "@/components/auth/auth-guard";
import { RoleRequestCard } from "@/components/account/role-request-card";

export const metadata: Metadata = {
  title: "Request Role Upgrade",
  description: "Ask an administrator to raise your account role.",
};

export default function RoleRequestPage() {
  return (
    <AuthGuard requireAuth>
      <div className="container max-w-3xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Request Role Upgrade
          </h1>
          <p className="mt-2 text-muted-foreground">
            Accounts start as Student. Request Researcher or Librarian access here.
          </p>
        </div>
        <RoleRequestCard />
      </div>
    </AuthGuard>
  );
}
