import type { Metadata } from "next";
import { Suspense } from "react";
import { FileText } from "lucide-react";
import { ResearchGrid } from "@/components/research/research-grid";
import { ResearchSearch } from "@/components/research/research-search";
import { ResearchFilters } from "@/components/research/research-filters";
import { ModuleHero } from "@/components/module-hero";

export const metadata: Metadata = {
  title: "Research Repository",
  description: "Discover and publish research papers, theses, and academic publications from CSEDU.",
};

export default function ResearchPage() {
  return (
    <div className="container px-4 py-8">
      <ModuleHero
        title="Research Repository"
        description="Discover and publish research papers, theses, and academic publications."
        icon={<FileText className="h-6 w-6" />}
      />

      <Suspense fallback={<div className="flex justify-center py-12"><div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" /></div>}>
        <div className="flex flex-col gap-6">
          <ResearchSearch />
          
          <div className="flex flex-col lg:flex-row gap-6">
            <aside className="w-full lg:w-64 shrink-0">
              <ResearchFilters />
            </aside>
            
            <div className="flex-1">
              <ResearchGrid />
            </div>
          </div>
        </div>
      </Suspense>
    </div>
  );
}
