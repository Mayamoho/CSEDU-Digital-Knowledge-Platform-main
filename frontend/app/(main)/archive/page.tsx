import type { Metadata } from "next";
import { Suspense } from "react";
import { ArchiveGrid } from "@/components/archive/archive-grid";
import { ArchiveSearch } from "@/components/archive/archive-search";
import { ArchiveFilters } from "@/components/archive/archive-filters";

export const metadata: Metadata = {
  title: "Digital Archive",
  description: "Access historical documents, departmental records, and multimedia archives from CSEDU.",
};

export default function ArchivePage() {
  return (
    <div className="container px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Digital Archive
        </h1>
        <p className="mt-2 text-muted-foreground">
          Browse historical documents, departmental records, and multimedia archives.
        </p>
      </div>

      <Suspense fallback={<div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>}>
        <div className="flex flex-col gap-6">
          <ArchiveSearch />
          
          <div className="flex flex-col lg:flex-row gap-6">
            <aside className="w-full lg:w-64 shrink-0">
              <ArchiveFilters />
            </aside>
            
            <div className="flex-1">
              <ArchiveGrid />
            </div>
          </div>
        </div>
      </Suspense>
    </div>
  );
}
