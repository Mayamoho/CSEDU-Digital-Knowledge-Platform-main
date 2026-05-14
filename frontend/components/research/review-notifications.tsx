"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiClient, ResearchPaper } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Bell, FileText, Calendar, ChevronRight } from "lucide-react";

export function ReviewNotifications() {
  const [papers, setPapers] = useState<ResearchPaper[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    apiClient.listResearch({ for_review: true })
      .then(res => setPapers(res?.data || []))
      .catch(() => setPapers([]))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2].map(i => <Skeleton key={i} className="h-16 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  if (papers.length === 0) return null;

  return (
    <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
          <Bell className="h-5 w-5" />
          Papers Awaiting Your Review
          <Badge variant="secondary" className="ml-auto">{papers.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {papers.slice(0, 5).map(paper => (
          <div key={paper.paper_id} className="flex items-center justify-between p-3 rounded-lg bg-background border">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{paper.title}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{paper.authors?.join(", ")}</span>
                  <span>•</span>
                  <Calendar className="h-3 w-3" />
                  <span>{new Date(paper.submitted_at).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
            <Button size="sm" variant="outline" asChild className="shrink-0 ml-2">
              <Link href={`/research/${paper.paper_id}`}>
                Review <ChevronRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </div>
        ))}
        {papers.length > 5 && (
          <p className="text-xs text-muted-foreground text-center">
            +{papers.length - 5} more papers awaiting review
          </p>
        )}
      </CardContent>
    </Card>
  );
}
