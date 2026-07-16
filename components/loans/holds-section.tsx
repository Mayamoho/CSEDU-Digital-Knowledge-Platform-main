"use client";

import { useEffect, useState } from "react";
import { apiClient, type HoldItem } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Bookmark } from "lucide-react";
import { toast } from "sonner";

export function HoldsSection() {
  const [holds, setHolds] = useState<HoldItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadHolds = async () => {
    try {
      const response = await apiClient.getMyHolds();
      setHolds(response.holds);
    } catch (error) {
      console.error("Failed to load holds:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadHolds();
  }, []);

  const handleCancel = async (holdId: string) => {
    try {
      setCancellingId(holdId);
      await apiClient.cancelHold(holdId);
      toast.success("Hold cancelled");
      await loadHolds();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to cancel hold");
    } finally {
      setCancellingId(null);
    }
  };

  if (isLoading) {
    return <Skeleton className="h-32 w-full" />;
  }

  const visibleHolds = holds.filter(h => h.status !== "cancelled");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bookmark className="h-5 w-5" />
          My Holds ({visibleHolds.filter(h => h.status === "active").length})
        </CardTitle>
        <CardDescription>Reservations on books currently checked out</CardDescription>
      </CardHeader>
      <CardContent>
        {visibleHolds.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Bookmark className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No holds placed</p>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleHolds.map(hold => (
              <div
                key={hold.hold_id}
                className="flex items-center justify-between p-4 rounded-lg border"
              >
                <div>
                  <p className="font-medium">{hold.title}</p>
                  <p className="text-sm text-muted-foreground">{hold.author}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Placed {new Date(hold.placed_at).toLocaleDateString()}
                    {hold.status === "active" && ` · #${hold.queue_position} in queue`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {hold.status === "fulfilled" ? (
                    <Badge>Available — pick up now</Badge>
                  ) : (
                    <Badge variant="secondary">Waiting</Badge>
                  )}
                  {hold.status === "active" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCancel(hold.hold_id)}
                      disabled={cancellingId === hold.hold_id}
                    >
                      {cancellingId === hold.hold_id ? "Cancelling..." : "Cancel"}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
