"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiClient, type MediaItem } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { FileText, Clock, CheckCircle, AlertCircle, Eye, Trash2, History } from "lucide-react";
import { VersionHistory } from "@/components/media/version-history";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const statusConfig = {
  draft: {
    label: "Draft",
    icon: FileText,
    color: "bg-slate-100 text-slate-700 border-slate-200",
    description: "Not yet submitted for review"
  },
  review: {
    label: "Under Review",
    icon: Clock,
    color: "bg-yellow-100 text-yellow-700 border-yellow-200",
    description: "Being reviewed by librarian/researcher"
  },
  accepted: {
    label: "Accepted — Ready to Publish",
    icon: CheckCircle,
    color: "bg-blue-100 text-blue-700 border-blue-200",
    description: "Accepted by a reviewer, publish to make it public"
  },
  rejected: {
    label: "Rejected — Edit & Resubmit",
    icon: AlertCircle,
    color: "bg-red-100 text-red-700 border-red-200",
    description: "Declined by a reviewer, edit and submit again"
  },
  published: {
    label: "Published",
    icon: CheckCircle,
    color: "bg-green-100 text-green-700 border-green-200",
    description: "Available to authorized users"
  },
  archived: {
    label: "Archived",
    icon: AlertCircle,
    color: "bg-gray-100 text-gray-700 border-gray-200",
    description: "Moved to archive"
  }
};

// Research papers carry review state on top of the raw media status:
// accepted = still 'review' but a reviewer approved it (author must publish),
// rejected = back to 'draft' with a completed review attached.
function deriveStatus(item: MediaItem): keyof typeof statusConfig {
  if (item.item_type === "research") {
    if (item.status === "review" && item.reviewer_id) return "accepted";
    if (item.status === "draft" && item.reviewed_at) return "rejected";
  }
  return item.status;
}

export function MyUploadsContent() {
  const { user, isAuthenticated } = useAuth();
  const [uploads, setUploads] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const loadUploads = async () => {
      try {
        const response = await apiClient.getMyUploads({ per_page: 50 });
        setUploads(response.data);
      } catch (error) {
        console.error("Failed to load uploads:", error);
        // If API fails, show empty state
        setUploads([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadUploads();
  }, [isAuthenticated, user]);

  const groupedUploads = {
    draft: uploads.filter(u => u.status === 'draft'),
    review: uploads.filter(u => u.status === 'review'),
    published: uploads.filter(u => u.status === 'published'),
    archived: uploads.filter(u => u.status === 'archived')
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (uploads.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No uploads yet</h3>
          <p className="text-muted-foreground text-center mb-4">
            You haven't uploaded any documents yet. Start by uploading research papers, projects, or archives.
          </p>
          <Button onClick={() => window.location.href = '/upload/research'}>
            Upload Your First Document
          </Button>
        </CardContent>
      </Card>
    );
  }

  const UploadCard = ({ item }: { item: MediaItem }) => {
    const derivedStatus = deriveStatus(item);
    const config = statusConfig[derivedStatus] ?? statusConfig.draft;
    const StatusIcon = config.icon;
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showHistory, setShowHistory] = useState(false);

    const resolvePaperId = async (): Promise<string | undefined> => {
      if (item.paper_id) return item.paper_id;
      try {
        // Right after upload the research_papers row may not be joined yet
        // (read-after-write timing), so re-fetch the uploads before giving up.
        const fresh = await apiClient.getMyUploads({ per_page: 100 });
        setUploads(fresh.data);
        const match = fresh.data.find((u) => u.item_id === item.item_id);
        if (match?.paper_id) return match.paper_id;
        // Last resort: scan the research list (wide page so drafts past the
        // first page are still found).
        const res = await apiClient.listResearch({ per_page: 100 });
        return res?.data?.find((p) => p.item_id === item.item_id)?.paper_id;
      } catch (error) {
        console.error("Failed to resolve research paper:", error);
        return undefined;
      }
    };

    const reloadUploads = async () => {
      const response = await apiClient.getMyUploads({ per_page: 100 });
      setUploads(response.data);
    };

    const handleSubmitForReview = async () => {
      if (item.item_type !== 'research') return;

      setIsSubmitting(true);
      try {
        const paperId = await resolvePaperId();
        if (!paperId) {
          toast.error("Research paper not found");
          return;
        }
        await apiClient.submitResearchForReview(paperId);
        toast.success("Research paper submitted for review!");
        await reloadUploads();
      } catch (error) {
        console.error("Failed to submit for review:", error);
        toast.error(error instanceof Error ? error.message : "Failed to submit for review");
      } finally {
        setIsSubmitting(false);
      }
    };

    const handlePublish = async () => {
      if (item.item_type !== 'research') return;

      setIsSubmitting(true);
      try {
        const paperId = await resolvePaperId();
        if (!paperId) {
          toast.error("Research paper not found");
          return;
        }
        await apiClient.publishResearch(paperId);
        toast.success("Research paper published! It's now visible on the Research page.");
        await reloadUploads();
      } catch (error) {
        console.error("Failed to publish:", error);
        toast.error(error instanceof Error ? error.message : "Failed to publish");
      } finally {
        setIsSubmitting(false);
      }
    };

    const handleDelete = async () => {
      setIsSubmitting(true);
      try {
        await apiClient.deleteMedia(item.item_id);
        toast.success("Deleted. It's been removed from the app and the AI assistant.");
        setUploads((prev) => prev.filter((u) => u.item_id !== item.item_id));
      } catch (error) {
        console.error("Failed to delete:", error);
        toast.error(error instanceof Error ? error.message : "Failed to delete");
      } finally {
        setIsSubmitting(false);
      }
    };

    const handleViewDetails = async () => {
      if (item.item_type === 'archive') {
        window.location.href = `/archive/${item.item_id}`;
        return;
      }

      if (item.item_type === 'research') {
        const paperId = await resolvePaperId();
        if (paperId) {
          window.location.href = `/research/${paperId}`;
          return;
        }
      }

      if (item.item_type === 'project') {
        let projectId = item.project_id;
        if (!projectId) {
          try {
            const res = await apiClient.listProjects({ per_page: 100 });
            projectId = res?.data?.find((p) => p.item_id === item.item_id)?.project_id;
          } catch (error) {
            console.error("Failed to resolve project:", error);
          }
        }
        if (projectId) {
          window.location.href = `/projects/${projectId}`;
          return;
        }
      }

      toast.error(`${item.item_type} details not found`);
    };

    return (
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-lg">{item.title}</CardTitle>
              <CardDescription className="mt-1">
                Uploaded on {new Date(item.upload_date).toLocaleDateString()}
              </CardDescription>
            </div>
            <Badge className={config.color}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {config.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {derivedStatus === 'rejected' && item.review_notes && (
            <div className="mb-3 p-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-800">
              <strong>Reviewer notes:</strong> {item.review_notes}
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <FileText className="h-4 w-4" />
                {item.format.toUpperCase()}
              </span>
              <span className="flex items-center gap-1">
                <Eye className="h-4 w-4" />
                {item.access_tier}
              </span>
              <span className="capitalize">{item.item_type}</span>
            </div>
            <div className="flex gap-2">
              {item.item_type === 'research' && derivedStatus === 'draft' && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSubmitForReview}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Submitting..." : "Submit for Review"}
                </Button>
              )}
              {item.item_type === 'research' && derivedStatus === 'rejected' && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleSubmitForReview}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Submitting..." : "Resubmit for Review"}
                </Button>
              )}
              {item.item_type === 'research' && derivedStatus === 'accepted' && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={handlePublish}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Publishing..." : "Publish"}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleViewDetails}>
                {derivedStatus === 'rejected' ? "Edit Paper" : "View Details"}
              </Button>
              {/* FR-TXX-015: every edit to this item is retrievable here. */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowHistory((v) => !v)}
              >
                <History className="mr-1 h-4 w-4" />
                {showHistory ? "Hide History" : "History"}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isSubmitting}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete “{item.title}”?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently removes the {item.item_type} from the platform,
                      the catalog, and the AI assistant&apos;s knowledge. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      className="bg-destructive text-white hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          {showHistory && (
            <div className="mt-4 border-t pt-4">
              <VersionHistory itemId={item.item_id} onRestored={reloadUploads} />
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <Tabs defaultValue="all" className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="all">
          All ({uploads.length})
        </TabsTrigger>
        <TabsTrigger value="draft">
          Draft ({groupedUploads.draft.length})
        </TabsTrigger>
        <TabsTrigger value="review">
          In Review ({groupedUploads.review.length})
        </TabsTrigger>
        <TabsTrigger value="published">
          Published ({groupedUploads.published.length})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="all" className="space-y-4 mt-4">
        {uploads.map((item) => (
          <UploadCard key={item.item_id} item={item} />
        ))}
      </TabsContent>

      <TabsContent value="draft" className="space-y-4 mt-4">
        {groupedUploads.draft.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No draft documents
            </CardContent>
          </Card>
        ) : (
          groupedUploads.draft.map((item) => (
            <UploadCard key={item.item_id} item={item} />
          ))
        )}
      </TabsContent>

      <TabsContent value="review" className="space-y-4 mt-4">
        {groupedUploads.review.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No documents under review
            </CardContent>
          </Card>
        ) : (
          groupedUploads.review.map((item) => (
            <UploadCard key={item.item_id} item={item} />
          ))
        )}
      </TabsContent>

      <TabsContent value="published" className="space-y-4 mt-4">
        {groupedUploads.published.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No published documents yet
            </CardContent>
          </Card>
        ) : (
          groupedUploads.published.map((item) => (
            <UploadCard key={item.item_id} item={item} />
          ))
        )}
      </TabsContent>
    </Tabs>
  );
}
