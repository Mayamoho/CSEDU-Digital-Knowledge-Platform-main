import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ModuleHeroProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

// Reusable hero band for the four core module pages
// (catalog / archive / research / projects). Pure presentational
// wrapper — no data fetching or logic change.
export function ModuleHero({
  title,
  description,
  icon,
  action,
  className,
}: ModuleHeroProps) {
  return (
    <div
      className={cn(
        "relative mb-8 overflow-hidden rounded-xl border border-border bg-card/60 p-6 sm:p-8",
        className,
      )}
    >
      {/* Soft accent glow */}
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          {icon && (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              {icon}
            </div>
          )}
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              {title}
            </h1>
            {description && (
              <p className="mt-2 max-w-2xl text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}
