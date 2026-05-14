import type { Metadata } from "next";
import { AuthGuard } from "@/components/auth/auth-guard";
import { RoleGate } from "@/components/auth/role-gate";
import { UploadForm } from "@/components/upload/upload-form";

export const metadata: Metadata = {
  title: "Upload Archive Materials",
  description: "Upload historical documents and archival materials to the CSEDU Digital Knowledge Platform.",
};

export default function UploadArchivePage() {
  return (
    <AuthGuard requireAuth allowedRoles={['student', 'researcher', 'librarian', 'administrator']}>
      <div className="container max-w-4xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Upload Archive Materials
          </h1>
          <p className="mt-2 text-muted-foreground">
            Contribute historical documents, departmental records, and archival materials.
          </p>
        </div>

        <UploadForm 
          defaultAccessTier="staff"
          allowedFormats={['pdf', 'docx', 'doc', 'jpg', 'png']}
          title="Upload Archive Materials"
          description="Upload historical documents, departmental records, and archival materials."
          itemType="archive"
        />
      </div>
    </AuthGuard>
  );
}
