import type { Metadata } from "next";
import { AuthGuard } from "@/components/auth/auth-guard";
import { ResearchUploadForm } from "@/components/upload/research-upload-form";

export const metadata: Metadata = {
  title: "Upload Research",
  description: "Upload research papers and academic publications to the CSEDU Digital Knowledge Platform.",
};

export default function UploadResearchPage() {
  return (
    <AuthGuard requireAuth allowedRoles={['researcher', 'librarian', 'administrator']}>
      <div className="container max-w-4xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Upload Research Paper
          </h1>
          <p className="mt-2 text-muted-foreground">
            Share your research papers, theses, and academic publications with the CSEDU community.
          </p>
        </div>

        <ResearchUploadForm />
      </div>
    </AuthGuard>
  );
}
