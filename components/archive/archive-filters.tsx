"use client";

import { Suspense } from "react";
import { apiClient } from "@/lib/api";
import { HierarchyFilter } from "@/components/shared/hierarchy-filter";

// Hierarchy: Format -> Access tier -> Year (of upload), from live DB facets.
export function ArchiveFilters() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse bg-muted rounded-lg" />}>
      <HierarchyFilter
        basePath="/archive"
        levels={[
          { key: "format", title: "Format" },
          { key: "access", title: "Access Level" },
          { key: "year", title: "Year" },
        ]}
        fetchFacets={async (sel) => {
          const res = await apiClient.getMediaItems({
            item_type: "archive",
            format: sel.format,
            access: sel.access,
            year: sel.year,
            per_page: 1,
          });
          return res.facets || {};
        }}
      />
    </Suspense>
  );
}
