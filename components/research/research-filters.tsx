"use client";

import { Suspense } from "react";
import { apiClient } from "@/lib/api";
import { HierarchyFilter } from "@/components/shared/hierarchy-filter";

// Hierarchy: Publication type -> Year -> Topic (keyword), from live DB facets.
export function ResearchFilters() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse bg-muted rounded-lg" />}>
      <HierarchyFilter
        basePath="/research"
        levels={[
          { key: "rtype", title: "Publication Type" },
          { key: "year", title: "Publication Year" },
          { key: "topic", title: "Topic" },
        ]}
        fetchFacets={async (sel) => {
          const res = await apiClient.listResearch({
            status: "published",
            rtype: sel.rtype,
            year: sel.year,
            topic: sel.topic,
            per_page: 1,
          });
          return res.facets || {};
        }}
      />
    </Suspense>
  );
}
