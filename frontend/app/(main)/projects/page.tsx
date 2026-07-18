import type { Metadata } from "next";
import { BookOpen } from "lucide-react";
import { ProjectsGrid } from "@/components/projects/projects-grid";
import { ProjectsSearch } from "@/components/projects/projects-search";
import { ProjectsFilters } from "@/components/projects/projects-filters";
import { ModuleHero } from "@/components/module-hero";

export const metadata: Metadata = {
  title: "Student Projects",
  description: "Showcase student projects, final year works, and creative achievements from CSEDU.",
};

export default function ProjectsPage() {
  return (
    <div className="container px-4 py-8">
      <ModuleHero
        title="Student Projects"
        description="Showcase student projects, final year works, and creative achievements."
        icon={<BookOpen className="h-6 w-6" />}
      />

      <div className="flex flex-col gap-6">
        <ProjectsSearch />
        
        <div className="flex flex-col lg:flex-row gap-6">
          <aside className="w-full lg:w-64 shrink-0">
            <ProjectsFilters />
          </aside>
          
          <div className="flex-1">
            <ProjectsGrid />
          </div>
        </div>
      </div>
    </div>
  );
}
