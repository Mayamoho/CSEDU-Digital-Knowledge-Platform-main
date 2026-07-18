import type { Metadata } from "next";
import { AuthGuard } from "@/components/auth/auth-guard";
import { ProjectUploadForm } from "@/components/upload/project-upload-form";

export const metadata: Metadata = {
  title: "Upload Student Projects",
  description: "Upload student projects and showcase your creative work on the CSEDU Digital Knowledge Platform.",
};

export default function UploadProjectsPage() {
  return (
    <AuthGuard requireAuth allowedRoles={['student', 'researcher', 'administrator']}>
      <div className="container max-w-6xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Upload Student Project
          </h1>
          <p className="mt-2 text-muted-foreground">
            Showcase your student projects, final year work, and creative achievements.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ProjectUploadForm />
          </div>
          <aside className="lg:col-span-1">
            <div className="sticky top-24 rounded-xl border border-border bg-card/60 p-5">
              <h2 className="text-sm font-semibold text-foreground">Submission guidelines</h2>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>• Add a clear title, abstract, and the technologies used as keywords.</li>
                <li>• List every team member and your supervisor and course code.</li>
                <li>• Link a live demo, GitHub repo, or app download so others can explore it.</li>
                <li>• Once indexed, the AI assistant can answer questions about your project.</li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </AuthGuard>
  );
}
