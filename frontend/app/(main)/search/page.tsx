"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Library, FolderOpen, FileText, BookOpen } from "lucide-react";
import { apiClient } from "@/lib/api";
import Link from "next/link";

function SearchContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [activeTab, setActiveTab] = useState("all");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState({
    catalog: [],
    archive: [],
    research: [],
    projects: [],
  });

  useEffect(() => {
    const q = searchParams.get("q");
    if (q) {
      setQuery(q);
      performSearch(q);
    }
  }, [searchParams]);

  const performSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    setIsLoading(true);
    try {
      const [catalogRes, archiveRes, researchRes, projectsRes] = await Promise.allSettled([
        apiClient.getCatalogItems({ query: searchQuery, per_page: 10 }),
        apiClient.getMediaItems({ query: searchQuery, item_type: "archive", per_page: 10 }),
        apiClient.getMediaItems({ query: searchQuery, item_type: "research", per_page: 10 }),
        apiClient.getMediaItems({ query: searchQuery, item_type: "project", per_page: 10 }),
      ]);

      setResults({
        catalog: catalogRes.status === "fulfilled" ? catalogRes.value.data : [],
        archive: archiveRes.status === "fulfilled" ? archiveRes.value.data : [],
        research: researchRes.status === "fulfilled" ? researchRes.value.data : [],
        projects: projectsRes.status === "fulfilled" ? projectsRes.value.data : [],
      });
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query)}`);
    }
  };

  const totalResults = results.catalog.length + results.archive.length + results.research.length + results.projects.length;

  return (
    <div className="container max-w-6xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">Search</h1>
        <p className="text-muted-foreground">Search across all platform content</p>
      </div>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="mb-8">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search for books, papers, projects, archives..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Searching..." : "Search"}
          </Button>
        </div>
      </form>

      {query && !isLoading && (
        <p className="text-sm text-muted-foreground mb-4">
          Found {totalResults} result{totalResults !== 1 ? "s" : ""} for "{query}"
        </p>
      )}

      {/* Results Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="all">
            All ({totalResults})
          </TabsTrigger>
          <TabsTrigger value="catalog">
            <Library className="h-4 w-4 mr-1" />
            Catalog ({results.catalog.length})
          </TabsTrigger>
          <TabsTrigger value="archive">
            <FolderOpen className="h-4 w-4 mr-1" />
            Archive ({results.archive.length})
          </TabsTrigger>
          <TabsTrigger value="research">
            <FileText className="h-4 w-4 mr-1" />
            Research ({results.research.length})
          </TabsTrigger>
          <TabsTrigger value="projects">
            <BookOpen className="h-4 w-4 mr-1" />
            Projects ({results.projects.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="space-y-4 mt-6">
          {isLoading ? (
            <LoadingSkeleton />
          ) : (
            <>
              {results.catalog.length > 0 && (
                <ResultSection title="Library Catalog" icon={Library} items={results.catalog} type="catalog" />
              )}
              {results.archive.length > 0 && (
                <ResultSection title="Digital Archive" icon={FolderOpen} items={results.archive} type="archive" />
              )}
              {results.research.length > 0 && (
                <ResultSection title="Research Papers" icon={FileText} items={results.research} type="research" />
              )}
              {results.projects.length > 0 && (
                <ResultSection title="Student Projects" icon={BookOpen} items={results.projects} type="projects" />
              )}
              {totalResults === 0 && query && (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">No results found. Try different keywords.</p>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="catalog" className="space-y-4 mt-6">
          {isLoading ? <LoadingSkeleton /> : <CatalogResults items={results.catalog} />}
        </TabsContent>

        <TabsContent value="archive" className="space-y-4 mt-6">
          {isLoading ? <LoadingSkeleton /> : <MediaResults items={results.archive} type="archive" />}
        </TabsContent>

        <TabsContent value="research" className="space-y-4 mt-6">
          {isLoading ? <LoadingSkeleton /> : <MediaResults items={results.research} type="research" />}
        </TabsContent>

        <TabsContent value="projects" className="space-y-4 mt-6">
          {isLoading ? <LoadingSkeleton /> : <MediaResults items={results.projects} type="projects" />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ResultSection({ title, icon: Icon, items, type }: any) {
  return (
    <div>
      <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
        <Icon className="h-5 w-5" />
        {title}
      </h2>
      {type === "catalog" ? <CatalogResults items={items} /> : <MediaResults items={items} type={type} />}
    </div>
  );
}

function CatalogResults({ items }: any) {
  if (items.length === 0) {
    return <p className="text-muted-foreground text-center py-8">No books found</p>;
  }

  return (
    <div className="grid gap-4">
      {items.map((item: any) => (
        <Link key={item.catalog_id} href={`/catalog/${item.catalog_id}`}>
          <Card className="hover:border-primary transition-colors cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="font-medium text-foreground mb-1">{item.title}</h3>
                  <p className="text-sm text-muted-foreground mb-2">by {item.author}</p>
                  {item.isbn && (
                    <p className="text-xs text-muted-foreground">ISBN: {item.isbn}</p>
                  )}
                </div>
                <Badge variant={item.available_copies > 0 ? "default" : "secondary"}>
                  {item.available_copies > 0 ? "Available" : "Unavailable"}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function MediaResults({ items, type }: any) {
  if (items.length === 0) {
    return <p className="text-muted-foreground text-center py-8">No items found</p>;
  }

  return (
    <div className="grid gap-4">
      {items.map((item: any) => (
        <Link key={item.item_id} href={`/${type}/${item.item_id}`}>
          <Card className="hover:border-primary transition-colors cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="font-medium text-foreground mb-1">{item.title}</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    {new Date(item.upload_date).toLocaleDateString()}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="outline">{item.format}</Badge>
                    <Badge variant="secondary">{item.status}</Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <Skeleton className="h-6 w-3/4 mb-2" />
            <Skeleton className="h-4 w-1/2 mb-2" />
            <Skeleton className="h-4 w-1/4" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="container px-4 py-8">Loading...</div>}>
      <SearchContent />
    </Suspense>
  );
}
