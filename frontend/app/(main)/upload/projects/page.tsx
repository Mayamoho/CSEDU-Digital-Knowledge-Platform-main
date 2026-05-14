import type { Metadata } from "next";
import { AuthGuard } from "@/components/auth/auth-guard";
import { ProjectUploadForm } from "@/components/upload/project-upload-form";

export const metadata: Metadata = {
  title: "Upload Student Projects",
  description: "Upload student projects and showcase your creative work on the CSEDU Digital Knowledge Platform.",
};

export default function UploadProjectsPage() {
  return (
    <AuthGuard requireAuth allowedRoles={['student', 'researcher', 'librarian', 'administrator']}>
      <div className="container max-w-4xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Upload Student Project
          </h1>
          <p className="mt-2 text-muted-foreground">
            Showcase your student projects, final year work, and creative achievements.
          </p>
        </div>

        <ProjectUploadForm />
      </div>
    </AuthGuard>
  );
}
