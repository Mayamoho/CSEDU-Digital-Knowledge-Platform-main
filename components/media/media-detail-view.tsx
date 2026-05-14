"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiClient } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { 
  FileText, 
  Download, 
  Calendar, 
  User, 
  Tag, 
  AlertCircle,
  ArrowLeft,
  Edit
} from "lucide-react";
import { toast } from "sonner";

interface MediaDetailViewProps {
  itemId: string;
  itemType: string;
}

export function MediaDetailView({ itemId, itemType }: MediaDetailViewProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [item, setItem] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", abstract: "", keywords: "" });

  const loadItem = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.getMediaItem(itemId);
      setItem(data);
      setEditForm({
        title: data.title || "",
        abstract: data.metadata?.abstract || "",
        keywords: data.metadata?.keywords?.join(", ") || "",
      });
    } catch (err) {
      console.error("Failed to load item:", err);
      setError(err instanceof Error ? err.message : "Failed to load item");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadItem(); }, [itemId]);

  const handleDownload = async () => {
    window.location.href = `/api/v1/media/${itemId}/download`;
  };

  const handleSaveEdit = async () => {
    setIsSaving(true);
    try {
      await apiClient.updateMediaMetadata(itemId, {
        title: editForm.title,
        abstract: editForm.abstract,
        keywords: editForm.keywords.split(",").map(k => k.trim()).filter(Boolean),
      });
      toast.success("Updated successfully");
      setEditOpen(false);
      await loadItem();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container max-w-4xl px-4 py-8">
        <Skeleton className="h-8 w-32 mb-6" />
        <Card>
          <CardHeader><Skeleton className="h-8 w-3/4" /></CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="container max-w-4xl px-4 py-8">
        <Button variant="ghost" onClick={() => router.back()} className="mb-6">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error || "Item not found"}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const canEdit = user && (user.user_id === item.created_by || user.role_tier === "administrator" || user.role_tier === "librarian");

  return (
    <div className="container max-w-4xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        {canEdit && (
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Edit className="h-4 w-4 mr-2" /> Edit
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <CardTitle className="text-2xl mb-2">{item.title}</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Badge variant={item.status === 'published' ? 'default' : item.status === 'review' ? 'secondary' : 'outline'}>
                  {item.status}
                </Badge>
                <Badge variant="outline">{item.item_type}</Badge>
                <Badge variant="outline">{item.format?.toUpperCase()}</Badge>
                <Badge variant="outline">{item.access_tier}</Badge>
              </div>
            </div>
            {item.file_path && (
              <Button onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" /> Download
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Uploaded: {new Date(item.upload_date).toLocaleDateString()}</span>
            </div>
            {item.created_by && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <User className="h-4 w-4" />
                <span>By: {item.created_by}</span>
              </div>
            )}
          </div>

          {item.metadata?.abstract && (
            <div>
              <h3 className="font-semibold mb-2">Abstract</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{item.metadata.abstract}</p>
            </div>
          )}

          {item.metadata?.keywords?.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2 flex items-center gap-2">
                <Tag className="h-4 w-4" /> Keywords
              </h3>
              <div className="flex flex-wrap gap-2">
                {item.metadata.keywords.map((keyword: string, index: number) => (
                  <Badge key={index} variant="secondary">{keyword}</Badge>
                ))}
              </div>
            </div>
          )}

          {item.metadata?.language && (
            <div className="text-sm text-muted-foreground">
              Language: {item.metadata.language === 'en' ? 'English' : item.metadata.language === 'bn' ? 'বাংলা' : item.metadata.language}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Item</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Title</Label>
              <Input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Abstract / Description</Label>
              <Textarea rows={4} value={editForm.abstract} onChange={e => setEditForm(f => ({ ...f, abstract: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Keywords (comma-separated)</Label>
              <Input value={editForm.keywords} onChange={e => setEditForm(f => ({ ...f, keywords: e.target.value }))} />
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
