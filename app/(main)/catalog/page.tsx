import type { Metadata } from "next";
import { Suspense } from "react";

import { CatalogSearch } from "@/components/catalog/catalog-search";
import { CatalogGrid } from "@/components/catalog/catalog-grid";
import { CatalogFilters } from "@/components/catalog/catalog-filters";
import { LibrarianCatalogTools } from "@/components/catalog/librarian-catalog-tools";

export const metadata: Metadata = {
  title: "Library Catalog",
  description:
    "Browse and search the CSEDU library catalog. Find books, journals, and academic resources.",
};

function CatalogLoading() {
  return (
    <div className="p-4 text-muted-foreground">
      Loading catalog...
    </div>
  );
}

export default function CatalogPage() {
  return (
    <div className="container px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Library Catalog
        </h1>
        <p className="mt-2 text-muted-foreground">
          Browse and search our collection of books, journals, and academic resources.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        <Suspense fallback={<CatalogLoading />}>
          <LibrarianCatalogTools />
        </Suspense>

        <Suspense fallback={<CatalogLoading />}>
          <CatalogSearch />
        </Suspense>

        <div className="flex flex-col lg:flex-row gap-6">
          <aside className="w-full lg:w-64 shrink-0">
            <Suspense fallback={<CatalogLoading />}>
              <CatalogFilters />
            </Suspense>
          </aside>

          <div className="flex-1">
            <Suspense fallback={<CatalogLoading />}>
              <CatalogGrid />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}