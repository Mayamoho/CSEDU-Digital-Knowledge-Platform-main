"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, BookOpen, FileText } from "lucide-react";
import { apiClient, type Recommendation } from "@/lib/api";

// FR-AI-017: personalized suggestions, built from what this user borrowed,
// uploaded and asked the assistant about. Every card states why it was picked —
// an unexplained recommendation is just noise.

function hrefFor(rec: Recommendation) {
  if (rec.kind === "book") return `/catalog/${rec.id}`;
  switch (rec.item_type) {
    case "research":
      return `/research/${rec.id}`;
    case "project":
      return `/projects/${rec.id}`;
    default:
      return `/archive/${rec.id}`;
  }
}

export function Recommendations() {
  const [items, setItems] = useState<Recommendation[] | null>(null);
  const [personalized, setPersonalized] = useState(false);

  useEffect(() => {
    apiClient
      .getRecommendations()
      .then((res) => {
        setItems(res.recommendations);
        setPersonalized(res.personalized);
      })
      .catch(() => setItems([]));
  }, []);

  // Nothing to suggest on an empty platform — render nothing rather than an
  // empty card the user has to think about.
  if (items !== null && items.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          Recommended for you
        </CardTitle>
        <CardDescription>
          {personalized
            ? "Based on what you have borrowed, uploaded and asked about."
            : "Popular and recent across the department — borrow something and this gets personal."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {items === null ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((rec) => (
              <li key={`${rec.kind}-${rec.id}`}>
                <Link
                  href={hrefFor(rec)}
                  className="flex items-start gap-3 rounded-md border p-3 transition-colors hover:bg-muted/50"
                >
                  {rec.kind === "book" ? (
                    <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{rec.title}</p>
                    {rec.subtitle && (
                      <p className="truncate text-xs text-muted-foreground">{rec.subtitle}</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">{rec.reason}</p>
                  </div>
                  {rec.kind === "book" && rec.available !== undefined && (
                    <Badge variant={rec.available ? "outline" : "secondary"} className="shrink-0 text-[10px]">
                      {rec.available ? "Available" : "On loan"}
                    </Badge>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
