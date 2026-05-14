"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { FileText, Calendar, User } from "lucide-react";
import { apiClient, ResearchPaper } from "@/lib/api";

const statusConfig: Record<string, { label: string; variant: "secondary" | "outline" | "default" | "destructive" }> = {
  draft: { label: "Draft", variant: "secondary" },
  review: { label: "Under Review", variant: "outline" },
  published: { label: "Published", variant: "default" },
  archived: { label: "Archived", variant: "destructive" },
};

function ResearchGridInner() {
  const searchParams = useSearchParams();
  const [papers, setPapers] = useState<ResearchPaper[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const query = searchParams.get("q") || "";
  const page = parseInt(searchParams.get("page") || "1");
  const perPage = 12;

  useEffect(() => {
    const fetchPapers = async () => {
      setIsLoading(true);
      try {
        const response = await apiClient.listResearch({ status: "published" });
        const data = response?.data || [];
        setPapers(Array.isArray(data) ? data : []);
        setTotal(response?.total || 0);
      } catch (error) {
        console.error("Failed to fetch research papers:", error);
        setPapers([]);
        setTotal(0);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPapers();
  }, [query, page]);

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="space-y-2">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </CardHeader>
            <CardContent><Skeleton className="h-4 w-full mb-2" /><Skeleton className="h-4 w-2/3" /></CardContent>
            <CardFooter><Skeleton className="h-9 w-full" /></CardFooter>
          </Card>
        ))}
      </div>
    );
  }

  if (!papers || papers.length === 0) {
    return (
      <Empty>
        <EmptyMedia variant="icon"><FileText className="h-6 w-6" /></EmptyMedia>
        <EmptyTitle>No research papers found</EmptyTitle>
        <EmptyDescription>
          {query ? `No papers match "${query}".` : "No published research papers yet."}
        </EmptyDescription>
      </Empty>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Showing {papers.length} of {total} papers</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {papers.map((paper) => (
          <Card key={paper.paper_id} className="flex flex-col">
            <CardHeader className="flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <Badge variant={statusConfig[paper.status]?.variant ?? "secondary"}>
                  {statusConfig[paper.status]?.label ?? paper.status}
                </Badge>
              </div>
              <h3 className="mt-3 font-semibold leading-tight line-clamp-2">{paper.title}</h3>
              {paper.abstract && (
                <p className="mt-2 text-sm text-muted-foreground line-clamp-3">{paper.abstract}</p>
              )}
              <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                {paper.authors?.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    <span className="line-clamp-1">{paper.authors.join(", ")}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{new Date(paper.submitted_at).toLocaleDateString()}</span>
                </div>
                {paper.journal && <p className="text-xs italic">{paper.journal}</p>}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {paper.keywords?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {paper.keywords.slice(0, 3).map((k, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{k}</Badge>
                  ))}
                  {paper.keywords.length > 3 && (
                    <Badge variant="secondary" className="text-xs">+{paper.keywords.length - 3}</Badge>
                  )}
                </div>
              )}
            </CardContent>
            <CardFooter className="pt-0">
              <Button variant="outline" className="w-full" asChild>
                <Link href={`/research/${paper.paper_id}`}>View Details</Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function ResearchGrid() {
  return (
    <Suspense fallback={
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-64 animate-pulse bg-muted rounded" />
        ))}
      </div>
    }>
      <ResearchGridInner />
    </Suspense>
  );
}
