"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, X } from "lucide-react";
import { apiClient, type AIMetrics, type AIMetricDetailRow } from "@/lib/api";

// FR-AI-015: "admin dashboard displays metrics".
//
// Every headline number is a question, so the cards that have an answer behind
// them are buttons: click one and it lists the rows that produced the figure.
// The usage chart works the same way — hover a day for the count, click it to
// see the actual queries asked that day.

type Panel = "users" | "helpful" | "unhelpful" | "citations" | "day";

const PANEL_TITLES: Record<Panel, string> = {
  users: "Who is using the assistant",
  helpful: "Answers rated helpful",
  unhelpful: "Answers rated unhelpful",
  citations: "Most-cited documents",
  day: "Queries on this day",
};

function ms(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
  return `${Math.round(value)} ms`;
}

function Stat({
  label,
  value,
  hint,
  onClick,
  active,
}: {
  label: string;
  value: string;
  hint?: string;
  onClick?: () => void;
  active?: boolean;
}) {
  const body = (
    <CardContent className="p-4 text-left">
      <div className="flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground">
        {label}
        {onClick && <ChevronRight className="h-3 w-3" />}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </CardContent>
  );

  if (!onClick) return <Card>{body}</Card>;

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-pressed={active}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`cursor-pointer transition-colors hover:border-primary/60 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active ? "border-primary bg-muted/40" : ""
      }`}
    >
      {body}
    </Card>
  );
}

function DetailPanel({
  panel,
  day,
  onClose,
}: {
  panel: Panel;
  day?: string;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<AIMetricDetailRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(null);
    setError(null);
    apiClient
      .getAIMetricsDetail(panel, day)
      .then((res) => setRows(res.rows))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load details"));
  }, [panel, day]);

  return (
    <Card className="border-primary/40">
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">
            {PANEL_TITLES[panel]}
            {day ? ` — ${day}` : ""}
          </CardTitle>
          <CardDescription>
            {rows === null ? "Loading…" : `${rows.length} shown`}
          </CardDescription>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </CardHeader>
      <CardContent>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {rows === null && !error && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}
        {rows?.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
        )}
        {rows && rows.length > 0 && (
          <ul className="divide-y">
            {rows.map((r, i) => {
              const content = (
                <div className="flex items-start gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{r.primary}</p>
                    {r.secondary && (
                      <p className="truncate text-xs text-muted-foreground">{r.secondary}</p>
                    )}
                    {r.meta && <p className="mt-0.5 text-xs text-muted-foreground">{r.meta}</p>}
                  </div>
                  {r.count !== undefined && r.count > 0 && (
                    <Badge variant="secondary" className="shrink-0 tabular-nums">
                      {r.count}
                    </Badge>
                  )}
                </div>
              );
              return (
                <li key={i}>
                  {r.link ? (
                    <Link href={r.link} className="block rounded px-1 hover:bg-muted/50">
                      {content}
                    </Link>
                  ) : (
                    content
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function AIMetricsDashboard() {
  const [data, setData] = useState<AIMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [day, setDay] = useState<string | undefined>();

  useEffect(() => {
    apiClient
      .getAIMetrics()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load AI metrics"));
  }, []);

  const open = (p: Panel, d?: string) => {
    // Clicking the open panel again closes it.
    if (panel === p && day === d) {
      setPanel(null);
      setDay(undefined);
      return;
    }
    setPanel(p);
    setDay(d);
  };

  if (error) return <p className="text-sm text-destructive">{error}</p>;

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
        <Stat
          label="Last 24 hours"
          value={s.queries_24h.toLocaleString()}
          hint={`${s.queries_7d.toLocaleString()} in 7 days`}
        />
        <Stat
          label="Unique users"
          value={s.unique_users.toLocaleString()}
          hint={`${s.sessions.toLocaleString()} sessions · click to list`}
          onClick={() => open("users")}
          active={panel === "users"}
        />
        <Stat
          label="Avg response time"
          value={ms(s.avg_latency_ms)}
          hint={`p95 ${ms(s.p95_latency_ms)} · target ≤ 5 s`}
        />
        <Stat
          label="Rated helpful"
          value={helpfulRate === null ? "—" : `${helpfulRate}%`}
          hint={`${s.rated_helpful} up · ${s.rated_unhelpful} down · click to read`}
          onClick={() => open("helpful")}
          active={panel === "helpful"}
        />
        <Stat
          label="Answers with citations"
          value={groundedRate === null ? "—" : `${groundedRate}%`}
          hint="Click for the most-cited documents"
          onClick={() => open("citations")}
          active={panel === "citations"}
        />
      </div>

      {panel && <DetailPanel panel={panel} day={day} onClose={() => setPanel(null)} />}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Queries per day (last 14 days)</CardTitle>
          <CardDescription>
            Hover a bar for the exact count, click one to read that day's queries.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.daily.length === 0 ? (
            <p className="text-sm text-muted-foreground">No queries recorded yet.</p>
          ) : (
            <div className="flex h-44 items-end gap-1">
              {data.daily.map((d) => {
                const selected = panel === "day" && day === d.day;
                return (
                  <button
                    key={d.day}
                    type="button"
                    onClick={() => open("day", d.day)}
                    aria-label={`${d.day}: ${d.count} queries`}
                    aria-pressed={selected}
                    className="group flex flex-1 cursor-pointer flex-col items-center justify-end gap-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {/* Count rides above the bar on hover so the chart stays
                        clean until you actually interrogate it. */}
                    <span
                      className={`text-xs font-medium tabular-nums transition-opacity ${
                        selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      {d.count}
                    </span>
                    <div
                      className={`w-full rounded-t transition-all ${
                        selected ? "bg-primary" : "bg-primary/60 group-hover:bg-primary"
                      }`}
                      style={{
                        height: `${peakDay > 0 ? Math.max((d.count / peakDay) * 100, d.count > 0 ? 3 : 0) : 0}%`,
                      }}
                    />
                    <span
                      className={`text-[10px] transition-colors ${
                        selected ? "font-medium text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      {d.day.slice(5)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

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
          <CardTitle className="text-base">Recently marked unhelpful</CardTitle>
          <CardDescription>
            The actionable half of the feedback loop — these are the answers to tune
            retrieval against.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.recent_unhelpful.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No negative feedback yet. Answers users rate down appear here.
            </p>
          ) : (
            data.recent_unhelpful.map((g, i) => (
              <div key={i} className="rounded-md border p-3">
                <p className="text-sm">{g.query}</p>
                {g.note && <p className="mt-1 text-sm text-muted-foreground">“{g.note}”</p>}
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {g.model_used}
                  </Badge>
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
