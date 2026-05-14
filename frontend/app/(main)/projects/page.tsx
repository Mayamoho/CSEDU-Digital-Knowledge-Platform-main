import type { Metadata } from "next";
import { ProjectsGrid } from "@/components/projects/projects-grid";
import { ProjectsSearch } from "@/components/projects/projects-search";
import { ProjectsFilters } from "@/components/projects/projects-filters";

export const metadata: Metadata = {
  title: "Student Projects",
  description: "Showcase student projects, final year works, and creative achievements from CSEDU.",
};

export default function ProjectsPage() {
  return (
    <div className="container px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Student Projects
        </h1>
        <p className="mt-2 text-muted-foreground">
          Showcase student projects, final year works, and creative achievements.
        </p>
      </div>

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
