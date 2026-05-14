import type { Metadata } from "next";
import { AuthGuard } from "@/components/auth/auth-guard";
import { RoleGate } from "@/components/auth/role-gate";
import { MyUploadsContent } from "@/components/uploads/my-uploads-content";

export const metadata: Metadata = {
  title: "My Uploads",
  description: "Manage your uploaded documents and media files.",
};

export default function MyUploadsPage() {
  return (
    <AuthGuard requireAuth>
      <RoleGate allowedRoles={['student', 'researcher', 'librarian', 'administrator']}>
        <div className="container max-w-6xl px-4 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              My Uploads
            </h1>
            <p className="mt-2 text-muted-foreground">
              Manage your uploaded documents, track review status, and update metadata.
            </p>
          </div>

          <MyUploadsContent />
        </div>
      </RoleGate>
    </AuthGuard>
  );
}
