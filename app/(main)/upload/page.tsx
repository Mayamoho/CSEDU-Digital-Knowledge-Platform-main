import type { Metadata } from "next";
import { UploadForm } from "@/components/upload/upload-form";
import { UploadPageClient } from "./upload-client";
import { AuthGuard } from "@/components/auth/auth-guard";

export const metadata: Metadata = {
  title: "Upload Media",
  description: "Upload documents, research papers, and media files to the CSEDU Digital Knowledge Platform.",
};

export default function UploadPage() {
  return (
    <AuthGuard requireAuth allowedRoles={['staff', 'admin', 'ai_admin']}>
      <UploadPageClient />
    </AuthGuard>
  );
}
