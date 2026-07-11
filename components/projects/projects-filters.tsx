"use client";

import { Suspense } from "react";
import { apiClient } from "@/lib/api";
import { HierarchyFilter } from "@/components/shared/hierarchy-filter";

// Hierarchy: Project Year -> Technology (from project keywords), live DB facets.
export function ProjectsFilters() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse bg-muted rounded-lg" />}>
      <HierarchyFilter
        basePath="/projects"
        levels={[
          { key: "year", title: "Project Year" },
          { key: "tech", title: "Technology" },
        ]}
        fetchFacets={async (sel) => {
          const res = await apiClient.listProjects({
            year: sel.year,
            tech: sel.tech,
            per_page: 1,
          });
          return res.facets || {};
        }}
      />
    </Suspense>
  );
}
