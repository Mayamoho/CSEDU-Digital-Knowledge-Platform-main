"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Filter, X, Check } from "lucide-react";
import type { Facets } from "@/lib/api";

export interface HierarchyLevel {
  key: string; // URL param + facet key
  title: string;
}

/**
 * A dependent, single-select hierarchical browse control. Each level only
 * appears once the level above it has a selection, and its options + counts are
 * fetched live from the endpoint's facets (which reflect the current path).
 * Selection state lives entirely in the URL, so the sibling result grid reacts
 * to it without any shared React state.
 */
export function HierarchyFilter({
  basePath,
  levels,
  fetchFacets,
  preserveKeys = ["q"],
  title = "Browse",
}: {
  basePath: string;
  levels: HierarchyLevel[];
  fetchFacets: (selected: Record<string, string>) => Promise<Facets>;
  preserveKeys?: string[];
  title?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [facets, setFacets] = useState<Facets>({});
  const [loading, setLoading] = useState(true);

  const selected: Record<string, string> = {};
  for (const l of levels) {
    const v = searchParams.get(l.key);
    if (v) selected[l.key] = v;
  }
  const selKey = JSON.stringify(selected);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchFacets(selected)
      .then((f) => {
        if (!cancelled) {
          setFacets(f || {});
          setLoading(false);
        }
      })
      .catch(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selKey]);

  const setLevel = (idx: number, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null) params.delete(levels[idx].key);
    else params.set(levels[idx].key, value);
    // Selecting/clearing a level invalidates everything below it.
    for (let i = idx + 1; i < levels.length; i++) params.delete(levels[i].key);
    params.delete("page");
    router.push(`${basePath}?${params.toString()}`);
  };

  const clearAll = () => {
    const params = new URLSearchParams();
    for (const k of preserveKeys) {
      const v = searchParams.get(k);
      if (v) params.set(k, v);
    }
    router.push(`${basePath}?${params.toString()}`);
  };

  const hasSelection = Object.keys(selected).length > 0;

  return (
    <Card className="sticky top-20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-4 w-4" />
            {title}
          </CardTitle>
          {hasSelection && (
            <Button variant="ghost" size="sm" onClick={clearAll}>
              <X className="h-4 w-4 mr-1" />
              Reset
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {levels.map((lvl, idx) => {
          const visible = idx === 0 || Boolean(selected[levels[idx - 1].key]);
          if (!visible) return null;
          const buckets = facets[lvl.key] || [];
          const sel = selected[lvl.key];
          return (
            <div key={lvl.key}>
              {idx > 0 && <Separator className="mb-4" />}
              <h4 className="font-medium mb-2 text-sm flex items-center gap-1.5">
                <span className="text-muted-foreground">{idx + 1}.</span>
                {lvl.title}
              </h4>
              {buckets.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {loading ? "Loading…" : "No options here"}
                </p>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                  {buckets.map((b) => {
                    const active = sel === b.value;
                    return (
                      <button
                        key={b.value}
                        type="button"
                        onClick={() => setLevel(idx, active ? null : b.value)}
                        className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition ${
                          active
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted"
                        }`}
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                          <span className="truncate">{b.label}</span>
                        </span>
                        <Badge
                          variant={active ? "secondary" : "outline"}
                          className="text-xs shrink-0"
                        >
                          {b.count}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
