"use client";

import { useState, useCallback } from "react";

interface UploadFormProps {
  defaultAccessTier?: string;
  allowedFormats?: string[];
  title?: string;
  description?: string;
}

interface UploadedFile {
  file: File;
  preview: string;
}

import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { useAuth } from "@/lib/auth-context";
import { apiClient } from "@/lib/api";
import { RoleGate } from "@/components/auth/role-gate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import {
  Upload,
  FileText,
  X,
  AlertCircle,
  CheckCircle2,
  Info,
} from "lucide-react";
import { toast } from "sonner";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const accessTiers = [
  { value: "public", label: "Public", description: "Visible to everyone" },
  { value: "member", label: "Members Only", description: "Requires login" },
  { value: "staff", label: "Staff Only", description: "Staff and admins only" },
  { value: "restricted", label: "Restricted", description: "Admin approval required" },
];

// Filter access tiers based on user role
const getAvailableAccessTiers = (userRole: string | undefined) => {
  if (!userRole) return accessTiers.filter(tier => tier.value === "public");
  
  switch (userRole) {
    case "staff":
    case "admin":
    case "ai_admin":
      return accessTiers; // All tiers available
    case "member":
      return accessTiers.filter(tier => tier.value !== "restricted");
    default:
      return accessTiers.filter(tier => tier.value === "public");
  }
};

const mediaFormats = [
  { value: "pdf", label: "PDF Document", accept: ".pdf" },
  { value: "docx", label: "Word Document", accept: ".docx,.doc" },
  { value: "pptx", label: "PowerPoint", accept: ".pptx,.ppt" },
  { value: "xlsx", label: "Excel Spreadsheet", accept: ".xlsx,.xls" },
  { value: "mp4", label: "Video (MP4)", accept: ".mp4" },
  { value: "mp3", label: "Audio (MP3)", accept: ".mp3" },
  { value: "jpg", label: "Image (JPG/PNG)", accept: ".jpg,.jpeg,.png" },
];

export function UploadForm({ 
  defaultAccessTier = "public", 
  allowedFormats = ['pdf', 'docx', 'doc', 'pptx', 'mp4', 'mp3', 'jpg', 'png', 'gif'],
  title = "Upload Media",
  description = "Share your documents and media files with the CSEDU community."
}: UploadFormProps) {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [titleState, setTitle] = useState("");
  const [abstract, setAbstract] = useState("");
  const [keywords, setKeywords] = useState("");
  const [accessTier, setAccessTier] = useState(defaultAccessTier || "public");
  const [language, setLanguage] = useState("en");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setError("");
    
    if (acceptedFiles.length === 0) return;
    
    const file = acceptedFiles[0];
    
    if (file.size > MAX_FILE_SIZE) {
      setError("File size exceeds 50MB limit");
      return;
    }
    
    setUploadedFile({
      file,
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
    });
    
    // Auto-fill title from filename
    if (!title) {
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
      setTitle(nameWithoutExt.replace(/[-_]/g, " "));
    }
  }, [titleState]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    accept: allowedFormats.reduce((acc, format) => {
      const formatInfo = mediaFormats.find(f => f.value === format);
      if (formatInfo) {
        acc[formatInfo.accept] = [formatInfo.accept];
      }
      return acc;
    }, {} as Record<string, string[]>),
      "application/vnd.ms-excel": [".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "video/mp4": [".mp4"],
      "audio/mpeg": [".mp3"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
    },
  });

  const removeFile = () => {
    if (uploadedFile?.preview) {
      URL.revokeObjectURL(uploadedFile.preview);
    }
    setUploadedFile(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!uploadedFile) {
      setError("Please select a file to upload");
      return;
    }

    if (!title.trim()) {
      setError("Please enter a title");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append("file", uploadedFile.file);
      formData.append("title", title);
      formData.append("abstract", abstract);
      formData.append("keywords", keywords);
      formData.append("access_tier", accessTier);
      formData.append("language", language);

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 200);

      const result = await apiClient.uploadMedia(formData);

      clearInterval(progressInterval);
      setUploadProgress(100);

      toast.success("File uploaded successfully", {
        description: "Your file has been uploaded and is being processed.",
      });

      router.push(`/media/${result.item_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  if (!isAuthenticated) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Please <a href="/login" className="font-medium text-primary hover:underline">sign in</a> to upload files.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* File Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">File</CardTitle>
          <CardDescription>
            Upload a document, video, or image (max 50MB)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!uploadedFile ? (
            <div
              {...getRootProps()}
              className={`
                flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors cursor-pointer
                ${isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}
              `}
            >
              <input {...getInputProps()} />
              <Upload className="h-10 w-10 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground text-center">
                {isDragActive ? (
                  "Drop the file here"
                ) : (
                  <>
                    Drag and drop a file here, or <span className="text-primary font-medium">browse</span>
                  </>
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                PDF, DOCX, PPTX, XLSX, MP4, MP3, JPG, PNG
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-4 p-4 rounded-lg border border-border">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{uploadedFile.file.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatFileSize(uploadedFile.file.size)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={removeFile}
                disabled={isUploading}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Remove file</span>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Metadata */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Details</CardTitle>
          <CardDescription>
            Provide information about your upload
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              placeholder="Enter a descriptive title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              disabled={isUploading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="abstract">Abstract / Description</Label>
            <Textarea
              id="abstract"
              placeholder="Provide a brief description of the content..."
              value={abstract}
              onChange={(e) => setAbstract(e.target.value)}
              rows={4}
              disabled={isUploading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="keywords">Keywords</Label>
            <Input
              id="keywords"
              placeholder="Separate keywords with commas"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              disabled={isUploading}
            />
            <p className="text-xs text-muted-foreground">
              Keywords help with search and discovery
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="accessTier">Access Level</Label>
              <Select value={accessTier} onValueChange={setAccessTier} disabled={isUploading}>
                <SelectTrigger id="accessTier">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getAvailableAccessTiers(user?.role_tier).map((tier) => (
                    <SelectItem key={tier.value} value={tier.value}>
                      <div className="flex flex-col">
                        <span>{tier.label}</span>
                        <span className="text-xs text-muted-foreground">{tier.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="language">Language</Label>
              <Select value={language} onValueChange={setLanguage} disabled={isUploading}>
                <SelectTrigger id="language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="bn">Bangla</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upload Progress */}
      {isUploading && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-4">
              <Spinner className="h-5 w-5" />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Uploading...</span>
                  <span className="text-sm text-muted-foreground">{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submit */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Uploaded by: <Badge variant="outline">{user?.name}</Badge>
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={isUploading} onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={isUploading || !uploadedFile}>
            {isUploading ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                Uploading...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Upload File
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
