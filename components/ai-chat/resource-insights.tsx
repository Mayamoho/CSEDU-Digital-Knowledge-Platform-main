"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles } from "lucide-react";
import { apiClient, type AIInsights } from "@/lib/api";
import { toast } from "sonner";

// FR-AI-003 / FR-AI-009 / FR-AI-010.
//
// On demand, not on page load: the extraction runs on the 120B tier, and firing
// it for every visitor would burn the Groq free-tier budget on people who never
// asked. Results are cached server-side for a day, so a second click is instant.

function Section({ title, items }: { title: string; items?: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <h4 className="text-sm font-semibold">{title}</h4>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function Prose({ title, text }: { title: string; text?: string }) {
  if (!text) return null;
  return (
    <div>
      <h4 className="text-sm font-semibold">{title}</h4>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

export function ResourceInsights({
  itemId,
  kind = "auto",
}: {
  itemId: string;
  kind?: "auto" | "summary" | "research" | "project";
}) {
  const [data, setData] = useState<AIInsights | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      setData(await apiClient.getInsights(itemId, kind));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate insights");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          AI Insights
        </CardTitle>
        <CardDescription>
          A grounded summary and structured breakdown, extracted from this
          document's own indexed text.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!data && !loading && (
          <Button size="sm" onClick={run}>
            Generate insights
          </Button>
        )}

        {loading && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        )}

        {data && (
          <>
            <Prose title="Summary" text={data.summary} />
            <Section title="Key points" items={data.key_points} />
            <Section title="Key findings" items={data.key_findings} />
            <Prose title="Methodology" text={data.methodology} />
            <Prose title="Conclusion" text={data.conclusion} />
            <Section title="Technologies used" items={data.technologies} />
            <Section title="Skills demonstrated" items={data.skills} />
            <Prose title="Outcome" text={data.outcome} />

            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <Badge variant="outline" className="font-mono text-[10px]">{data.model_used}</Badge>
              <span className="text-xs text-muted-foreground">{data.word_count} words</span>
              {data.cached && <span className="text-xs text-muted-foreground">· cached</span>}
              <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={run} disabled={loading}>
                Regenerate
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
