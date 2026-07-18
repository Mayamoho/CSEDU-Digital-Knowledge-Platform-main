import type { Metadata } from "next";
import { Suspense } from "react";
import { Library } from "lucide-react";

import { CatalogBrowser } from "@/components/catalog/catalog-browser";
import { LibrarianCatalogTools } from "@/components/catalog/librarian-catalog-tools";
import { ModuleHero } from "@/components/module-hero";

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
      <ModuleHero
        title="Library Catalog"
        description="Browse and search our collection of books, journals, and academic resources."
        icon={<Library className="h-6 w-6" />}
      />

      <div className="flex flex-col gap-6">
        <Suspense fallback={<CatalogLoading />}>
          <LibrarianCatalogTools />
        </Suspense>

        <Suspense fallback={<CatalogLoading />}>
          <CatalogBrowser />
        </Suspense>
      </div>
    </div>
  );
}