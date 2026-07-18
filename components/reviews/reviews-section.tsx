"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, Loader2 } from "lucide-react";
import { apiClient, type ResourceReview } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

function Stars({ value, onChange }: { value: number; onChange?: (n: number) => void }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          className={onChange ? "cursor-pointer" : "cursor-default"}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
        >
          <Star
            className={`h-4 w-4 ${n <= value ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40"}`}
          />
        </button>
      ))}
    </div>
  );
}

export function ReviewsSection({ itemId }: { itemId: string }) {
  const { isAuthenticated } = useAuth();
  const [reviews, setReviews] = useState<ResourceReview[]>([]);
  const [average, setAverage] = useState(0);
  const [count, setCount] = useState(0);
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      const res = await apiClient.listReviews(itemId);
      setReviews(res.reviews || []);
      setAverage(res.average || 0);
      setCount(res.count || 0);
    } catch {
      /* leave empty */
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const submit = async () => {
    if (rating < 1) {
      toast.error("Pick a star rating first.");
      return;
    }
    setSubmitting(true);
    try {
      await apiClient.submitReview(itemId, rating, body.trim());
      toast.success("Review submitted.");
      setBody("");
      setRating(0);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to submit review.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span>Reviews &amp; ratings</span>
          {count > 0 && (
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
              {average.toFixed(1)} · {count} review{count !== 1 ? "s" : ""}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isAuthenticated && (
          <div className="space-y-2 rounded-lg border border-border p-3">
            <Stars value={rating} onChange={setRating} />
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Share your thoughts (optional)…"
              className="min-h-[60px] resize-none text-sm"
            />
            <Button size="sm" onClick={submit} disabled={submitting}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Submit review
            </Button>
          </div>
        )}

        {reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reviews yet. Be the first to review.</p>
        ) : (
          <ul className="space-y-3">
            {reviews.map((r) => (
              <li key={r.review_id} className="border-b border-border pb-3 last:border-0">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{r.user_name}</span>
                  <Stars value={r.rating} />
                </div>
                {r.body && <p className="mt-1 text-sm text-muted-foreground">{r.body}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
