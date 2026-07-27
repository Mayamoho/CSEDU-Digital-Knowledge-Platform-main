"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiClient, MediaItem } from "@/lib/api";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FolderOpen, Calendar, User, Download, Eye, Archive, ExternalLink } from "lucide-react";
import { CatalogPagination } from "@/components/catalog/catalog-pagination";
import { mediaFileUrl } from "@/lib/media-url";

const accessTierConfig = {
  public: { label: "Public", variant: "default" as const },
  student: { label: "Students", variant: "secondary" as const },
  researcher: { label: "Researchers", variant: "outline" as const },
  librarian: { label: "Staff Only", variant: "outline" as const },
  restricted: { label: "Restricted", variant: "destructive" as const },
};

const IMAGE_FORMATS = ["jpg", "jpeg", "png", "gif"];
const isImageFormat = (format?: string) => !!format && IMAGE_FORMATS.includes(format.toLowerCase());

function ArchiveThumbnail({ item }: { item: MediaItem }) {
  const [failed, setFailed] = useState(false);
  if (!item.file_path || !isImageFormat(item.format) || failed) return null;
  return (
    <Link
      href={`/archive/${item.item_id}`}
      className="-mt-6 -mx-6 mb-3 block overflow-hidden rounded-t-xl bg-muted"
    >
      <img
        src={mediaFileUrl(item.item_id, item.file_path, { inline: true })}
        alt={item.title}
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-40 w-full object-cover"
      />
    </Link>
  );
}

function ArchiveGridInner() {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState("date");
  const [total, setTotal] = useState(0);

  const query = searchParams.get("q") || "";
  const format = searchParams.get("format") || "";
  const access = searchParams.get("access") || "";
  const year = searchParams.get("year") || "";
  const page = parseInt(searchParams.get("page") || "1");
  const perPage = 12;

  useEffect(() => {
    const fetchItems = async () => {
      setIsLoading(true);
      try {
        const response = await apiClient.getMediaItems({
          q: query || undefined,
          format: format || undefined,
          access: access || undefined,
          year: year || undefined,
          page,
          per_page: perPage,
          item_type: 'archive',
        });

        setItems(response.data);
        setTotal(response.total);
      } catch (error) {
        console.error('Failed to fetch archive items:', error);
        setItems([]);
        setTotal(0);
      } finally {
        setIsLoading(false);
      }
    };

    fetchItems();
  }, [query, format, access, year, page]);

  const totalPages = Math.ceil(total / perPage);

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
              <CardContent>
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
              <CardFooter>
                <Skeleton className="h-9 w-full animate-pulse" style={{ animationDelay: `${i * 80}ms` }} />
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Empty>
        <EmptyMedia variant="icon">
          <Archive className="h-6 w-6" />
        </EmptyMedia>
        <EmptyTitle>No archives found</EmptyTitle>
        <EmptyDescription>
          {query
            ? `No archives match "${query}". Try adjusting your search or filters.`
            : "No archives match your current filters."}
        </EmptyDescription>
      </Empty>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {items.length} of {total} archives
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <Card key={item.item_id} className="group flex flex-col overflow-hidden transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 hover:border-primary/30">
            <CardHeader className="flex-1">
              <ArchiveThumbnail item={item} />
              <div className="flex items-start justify-between gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <FolderOpen className="h-5 w-5 text-primary" />
                </div>
                <Badge variant={accessTierConfig[item.access_tier].variant}>
                  {accessTierConfig[item.access_tier].label}
                </Badge>
              </div>
              <h3 className="mt-3 font-semibold leading-tight line-clamp-2">
                {item.title}
              </h3>
              {item.metadata?.abstract && (
                <p className="mt-2 text-sm text-muted-foreground line-clamp-3">
                  {item.metadata.abstract}
                </p>
              )}
              <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{new Date(item.upload_date).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5" />
                  <span className="line-clamp-1">{item.created_by}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {(() => {
                const kws = (item.metadata?.keywords ?? []).flatMap((k) => k.split(",")).map((k) => k.trim()).filter(Boolean);
                if (kws.length === 0) return null;
                return (
                <div className="flex flex-wrap gap-1 mb-3">
                  {kws.slice(0, 3).map((keyword, index) => (
                    <Badge key={index} variant="outline" className="text-xs max-w-full truncate">
                      {keyword}
                    </Badge>
                  ))}
                  {kws.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{kws.length - 3}
                    </Badge>
                  )}
                </div>
                );
              })()}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {item.external_url ? (
                  <a
                    href={item.external_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> External link
                  </a>
                ) : (
                  <span>{item.format.toUpperCase()}</span>
                )}
              </div>
            </CardContent>
            <CardFooter className="pt-0 flex flex-col gap-2">
              <Button variant="outline" className="w-full" asChild>
                <Link href={`/archive/${item.item_id}`}>View Details</Link>
              </Button>
              {item.external_url && (
                <Button variant="ghost" className="w-full" asChild>
                  <a href={item.external_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" /> Open Link
                  </a>
                </Button>
              )}
            </CardFooter>
          </Card>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="mt-6 flex flex-col items-center gap-2">
          <CatalogPagination currentPage={page} totalPages={totalPages} basePath="/archive" />
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
        </div>
      )}
    </div>
  );
}

export function ArchiveGrid() {
  return (
    <Suspense fallback={<div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-5 w-32 animate-pulse bg-muted rounded" />
        <div className="h-10 w-40 animate-pulse bg-muted rounded" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-64 animate-pulse bg-muted rounded transition-all" style={{ animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
    </div>}>
      <ArchiveGridInner />
    </Suspense>
  );
}
