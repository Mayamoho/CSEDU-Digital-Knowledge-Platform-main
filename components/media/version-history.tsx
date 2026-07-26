"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { History, RotateCcw } from "lucide-react";
import { apiClient, type MediaVersion } from "@/lib/api";
import { toast } from "sonner";

// FR-TXX-015: "all edits tracked, previous versions retrievable".
//
// Each row is the state the item was in *before* one edit, newest first. The
// live item is whatever is on screen elsewhere, so restoring a row rolls the
// item back to that point — and because the restore snapshots the current state
// first, it can itself be undone.

export function VersionHistory({
  itemId,
  onRestored,
}: {
  itemId: string;
  onRestored?: () => void;
}) {
  const [versions, setVersions] = useState<MediaVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<number | null>(null);

  const load = async () => {
    try {
      const res = await apiClient.getVersions(itemId);
      setVersions(res.versions);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load version history");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const restore = async (versionNo: number) => {
    setRestoring(versionNo);
    try {
      await apiClient.restoreVersion(itemId, versionNo);
      toast.success(`Restored version ${versionNo}`);
      await load();
      onRestored?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not restore this version");
    } finally {
      setRestoring(null);
    }
  };

  if (error) return <p className="text-sm text-destructive">{error}</p>;

  if (versions === null) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No earlier versions yet. A snapshot is saved automatically every time you
        edit this item's details or replace its file.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {versions.map((v) => (
        <li key={v.version_no} className="rounded-md border p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[10px]">v{v.version_no}</Badge>
            <span className="text-sm font-medium">{v.title}</span>
            <span className="text-xs text-muted-foreground">
              {new Date(v.created_at).toLocaleString()}
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-7"
              disabled={restoring !== null}
              onClick={() => restore(v.version_no)}
            >
              <RotateCcw className="mr-1 h-3 w-3" />
              {restoring === v.version_no ? "Restoring…" : "Restore"}
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <History className="h-3 w-3" />
            <span>{v.change_note || "edited"}</span>
            <span>·</span>
            <span>{v.status}</span>
            <span>·</span>
            <span>{v.access_tier}</span>
            {v.keywords.length > 0 && (
              <>
                <span>·</span>
                <span className="truncate">{v.keywords.join(", ")}</span>
              </>
            )}
          </div>
          {v.abstract && (
            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{v.abstract}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
