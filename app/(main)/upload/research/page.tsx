import type { Metadata } from "next";
import { AuthGuard } from "@/components/auth/auth-guard";
import { ResearchUploadForm } from "@/components/upload/research-upload-form";

export const metadata: Metadata = {
  title: "Upload Research",
  description: "Upload research papers and academic publications to the CSEDU Digital Knowledge Platform.",
};

export default function UploadResearchPage() {
  return (
    <AuthGuard requireAuth allowedRoles={['student', 'researcher', 'administrator']}>
      <div className="container max-w-6xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Upload Research Paper
          </h1>
          <p className="mt-2 text-muted-foreground">
            Share your research papers, theses, and academic publications with the CSEDU community.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ResearchUploadForm />
          </div>
          <aside className="lg:col-span-1">
            <div className="sticky top-24 rounded-xl border border-border bg-card/60 p-5">
              <h2 className="text-sm font-semibold text-foreground">Submission guidelines</h2>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>• Upload the final PDF (max 50&nbsp;MB); include an abstract and keywords for discoverability.</li>
                <li>• List all authors and, where available, the DOI, journal, or conference.</li>
                <li>• Submissions enter a review queue before they appear publicly.</li>
                <li>• Once indexed, the AI assistant can answer questions about your paper.</li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </AuthGuard>
  );
}
