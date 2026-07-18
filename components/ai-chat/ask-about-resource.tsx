"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Send, Loader2 } from "lucide-react";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

type Kind = "research" | "project" | "archive";

// Per-resource AI assistant. Unlike the global floating widget, this one is
// scoped to a single document: it looks up the resource title and prefixes the
// user's question with it so retrieval + the LLM focus on that item.
export function AskAboutResource({ id, kind }: { id: string; kind: Kind }) {
  const { isAuthenticated } = useAuth();
  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const item =
          kind === "research"
            ? await apiClient.getResearch(id)
            : kind === "project"
              ? await apiClient.getProject(id)
              : await apiClient.getMediaItem(id);
        if (alive) setTitle((item as { title?: string })?.title || "");
      } catch {
        /* title is best-effort */
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, kind]);

  const ask = async () => {
    const q = question.trim();
    if (!q || loading) return;
    setLoading(true);
    setAnswer("");
    const scoped = title ? `Regarding the ${kind} titled "${title}": ${q}` : q;
    try {
      const resp = await apiClient.streamChat(scoped);
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let got = false;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let sep: number;
        while ((sep = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, sep);
          buffer = buffer.slice(sep + 2);
          let event = "message";
          let data = "";
          for (const raw of frame.split("\n")) {
            const line = raw.trimEnd();
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          if (event === "token" && data) {
            try {
              const o = JSON.parse(data);
              if (o.text) {
                got = true;
                setAnswer((a) => a + o.text);
              }
            } catch {
              /* ignore */
            }
          }
        }
      }
      if (!got) throw new Error("empty");
    } catch {
      // Fallback to the non-streaming call.
      try {
        const r = await apiClient.sendChatMessage(scoped);
        setAnswer(r.response);
      } catch {
        setAnswer("Sorry, the assistant is unavailable right now. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) return null;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          Ask AI about this {kind}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={`Ask a question about this ${kind}…`}
            className="min-h-[52px] resize-none text-sm"
            disabled={loading}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                ask();
              }
            }}
          />
          <Button onClick={ask} disabled={!question.trim() || loading} size="sm" className="self-end">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        {answer && (
          <div className="rounded-lg bg-muted p-3 text-sm leading-relaxed whitespace-pre-wrap">
            {answer}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
