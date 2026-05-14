"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiClient, type MediaItem } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Clock, CheckCircle, AlertCircle, Eye } from "lucide-react";
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
    const config = statusConfig[item.status];
    const StatusIcon = config.icon;
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmitForReview = async () => {
      if (!item.item_id) return;
      
      setIsSubmitting(true);
      try {
        // For research papers, we need to get the paper_id first
        if (item.item_type === 'research') {
          const papers = await apiClient.listResearch({ status: 'draft' });
          if (!papers || !papers.data || papers.data.length === 0) {
            toast.error("Failed to load research papers");
            return;
          }
          const paper = papers.data.find((p: any) => p.item_id === item.item_id);
          
          if (paper) {
            await apiClient.submitResearchForReview(paper.paper_id);
            toast.success("Research paper submitted for review!");
            // Reload uploads
            const response = await apiClient.getMyUploads({ per_page: 50 });
            setUploads(response.data);
          } else {
            toast.error("Research paper not found");
          }
        }
      } catch (error) {
        console.error("Failed to submit for review:", error);
        toast.error(error instanceof Error ? error.message : "Failed to submit for review");
      } finally {
        setIsSubmitting(false);
      }
    };

    const handleViewDetails = () => {
      const baseUrl = item.item_type === 'research' ? '/research' : 
                      item.item_type === 'project' ? '/projects' : '/archive';
      window.location.href = `${baseUrl}/${item.item_id}`;
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
              {item.status === 'draft' && item.item_type === 'research' && (
                <Button 
                  variant="default" 
                  size="sm"
                  onClick={handleSubmitForReview}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Submitting..." : "Submit for Review"}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleViewDetails}>
                View Details
              </Button>
            </div>
          </div>
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
