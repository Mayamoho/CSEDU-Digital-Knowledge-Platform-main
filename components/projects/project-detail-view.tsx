"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiClient, StudentProject } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { BookOpen, Calendar, Users, User, ExternalLink, Github, Globe, Smartphone, Download, Edit, ArrowLeft, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const statusConfig: Record<string, { label: string; variant: "secondary" | "outline" | "default" | "destructive" }> = {
  draft: { label: "Draft", variant: "secondary" },
  review: { label: "Under Review", variant: "outline" },
  published: { label: "Published", variant: "default" },
  archived: { label: "Archived", variant: "destructive" },
};

export function ProjectDetailView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const [project, setProject] = useState<StudentProject | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", abstract: "", web_url: "", github_repo: "", app_download: "", course_code: "" });

  useEffect(() => {
    apiClient.getProject(projectId)
      .then(data => { setProject(data); setEditForm({ title: data.title, abstract: data.abstract, web_url: data.web_url || "", github_repo: data.github_repo || "", app_download: data.app_download || "", course_code: data.course_code || "" }); })
      .catch(err => setError(err instanceof Error ? err.message : "Failed to load project"))
      .finally(() => setIsLoading(false));
  }, [projectId]);

  const handleSaveEdit = async () => {
    if (!project) return;
    setIsSaving(true);
    try {
      await apiClient.updateProject(project.project_id, {
        title: editForm.title,
        team_members: project.team_members,
        academic_year: project.academic_year,
        abstract: editForm.abstract,
        keywords: project.keywords,
        course_code: editForm.course_code || undefined,
        web_url: editForm.web_url || undefined,
        github_repo: editForm.github_repo || undefined,
        app_download: editForm.app_download || undefined,
      });
      toast.success("Project updated successfully");
      setEditOpen(false);
      const updated = await apiClient.getProject(projectId);
      setProject(updated);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update project");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container px-4 py-8 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="container px-4 py-8 max-w-4xl mx-auto">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error || "Project not found"}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => router.back()} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Go Back
        </Button>
      </div>
    );
  }

  const canEdit = user && (user.user_id === project.created_by || user.role_tier === "administrator" || user.role_tier === "librarian");

  return (
    <div className="container px-4 py-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Projects
        </Button>
        {canEdit && (
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Edit className="h-4 w-4 mr-2" /> Edit Project
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <BookOpen className="h-6 w-6 text-primary" />
            </div>
            <Badge variant={statusConfig[project.status]?.variant ?? "secondary"}>
              {statusConfig[project.status]?.label ?? project.status}
            </Badge>
          </div>
          <CardTitle className="text-2xl">{project.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Academic Year: <strong className="text-foreground">{project.academic_year}</strong></span>
            </div>
            {project.course_code && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <BookOpen className="h-4 w-4" />
                <span>Course: <strong className="text-foreground">{project.course_code}</strong></span>
              </div>
            )}
            <div className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4" />
              <span>{project.team_members.length} team member{project.team_members.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Submitted: {new Date(project.submitted_at).toLocaleDateString()}</span>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Team Members</h3>
            <div className="flex flex-wrap gap-2">
              {project.team_members.map((m, i) => (
                <Badge key={i} variant="outline"><User className="h-3 w-3 mr-1" />{m}</Badge>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-2">Description</h3>
            <p className="text-muted-foreground leading-relaxed">{project.abstract}</p>
          </div>

          {project.keywords?.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Keywords</h3>
              <div className="flex flex-wrap gap-2">
                {project.keywords.map((k, i) => <Badge key={i} variant="secondary">{k}</Badge>)}
              </div>
            </div>
          )}

          <div>
            <h3 className="font-semibold mb-3">Project Links</h3>
            <div className="flex flex-wrap gap-3">
              {project.web_url && (
                <Button variant="outline" asChild>
                  <a href={project.web_url} target="_blank" rel="noopener noreferrer">
                    <Globe className="h-4 w-4 mr-2" /> Live Demo <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </Button>
              )}
              {project.github_repo && (
                <Button variant="outline" asChild>
                  <a href={project.github_repo} target="_blank" rel="noopener noreferrer">
                    <Github className="h-4 w-4 mr-2" /> Source Code <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </Button>
              )}
              {project.app_download && (
                <Button variant="outline" asChild>
                  <a href={project.app_download} target="_blank" rel="noopener noreferrer">
                    <Smartphone className="h-4 w-4 mr-2" /> Download App <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </Button>
              )}
              {project.file_path && (
                <Button variant="outline" asChild>
                  <a href={`/api/v1/media/${project.item_id}/download`} download>
                    <Download className="h-4 w-4 mr-2" /> Download File
                  </a>
                </Button>
              )}
              {!project.web_url && !project.github_repo && !project.app_download && !project.file_path && (
                <p className="text-sm text-muted-foreground">No additional resources available</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Title</Label>
              <Input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Course Code</Label>
              <Input value={editForm.course_code} onChange={e => setEditForm(f => ({ ...f, course_code: e.target.value }))} placeholder="Optional" />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea rows={4} value={editForm.abstract} onChange={e => setEditForm(f => ({ ...f, abstract: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Web / Demo URL</Label>
              <Input value={editForm.web_url} onChange={e => setEditForm(f => ({ ...f, web_url: e.target.value }))} placeholder="https://" />
            </div>
            <div className="space-y-1">
              <Label>GitHub Repository</Label>
              <Input value={editForm.github_repo} onChange={e => setEditForm(f => ({ ...f, github_repo: e.target.value }))} placeholder="https://github.com/..." />
            </div>
            <div className="space-y-1">
              <Label>App Download Link</Label>
              <Input value={editForm.app_download} onChange={e => setEditForm(f => ({ ...f, app_download: e.target.value }))} placeholder="https://" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={isSaving}>{isSaving ? "Saving..." : "Save Changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
