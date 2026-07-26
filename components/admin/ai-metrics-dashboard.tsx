"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiClient, type AIMetrics } from "@/lib/api";

// FR-AI-015: "admin dashboard displays metrics". Reads the aggregate the API
// computes from ai_chat_messages, so this view needs no Grafana login and works
// on a fresh deployment with no Prometheus retention yet.

function ms(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
  return `${Math.round(value)} ms`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
        {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

export function AIMetricsDashboard() {
  const [data, setData] = useState<AIMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient
      .getAIMetrics()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load AI metrics"));
  }, []);

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (!data) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  const s = data.summary;
  const rated = s.rated_helpful + s.rated_unhelpful;
  const helpfulRate = rated > 0 ? Math.round((s.rated_helpful / rated) * 100) : null;
  const groundedRate =
    s.total_queries > 0 ? Math.round((s.answers_with_citations / s.total_queries) * 100) : null;
  const peakDay = data.daily.reduce((max, d) => Math.max(max, d.count), 0);

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Total queries" value={s.total_queries.toLocaleString()} />
        <Stat label="Last 24 hours" value={s.queries_24h.toLocaleString()} hint={`${s.queries_7d.toLocaleString()} in 7 days`} />
        <Stat label="Unique users" value={s.unique_users.toLocaleString()} hint={`${s.sessions.toLocaleString()} sessions`} />
        <Stat
          label="Avg response time"
          value={ms(s.avg_latency_ms)}
          hint={`p95 ${ms(s.p95_latency_ms)} · target ≤ 5 s`}
        />
        <Stat
          label="Rated helpful"
          value={helpfulRate === null ? "—" : `${helpfulRate}%`}
          hint={`${s.rated_helpful} up · ${s.rated_unhelpful} down`}
        />
        <Stat
          label="Answers with citations"
          value={groundedRate === null ? "—" : `${groundedRate}%`}
          hint="Grounded in retrieved documents"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usage by model</CardTitle>
        </CardHeader>
        <CardContent>
          {data.by_model.length === 0 ? (
            <p className="text-sm text-muted-foreground">No queries recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">Model</th>
                    <th className="pb-2 pr-4 font-medium">Queries</th>
                    <th className="pb-2 font-medium">Avg latency</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_model.map((m) => (
                    <tr key={m.model} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs">{m.model}</td>
                      <td className="py-2 pr-4 tabular-nums">{m.count.toLocaleString()}</td>
                      <td className="py-2 tabular-nums">{ms(m.avg_latency_ms)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Queries per day (last 14 days)</CardTitle>
        </CardHeader>
        <CardContent>
          {data.daily.length === 0 ? (
            <p className="text-sm text-muted-foreground">No queries recorded yet.</p>
          ) : (
            <div className="flex h-32 items-end gap-1">
              {data.daily.map((d) => (
                <div key={d.day} className="flex flex-1 flex-col items-center gap-1" title={`${d.day}: ${d.count}`}>
                  <div
                    className="w-full rounded-t bg-primary/70"
                    style={{ height: `${peakDay > 0 ? (d.count / peakDay) * 100 : 0}%`, minHeight: d.count > 0 ? 2 : 0 }}
                  />
                  <span className="text-[10px] text-muted-foreground">{d.day.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recently marked unhelpful</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.recent_unhelpful.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No negative feedback yet. Answers users rate down appear here so the
              retrieval prompt can be tuned against real failures.
            </p>
          ) : (
            data.recent_unhelpful.map((g, i) => (
              <div key={i} className="rounded-md border p-3">
                <p className="text-sm">{g.query}</p>
                {g.note && <p className="mt-1 text-sm text-muted-foreground">“{g.note}”</p>}
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[10px]">{g.model_used}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(g.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
