"use client";

import { UploadForm } from "@/components/upload/upload-form";

export function UploadPageClient() {
  return (
    <div className="container max-w-3xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Upload Media
        </h1>
        <p className="mt-2 text-muted-foreground">
          Share documents, research papers, and other media with the CSEDU community.
        </p>
      </div>

      <UploadForm />
    </div>
  );
}
