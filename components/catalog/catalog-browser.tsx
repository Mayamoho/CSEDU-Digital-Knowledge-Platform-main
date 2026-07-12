"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { CatalogSearch } from "./catalog-search";
import { CatalogFilters } from "./catalog-filters";
import { CatalogGrid } from "./catalog-grid";
import { CatalogTopics } from "./catalog-topics";

// Switches the catalog between its two views based on the ?topic= URL param:
//   - no topic  -> topic-wise overview (subject cards)
//   - a topic   -> that topic's paginated book grid, with the full
//                  Topic -> Availability -> Format -> Year filter hierarchy.
export function CatalogBrowser() {
  const searchParams = useSearchParams();
  const topic = searchParams.get("topic") || "";

  if (!topic) {
    return (
      <div className="flex flex-col gap-6">
        <CatalogSearch />
        <CatalogTopics />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button variant="ghost" size="sm" className="w-fit -ml-2" asChild>
          <Link href="/catalog">
            <ArrowLeft className="h-4 w-4 mr-1" />
            All topics
          </Link>
        </Button>
        <h2 className="text-2xl font-semibold tracking-tight">{topic}</h2>
      </div>

      <CatalogSearch />

      <div className="flex flex-col lg:flex-row gap-6">
        <aside className="w-full lg:w-64 shrink-0">
          <CatalogFilters />
        </aside>
        <div className="flex-1">
          <CatalogGrid />
        </div>
      </div>
    </div>
  );
}
