"use client";

import { Suspense } from "react";
import { apiClient } from "@/lib/api";
import { HierarchyFilter } from "@/components/shared/hierarchy-filter";

// Hierarchy: Availability -> Format -> Year, driven by live DB facet counts.
export function CatalogFilters() {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse bg-muted rounded-lg" />}>
      <HierarchyFilter
        basePath="/catalog"
        levels={[
          { key: "availability", title: "Availability" },
          { key: "format", title: "Format" },
          { key: "year", title: "Year" },
        ]}
        fetchFacets={async (sel) => {
          const res = await apiClient.getLibraryCatalog({
            availability: sel.availability,
            format: sel.format,
            year: sel.year,
            per_page: 1,
          });
          return res.facets || {};
        }}
      />
    </Suspense>
  );
}
