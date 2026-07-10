"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function ResearchError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the underlying client exception for debugging instead of
    // letting the whole route fail to load with no diagnostics.
    console.error("Research page error:", error);
  }, [error]);

  return (
    <div className="container flex flex-col items-center justify-center gap-4 px-4 py-24 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <h2 className="text-xl font-semibold text-foreground">
        Something went wrong loading research
      </h2>
      <p className="max-w-md text-sm text-muted-foreground">
        The research repository failed to load. This is usually temporary — try again.
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
