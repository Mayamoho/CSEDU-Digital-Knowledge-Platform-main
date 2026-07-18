"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from "@/components/ui/empty";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookOpen, BookMarked, Calendar, User, Search, AlertCircle } from "lucide-react";
import { CatalogPagination } from "./catalog-pagination";
import { apiClient, type LibraryCatalogItem } from "@/lib/api";
import { useRoleCheck } from "@/components/auth/role-gate";

const statusConfig = {
  available: { label: "Available", variant: "default" as const },
  borrowed:  { label: "Borrowed",  variant: "secondary" as const },
  reserved:  { label: "Reserved",  variant: "outline" as const },
};

// Book cover: prefer a stored cover_image, else fall back to the Open Library
// cover API by ISBN (?default=false → 404s when missing so onError hides it and
// the icon block below shows instead).
function BookCover({ item }: { item: LibraryCatalogItem }) {
  const [failed, setFailed] = useState(false);
  const src =
    item.cover_image ||
    (item.isbn
      ? `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(item.isbn)}-M.jpg?default=false`
      : "");
  if (!src || failed) return null;
  return (
    <Link
      href={`/catalog/${item.item_id}`}
      className="-mt-6 -mx-6 mb-3 block overflow-hidden rounded-t-xl bg-muted"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={item.title}
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-44 w-full object-cover"
      />
    </Link>
  );
}

export function CatalogGrid() {
  const searchParams = useSearchParams();
  const [items, setItems]         = useState<LibraryCatalogItem[]>([]);
  const [total, setTotal]         = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]         = useState("");
  const [sortBy, setSortBy]       = useState("title");
  const { checkPermission } = useRoleCheck();

  const query        = searchParams.get("q")            || "";
  const topic        = searchParams.get("topic")        || "";
  const availability = searchParams.get("availability") || searchParams.get("status") || "";
  const format       = searchParams.get("format")       || "";
  const year         = searchParams.get("year")         || "";
  const page         = parseInt(searchParams.get("page") || "1");
  const perPage = 12;

  const fetchItems = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const res = await apiClient.getLibraryCatalog({
        q:            query || undefined,
        topic:        topic || undefined,
        availability: availability || undefined,
        format:       format || undefined,
        year:         year || undefined,
        page,
        per_page: perPage,
      });
      setItems(res.data);
      setTotal(res.total);
      setTotalPages(res.total_pages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load catalog");
    } finally {
      setIsLoading(false);
    }
  }, [query, topic, availability, format, year, page, perPage]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Client-side sort (server already paginates; sort within page)
  const sorted = [...items].sort((a, b) => {
    switch (sortBy) {
      case "author": return a.author.localeCompare(b.author);
      case "year":   return (b.year ?? 0) - (a.year ?? 0);
      default:       return a.title.localeCompare(b.title);
    }
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="group transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5">
              <CardHeader className="space-y-2">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </CardHeader>
              <CardContent><Skeleton className="h-4 w-1/2" /></CardContent>
              <CardFooter><Skeleton className="h-9 w-full animate-pulse" style={{ animationDelay: `${i * 80}ms` }} /></CardFooter>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (items.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><Search className="h-5 w-5" /></EmptyMedia>
          <EmptyTitle>No results found</EmptyTitle>
          <EmptyDescription>
            {query
              ? `No items match "${query}". Try adjusting your search or filters.`
              : "No items in the catalog match your filters."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {items.length} of {total} results
        </p>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="title">Title</SelectItem>
            <SelectItem value="author">Author</SelectItem>
            <SelectItem value="year">Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((item) => {
          const sc = statusConfig[item.status as keyof typeof statusConfig] ?? statusConfig.available;
          return (
            <Card key={item.item_id} className="group flex flex-col overflow-hidden transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 hover:border-primary/30">
              <CardHeader className="flex-1">
                <BookCover item={item} />
                <div className="flex items-start justify-between gap-2">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
                    <BookOpen className="h-5 w-5 text-primary" />
                  </div>
                  <Badge variant={sc.variant}>{sc.label}</Badge>
                </div>
                <h3 className="mt-3 font-semibold leading-tight line-clamp-2">{item.title}</h3>
                <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    <span className="line-clamp-1">{item.author}</span>
                  </div>
                  {item.year && (
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>{item.year}</span>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {item.location && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <BookMarked className="h-3.5 w-3.5" />
                    <span>{item.location}</span>
                  </div>
                )}
              </CardContent>
              <CardFooter className="pt-0">
                <div className="space-y-2 w-full">
                  <Button variant="outline" className="w-full" asChild>
                    <Link href={`/catalog/${item.item_id}`}>View Details</Link>
                  </Button>
                  {item.status === 'available' && checkPermission('borrow_books') && (
                    <Button 
                      className="w-full" 
                      size="sm"
                      asChild
                    >
                      <Link href={`/catalog/${item.item_id}`}>
                        Borrow This Item
                      </Link>
                    </Button>
                  )}
                </div>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {totalPages > 1 && (
        <CatalogPagination currentPage={page} totalPages={totalPages} />
      )}
    </div>
  );
}
