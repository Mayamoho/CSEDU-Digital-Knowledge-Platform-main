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
import { FolderOpen, Calendar, User, Download, Eye, Archive } from "lucide-react";

const accessTierConfig = {
  public: { label: "Public", variant: "default" as const },
  student: { label: "Students", variant: "secondary" as const },
  researcher: { label: "Researchers", variant: "outline" as const },
  librarian: { label: "Staff Only", variant: "outline" as const },
  restricted: { label: "Restricted", variant: "destructive" as const },
};

function ArchiveGridInner() {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState("date");
  const [total, setTotal] = useState(0);

  const query = searchParams.get("q") || "";
  const page = parseInt(searchParams.get("page") || "1");
  const perPage = 12;

  useEffect(() => {
    const fetchItems = async () => {
      setIsLoading(true);
      try {
        const response = await apiClient.getMediaItems({
          q: query || undefined,
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
  }, [query, page]);

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
            <Card key={i}>
              <CardHeader className="space-y-2">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
              <CardFooter>
                <Skeleton className="h-9 w-full" />
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
          <Card key={item.item_id} className="flex flex-col">
            <CardHeader className="flex-1">
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
              {item.metadata?.keywords && item.metadata.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {item.metadata.keywords.slice(0, 3).map((keyword, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {keyword}
                    </Badge>
                  ))}
                  {item.metadata.keywords.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{item.metadata.keywords.length - 3}
                    </Badge>
                  )}
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                {item.format.toUpperCase()}
              </div>
            </CardContent>
            <CardFooter className="pt-0">
              <Button variant="outline" className="w-full" asChild>
                <Link href={`/archive/${item.item_id}`}>View Details</Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center mt-6">
          <div className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </div>
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
          <div key={i} className="h-64 animate-pulse bg-muted rounded" />
        ))}
      </div>
    </div>}>
      <ArchiveGridInner />
    </Suspense>
  );
}
