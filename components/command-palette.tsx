"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import {
  Library,
  FolderOpen,
  FileText,
  BookOpen,
  LayoutDashboard,
  Loader2,
} from "lucide-react";
import { apiClient, type LibraryCatalogItem, type MediaItem, type ResearchPaper, type StudentProject } from "@/lib/api";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NAV = [
  { label: "Library Catalog", href: "/catalog", icon: Library },
  { label: "Digital Archive", href: "/archive", icon: FolderOpen },
  { label: "Research Repository", href: "/research", icon: FileText },
  { label: "Student Projects", href: "/projects", icon: BookOpen },
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
];

// Global ⌘K palette: jump to a module, or live-search books + archives
// (the two modules whose list APIs support a free-text query).
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [books, setBooks] = useState<LibraryCatalogItem[]>([]);
  const [archives, setArchives] = useState<MediaItem[]>([]);
  const [papers, setPapers] = useState<ResearchPaper[]>([]);
  const [projects, setProjects] = useState<StudentProject[]>([]);
  const reqId = useRef(0);

  // Reset transient state whenever the palette closes.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setBooks([]);
      setArchives([]);
      setPapers([]);
      setProjects([]);
      setLoading(false);
    }
  }, [open]);

  // Debounced parallel search. reqId guards against out-of-order responses.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setBooks([]);
      setArchives([]);
      setPapers([]);
      setProjects([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      try {
        const [cat, arc, res, prj] = await Promise.all([
          apiClient.getLibraryCatalog({ q, page: 1, per_page: 5 }).catch(() => null),
          apiClient.getMediaItems({ q, page: 1, per_page: 5, item_type: "archive" }).catch(() => null),
          apiClient.listResearch({ q, status: "published", page: 1, per_page: 5 }).catch(() => null),
          apiClient.listProjects({ q, page: 1, per_page: 5 }).catch(() => null),
        ]);
        if (id !== reqId.current) return; // superseded
        setBooks(cat?.data ?? []);
        setArchives(arc?.data ?? []);
        setPapers(res?.data ?? []);
        setProjects(prj?.data ?? []);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
          <DialogDescription>Jump to a section or search resources</DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3">
          <CommandInput
            placeholder="Search books, archives, or jump to a section…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {loading && (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching…
              </div>
            )}

            {!loading && query.trim().length >= 2 &&
              books.length === 0 && archives.length === 0 &&
              papers.length === 0 && projects.length === 0 && (
              <CommandEmpty>No results for &ldquo;{query.trim()}&rdquo;.</CommandEmpty>
            )}

            <CommandGroup heading="Go to">
              {NAV.map((n) => (
                <CommandItem key={n.href} value={`nav ${n.label}`} onSelect={() => go(n.href)}>
                  <n.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                  {n.label}
                </CommandItem>
              ))}
            </CommandGroup>

            {books.length > 0 && (
              <CommandGroup heading="Books">
                {books.map((b) => (
                  <CommandItem
                    key={b.item_id}
                    value={`book ${b.item_id}`}
                    onSelect={() => go(`/catalog/${b.item_id}`)}
                  >
                    <Library className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span className="line-clamp-1">{b.title}</span>
                    {b.author && (
                      <span className="ml-2 line-clamp-1 text-xs text-muted-foreground">{b.author}</span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {archives.length > 0 && (
              <CommandGroup heading="Archives">
                {archives.map((a) => (
                  <CommandItem
                    key={a.item_id}
                    value={`archive ${a.item_id}`}
                    onSelect={() => go(`/archive/${a.item_id}`)}
                  >
                    <FolderOpen className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span className="line-clamp-1">{a.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {papers.length > 0 && (
              <CommandGroup heading="Research">
                {papers.map((p) => (
                  <CommandItem
                    key={p.paper_id}
                    value={`research ${p.paper_id}`}
                    onSelect={() => go(`/research/${p.paper_id}`)}
                  >
                    <FileText className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span className="line-clamp-1">{p.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {projects.length > 0 && (
              <CommandGroup heading="Projects">
                {projects.map((p) => (
                  <CommandItem
                    key={p.project_id}
                    value={`project ${p.project_id}`}
                    onSelect={() => go(`/projects/${p.project_id}`)}
                  >
                    <BookOpen className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span className="line-clamp-1">{p.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
