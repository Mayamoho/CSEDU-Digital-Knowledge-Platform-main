"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiClient, ResearchPaper } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { FileText, Calendar, User, Download, Edit, ArrowLeft, AlertCircle, Send, CheckCircle, XCircle, BookOpen } from "lucide-react";
import { toast } from "sonner";

const statusConfig: Record<string, { label: string; variant: "secondary" | "outline" | "default" | "destructive" }> = {
  draft: { label: "Draft", variant: "secondary" },
  review: { label: "Under Review", variant: "outline" },
  published: { label: "Published", variant: "default" },
  archived: { label: "Archived", variant: "destructive" },
};

export function ResearchDetailView({ paperId }: { paperId: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const [paper, setPaper] = useState<ResearchPaper | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [reviewNotes, setReviewNotes] = useState("");
  const [editForm, setEditForm] = useState({
    title: "", abstract: "", authors: "", co_authors: "",
    journal: "", conference: "", doi: "", publication_date: "",
  });

  const loadPaper = async () => {
    try {
      const data = await apiClient.getResearch(paperId);
      setPaper(data);
      setEditForm({
        title: data.title,
        abstract: data.abstract,
        authors: data.authors?.join(", ") || "",
        co_authors: data.co_authors?.join(", ") || "",
        journal: data.journal || "",
        conference: data.conference || "",
        doi: data.doi || "",
        publication_date: data.publication_date || "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load paper");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadPaper(); }, [paperId]);

  const handleSubmitForReview = async () => {
    if (!paper) return;
    setIsSaving(true);
    try {
      await apiClient.submitResearchForReview(paper.paper_id);
      toast.success("Paper submitted for review");
      await loadPaper();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit for review");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!paper) return;
    setIsSaving(true);
    try {
      await apiClient.publishResearch(paper.paper_id);
      toast.success("Paper published successfully");
      await loadPaper();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to publish");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReview = async (approved: boolean) => {
    if (!paper) return;
    setIsSaving(true);
    try {
      await apiClient.reviewResearch(paper.paper_id, approved, reviewNotes);
      toast.success(approved ? "Paper accepted" : "Paper declined");
      setReviewOpen(false);
      await loadPaper();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit review");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!paper) return;
    setIsSaving(true);
    try {
      await apiClient.updateResearch(paper.paper_id, {
        title: editForm.title,
        authors: editForm.authors.split(",").map(s => s.trim()).filter(Boolean),
        co_authors: editForm.co_authors.split(",").map(s => s.trim()).filter(Boolean),
        abstract: editForm.abstract,
        keywords: paper.keywords,
        journal: editForm.journal || undefined,
        conference: editForm.conference || undefined,
        doi: editForm.doi || undefined,
        publication_date: editForm.publication_date || undefined,
      });
      toast.success("Paper updated successfully");
      setEditOpen(false);
      await loadPaper();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update paper");
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

  if (error || !paper) {
    return (
      <div className="container px-4 py-8 max-w-4xl mx-auto">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error || "Research paper not found"}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={() => router.back()} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Go Back
        </Button>
      </div>
    );
  }

  const isAuthor = user?.user_id === paper.created_by;
  const isReviewer = user?.role_tier === "researcher" && !isAuthor;
  const isAdmin = user?.role_tier === "administrator" || user?.role_tier === "librarian";
  const canEdit = isAuthor || isAdmin;
  const canSubmitForReview = isAuthor && paper.status === "draft";
  const canPublish = isAuthor && paper.status === "draft" && paper.reviewer_id != null;
  const canReview = (isReviewer || isAdmin) && paper.status === "review";

  return (
    <div className="container px-4 py-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Research
        </Button>
        <div className="flex gap-2 flex-wrap">
          {canEdit && (
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Edit className="h-4 w-4 mr-2" /> Edit
            </Button>
          )}
          {canSubmitForReview && (
            <Button onClick={handleSubmitForReview} disabled={isSaving}>
              <Send className="h-4 w-4 mr-2" /> Submit for Review
            </Button>
          )}
          {canPublish && (
            <Button onClick={handlePublish} disabled={isSaving}>
              <BookOpen className="h-4 w-4 mr-2" /> Publish
            </Button>
          )}
          {canReview && (
            <Button variant="outline" onClick={() => setReviewOpen(true)}>
              <CheckCircle className="h-4 w-4 mr-2" /> Review Paper
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <Badge variant={statusConfig[paper.status]?.variant ?? "secondary"}>
              {statusConfig[paper.status]?.label ?? paper.status}
            </Badge>
          </div>
          <CardTitle className="text-2xl">{paper.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Submitted: {new Date(paper.submitted_at).toLocaleDateString()}</span>
            </div>
            {paper.publication_date && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>Published: {paper.publication_date}</span>
              </div>
            )}
            {paper.journal && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <BookOpen className="h-4 w-4" />
                <span>Journal: <strong className="text-foreground">{paper.journal}</strong></span>
              </div>
            )}
            {paper.conference && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <BookOpen className="h-4 w-4" />
                <span>Conference: <strong className="text-foreground">{paper.conference}</strong></span>
              </div>
            )}
            {paper.doi && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <span>DOI: <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noopener noreferrer" className="text-primary underline">{paper.doi}</a></span>
              </div>
            )}
          </div>

          {paper.authors?.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Authors</h3>
              <div className="flex flex-wrap gap-2">
                {paper.authors.map((a, i) => <Badge key={i} variant="outline"><User className="h-3 w-3 mr-1" />{a}</Badge>)}
              </div>
            </div>
          )}

          {paper.co_authors?.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Co-Authors</h3>
              <div className="flex flex-wrap gap-2">
                {paper.co_authors.map((a, i) => <Badge key={i} variant="outline">{a}</Badge>)}
              </div>
            </div>
          )}

          <div>
            <h3 className="font-semibold mb-2">Abstract</h3>
            <p className="text-muted-foreground leading-relaxed">{paper.abstract}</p>
          </div>

          {paper.keywords?.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Keywords</h3>
              <div className="flex flex-wrap gap-2">
                {paper.keywords.map((k, i) => <Badge key={i} variant="secondary">{k}</Badge>)}
              </div>
            </div>
          )}

          {paper.review_notes && (
            <Alert>
              <AlertDescription>
                <strong>Review Notes:</strong> {paper.review_notes}
              </AlertDescription>
            </Alert>
          )}

          {paper.file_path && (
            <Button variant="outline" asChild>
              <a href={`/api/v1/media/${paper.item_id}/download`} download>
                <Download className="h-4 w-4 mr-2" /> Download Paper
              </a>
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Research Paper</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Title</Label>
              <Input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Authors (comma-separated)</Label>
              <Input value={editForm.authors} onChange={e => setEditForm(f => ({ ...f, authors: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Co-Authors (comma-separated)</Label>
              <Input value={editForm.co_authors} onChange={e => setEditForm(f => ({ ...f, co_authors: e.target.value }))} placeholder="Optional" />
            </div>
            <div className="space-y-1">
              <Label>Abstract</Label>
              <Textarea rows={4} value={editForm.abstract} onChange={e => setEditForm(f => ({ ...f, abstract: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Journal</Label>
              <Input value={editForm.journal} onChange={e => setEditForm(f => ({ ...f, journal: e.target.value }))} placeholder="Optional" />
            </div>
            <div className="space-y-1">
              <Label>Conference</Label>
              <Input value={editForm.conference} onChange={e => setEditForm(f => ({ ...f, conference: e.target.value }))} placeholder="Optional" />
            </div>
            <div className="space-y-1">
              <Label>DOI</Label>
              <Input value={editForm.doi} onChange={e => setEditForm(f => ({ ...f, doi: e.target.value }))} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={isSaving}>{isSaving ? "Saving..." : "Save Changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Review Dialog */}
      <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Review Research Paper</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Provide your review notes and accept or decline this paper.</p>
            <div className="space-y-1">
              <Label>Review Notes</Label>
              <Textarea rows={4} value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} placeholder="Enter your review comments..." />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReviewOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => handleReview(false)} disabled={isSaving}>
              <XCircle className="h-4 w-4 mr-2" /> Decline
            </Button>
            <Button onClick={() => handleReview(true)} disabled={isSaving}>
              <CheckCircle className="h-4 w-4 mr-2" /> Accept
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
