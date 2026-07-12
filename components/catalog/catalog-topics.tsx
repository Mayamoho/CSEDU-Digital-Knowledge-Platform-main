"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from "@/components/ui/empty";
import { Library, AlertCircle, Search, ChevronRight } from "lucide-react";
import { apiClient, type CatalogTopic } from "@/lib/api";

// Topic-wise landing view for the catalog. Each subject present in the library
// gets its own card; clicking it opens that topic's paginated book grid at
// /catalog?topic=<name>. The shared search box (?q=) filters the visible topic
// cards by name so "search bar should include topic name" holds here too.
export function CatalogTopics() {
  const searchParams = useSearchParams();
  const query = (searchParams.get("q") || "").trim().toLowerCase();

  const [topics, setTopics] = useState<CatalogTopic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError("");
    apiClient
      .getCatalogTopics()
      .then((res) => {
        if (!cancelled) setTopics(res.data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load topics");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = query
    ? topics.filter((t) => t.topic.toLowerCase().includes(query))
    : topics;

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="space-y-2">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </CardHeader>
          </Card>
        ))}
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

  if (visible.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><Search className="h-5 w-5" /></EmptyMedia>
          <EmptyTitle>No topics found</EmptyTitle>
          <EmptyDescription>
            {query ? `No topics match "${query}".` : "The catalog has no books yet."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Browse {visible.length} topic{visible.length === 1 ? "" : "s"} — select one to see its books.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((t) => (
          <Link key={t.topic} href={`/catalog?topic=${encodeURIComponent(t.topic)}`} className="group">
            <Card className="h-full transition hover:border-primary hover:shadow-sm">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
                    <Library className="h-5 w-5 text-primary" />
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                </div>
                <h3 className="mt-3 text-lg font-semibold leading-tight">{t.topic}</h3>
              </CardHeader>
              <CardContent className="flex items-center gap-2 pt-0">
                <Badge variant="secondary">
                  {t.total} book{t.total === 1 ? "" : "s"}
                </Badge>
                {t.available > 0 && (
                  <Badge variant="outline">{t.available} available</Badge>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
