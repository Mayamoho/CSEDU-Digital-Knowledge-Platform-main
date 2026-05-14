"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiClient, StudentProject } from "@/lib/api";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BookOpen, Calendar, User, Users, Star, ExternalLink, Github, Globe, Smartphone } from "lucide-react";

const statusConfig = {
  draft: { label: "Draft", variant: "secondary" as const },
  review: { label: "Under Review", variant: "outline" as const },
  published: { label: "Published", variant: "default" as const },
  archived: { label: "Archived", variant: "destructive" as const },
};

function ProjectsGridInner() {
  const searchParams = useSearchParams();
  const [projects, setProjects] = useState<StudentProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);

  const query = searchParams.get("q") || "";
  const page = parseInt(searchParams.get("page") || "1");
  const perPage = 12;

  useEffect(() => {
    const fetchProjects = async () => {
      setIsLoading(true);
      try {
        const response = await apiClient.listProjects();
        // Ensure we always have an array, even if response is malformed
        const projectsData = response?.data || [];
        setProjects(Array.isArray(projectsData) ? projectsData : []);
        setTotal(response?.total || 0);
      } catch (error) {
        console.error('Failed to fetch projects:', error);
        setProjects([]);
        setTotal(0);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProjects();
  }, [query, page]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="space-y-2">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
              <CardFooter>
                <Skeleton className="h-9 w-full" />
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!projects || !Array.isArray(projects) || projects.length === 0) {
    return (
      <Empty>
        <EmptyMedia variant="icon">
          <BookOpen className="h-6 w-6" />
        </EmptyMedia>
        <EmptyTitle>No projects found</EmptyTitle>
        <EmptyDescription>
          {query
            ? `No projects match "${query}". Try adjusting your search or filters.`
            : "No projects have been published yet."}
        </EmptyDescription>
      </Empty>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Showing {projects.length} of {total} projects
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <Card key={project.project_id} className="flex flex-col">
            <CardHeader className="flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <BookOpen className="h-5 w-5 text-primary" />
                </div>
                <Badge variant={statusConfig[project.status].variant}>
                  {statusConfig[project.status].label}
                </Badge>
              </div>
              <h3 className="mt-3 font-semibold leading-tight line-clamp-2">
                {project.title}
              </h3>
              {project.abstract && (
                <p className="mt-2 text-sm text-muted-foreground line-clamp-3">
                  {project.abstract}
                </p>
              )}
              <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{project.academic_year}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  <span className="line-clamp-1">
                    {project.team_members.length} member{project.team_members.length !== 1 ? 's' : ''}
                  </span>
                </div>
                {project.course_code && (
                  <div className="flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5" />
                    <span>{project.course_code}</span>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {project.keywords && project.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {project.keywords.slice(0, 3).map((keyword, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {keyword}
                    </Badge>
                  ))}
                  {project.keywords.length > 3 && (
                    <Badge variant="secondary" className="text-xs">
                      +{project.keywords.length - 3}
                    </Badge>
                  )}
                </div>
              )}
              
              {/* Project Links */}
              <div className="flex flex-wrap gap-2 mb-3">
                {project.web_url && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={project.web_url} target="_blank" rel="noopener noreferrer">
                      <Globe className="h-3 w-3 mr-1" />
                      Demo
                    </a>
                  </Button>
                )}
                {project.github_repo && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={project.github_repo} target="_blank" rel="noopener noreferrer">
                      <Github className="h-3 w-3 mr-1" />
                      Code
                    </a>
                  </Button>
                )}
                {project.app_download && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={project.app_download} target="_blank" rel="noopener noreferrer">
                      <Smartphone className="h-3 w-3 mr-1" />
                      App
                    </a>
                  </Button>
                )}
              </div>
            </CardContent>
            <CardFooter className="pt-0">
              <Button variant="outline" className="w-full" asChild>
                <Link href={`/projects/${project.project_id}`}>View Details</Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      {Math.ceil(total / perPage) > 1 && (
        <div className="flex justify-center mt-6">
          <div className="text-sm text-muted-foreground">
            Page {page} of {Math.ceil(total / perPage)}
          </div>
        </div>
      )}
    </div>
  );
}

export function ProjectsGrid() {
  return (
    <Suspense fallback={<div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="h-5 w-32 animate-pulse bg-muted rounded" />
        <div className="h-10 w-40 animate-pulse bg-muted rounded" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-64 animate-pulse bg-muted rounded" />
        ))}
      </div>
    </div>}>
      <ProjectsGridInner />
    </Suspense>
  );
}
