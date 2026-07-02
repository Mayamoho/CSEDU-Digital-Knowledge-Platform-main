"use client";

import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Bookmark, Calendar, X } from "lucide-react";
import { toast } from "sonner";

interface Hold {
  hold_id: string;
  catalog_id: string;
  title: string;
  placed_at: string;
  expires_at: string | null;
  status: string;
}

export function ReservationsList() {
  const [holds, setHolds] = useState<Hold[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadHolds = async () => {
    try {
      const response = await apiClient.getMyHolds();
      setHolds(response.data);
    } catch (error) {
      console.error("Failed to load reservations:", error);
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
      toast.success("Reservation cancelled");
      await loadHolds();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to cancel reservation");
    } finally {
      setCancellingId(null);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="space-y-4">
            {[1, 2].map(i => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  const activeHolds = holds.filter(h => h.status === 'active');
  const pendingHolds = holds.filter(h => h.status === 'pending');
  const allHolds = [...pendingHolds, ...activeHolds];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bookmark className="h-5 w-5" />
          My Reservations ({allHolds.length})
        </CardTitle>
        <CardDescription>Books you've reserved that are currently unavailable</CardDescription>
      </CardHeader>
      <CardContent>
        {allHolds.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Bookmark className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No active reservations</p>
            <p className="text-sm mt-1">Reserve books from the catalog when they're unavailable</p>
          </div>
        ) : (
          <div className="space-y-4">
            {allHolds.map(hold => (
              <div key={hold.hold_id} className="flex items-center justify-between p-4 rounded-lg border border-border">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Bookmark className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">{hold.title}</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>Reserved: {new Date(hold.placed_at).toLocaleDateString()}</span>
                      {hold.expires_at && (
                        <span>• Expires: {new Date(hold.expires_at).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={hold.status === 'pending' ? 'secondary' : 'default'}>
                    {hold.status === 'pending' ? 'Pending' : 'Active'}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleCancel(hold.hold_id)}
                    disabled={cancellingId === hold.hold_id}
                    className="text-destructive hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
