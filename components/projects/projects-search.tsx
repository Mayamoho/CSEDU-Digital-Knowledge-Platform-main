"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

function ProjectsSearchInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") || "");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams);
    if (query.trim()) {
      params.set("q", query.trim());
    } else {
      params.delete("q");
    }
    params.delete("page");
    router.push(`/projects?${params.toString()}`);
  };

  return (
    <form onSubmit={handleSearch} className="flex gap-4">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search student projects, authors, or technologies..."
          className="pl-10"
        />
      </div>
      <Button type="submit">Search</Button>
    </form>
  );
}

export function ProjectsSearch() {
  return (
    <Suspense fallback={<div className="h-10 animate-pulse bg-muted rounded" />}>
      <ProjectsSearchInner />
    </Suspense>
  );
}
