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
      <div className="container max-w-6xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Upload Archive Materials
          </h1>
          <p className="mt-2 text-muted-foreground">
            Contribute historical documents, departmental records, and archival materials.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <UploadForm
              defaultAccessTier="librarian"
              allowedFormats={['pdf', 'docx', 'doc', 'jpg', 'png']}
              title="Upload Archive Materials"
              description="Upload historical documents, departmental records, and archival materials."
              itemType="archive"
            />
          </div>
          <aside className="lg:col-span-1">
            <div className="sticky top-24 rounded-xl border border-border bg-card/60 p-5">
              <h2 className="text-sm font-semibold text-foreground">Submission guidelines</h2>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>• Accepted formats: PDF, DOC/DOCX, JPG, PNG.</li>
                <li>• Give a descriptive title and add tags so the item is easy to find.</li>
                <li>• Set the correct access tier — archive material may be staff-only.</li>
                <li>• Once indexed, the AI assistant can answer questions about this item.</li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </AuthGuard>
  );
}
