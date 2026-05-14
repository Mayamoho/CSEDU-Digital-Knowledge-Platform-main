"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
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
  Clock,
} from "lucide-react";
import { toast } from "sonner";

interface UploadFormProps {
  defaultAccessTier?: string;
  allowedFormats?: string[];
  title?: string;
  description?: string;
  itemType?: 'archive' | 'research' | 'project';
}

interface UploadedFile {
  file: File;
  preview: string;
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const accessTiers = [
  { value: "public", label: "Public", description: "Visible to everyone" },
  { value: "student", label: "Students+", description: "Students and above" },
  { value: "researcher", label: "Researchers+", description: "Researchers and above" },
  { value: "librarian", label: "Librarians+", description: "Librarians and above" },
  { value: "restricted", label: "Restricted", description: "Admin approval required" },
];

const mediaFormats = [
  { value: "pdf", label: "PDF Document", accept: "application/pdf", extensions: [".pdf"] },
  { value: "docx", label: "Word Document", accept: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extensions: [".docx"] },
  { value: "doc", label: "Word Document (Legacy)", accept: "application/msword", extensions: [".doc"] },
  { value: "pptx", label: "PowerPoint", accept: "application/vnd.openxmlformats-officedocument.presentationml.presentation", extensions: [".pptx"] },
  { value: "ppt", label: "PowerPoint (Legacy)", accept: "application/vnd.ms-powerpoint", extensions: [".ppt"] },
  { value: "xlsx", label: "Excel Spreadsheet", accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extensions: [".xlsx"] },
  { value: "xls", label: "Excel (Legacy)", accept: "application/vnd.ms-excel", extensions: [".xls"] },
  { value: "mp4", label: "Video (MP4)", accept: "video/mp4", extensions: [".mp4"] },
  { value: "mp3", label: "Audio (MP3)", accept: "audio/mpeg", extensions: [".mp3"] },
  { value: "jpg", label: "Image (JPG)", accept: "image/jpeg", extensions: [".jpg", ".jpeg"] },
  { value: "png", label: "Image (PNG)", accept: "image/png", extensions: [".png"] },
  { value: "gif", label: "Image (GIF)", accept: "image/gif", extensions: [".gif"] },
];

// Filter access tiers based on user role
const getAvailableAccessTiers = (userRole: string | undefined) => {
  if (!userRole) return accessTiers.filter(tier => tier.value === "public");
  
  switch (userRole) {
    case "researcher":
    case "librarian":
    case "administrator":
      return accessTiers; // All tiers available
    case "student":
      return accessTiers.filter(tier => tier.value !== "restricted");
    default:
      return accessTiers.filter(tier => tier.value === "public");
  }
};

export function UploadForm({ 
  defaultAccessTier = "public", 
  allowedFormats = ['pdf', 'docx', 'doc', 'pptx', 'mp4', 'mp3', 'jpg', 'png', 'gif'],
  title = "Upload Media",
  description = "Share your documents and media files with the CSEDU community.",
  itemType = "archive"
}: UploadFormProps) {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [titleState, setTitle] = useState("");
  const [abstract, setAbstract] = useState("");
  const [keywords, setKeywords] = useState("");
  const [accessTier, setAccessTier] = useState(defaultAccessTier);
  const [language, setLanguage] = useState("en");
  const [status, setStatus] = useState<"draft" | "review" | "published">("published");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setError("");
    
    if (acceptedFiles.length === 0) return;
    
    const file = acceptedFiles[0];
    
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
      setError("File size exceeds 50MB limit");
      return;
    }
    
    // Check file format
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    const isAllowedFormat = allowedFormats.some(format => {
      const formatInfo = mediaFormats.find(f => f.value === format);
      return formatInfo?.extensions.some(ext => ext === fileExtension);
    });
    
    if (!isAllowedFormat) {
      setError(`File format not allowed. Allowed formats: ${allowedFormats.join(', ')}`);
      return;
    }
    
    setUploadedFile({
      file,
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
    });
    
    // Auto-fill title from filename
    if (!titleState) {
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
      setTitle(nameWithoutExt.replace(/[-_]/g, " "));
    }
  }, [titleState, allowedFormats]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    accept: allowedFormats.reduce((acc, format) => {
      const formatInfo = mediaFormats.find(f => f.value === format);
      if (formatInfo) {
        acc[formatInfo.accept] = formatInfo.extensions;
      }
      return acc;
    }, {} as Record<string, string[]>),
  });

  const removeFile = () => {
    setUploadedFile(null);
    setTitle("");
    setAbstract("");
    setKeywords("");
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!uploadedFile) {
      setError("Please select a file to upload");
      return;
    }
    
    if (!titleState.trim()) {
      setError("Please enter a title");
      return;
    }
    
    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      const formData = new FormData();
      formData.append('file', uploadedFile.file);
      formData.append('title', titleState);
      formData.append('description', abstract);
      formData.append('keywords', keywords);
      formData.append('access_tier', accessTier);
      formData.append('language', language);
      formData.append('status', status);
      formData.append('item_type', itemType);

      const result = await apiClient.uploadMedia(formData);

      const statusMessage = status === 'published'
        ? "File published successfully! It's now available to everyone."
        : status === 'draft'
        ? "File saved as draft! You can submit for review later."
        : "File submitted for review! It will be reviewed by a librarian or researcher.";

      toast.success(statusMessage);
      removeFile();
      
      // Redirect based on item type
      const redirectPath = itemType === 'archive' ? '/archive' 
        : itemType === 'research' ? '/research'
        : itemType === 'project' ? '/projects'
        : '/my-uploads';
      router.push(redirectPath);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  if (!isAuthenticated) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Please <Link href="/login" className="font-medium text-primary hover:underline">sign in</Link> to upload files.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* File Upload */}
          <div className="space-y-2">
            <Label>Upload File</Label>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
              }`}
            >
              <input {...getInputProps()} className="hidden" />
              {uploadedFile ? (
                <div className="space-y-4">
                  {uploadedFile.preview && (
                    <img
                      src={uploadedFile.preview}
                      alt="Preview"
                      className="mx-auto h-32 w-32 object-cover rounded-lg"
                    />
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{uploadedFile.file.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {(uploadedFile.file.size / 1024 / 1024).toFixed(2)} MB
                    </Badge>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={removeFile}
                    disabled={isUploading}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Drag and drop your file here, or click to select
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Maximum file size: 50MB
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={titleState}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter a descriptive title"
                disabled={isUploading}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="accessTier">Access Level</Label>
              <Select value={accessTier} onValueChange={setAccessTier} disabled={isUploading}>
                <SelectTrigger>
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
              <Label htmlFor="status">Publication Status</Label>
              <Select value={status} onValueChange={(value: "draft" | "review" | "published") => setStatus(value)} disabled={isUploading}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="published">
                    <div className="flex flex-col">
                      <span className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4" />
                        Publish Immediately
                      </span>
                      <span className="text-xs text-muted-foreground">Make available to everyone immediately</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="draft">
                    <div className="flex flex-col">
                      <span className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Save as Draft
                      </span>
                      <span className="text-xs text-muted-foreground">Continue editing later, submit for review when ready</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="review">
                    <div className="flex flex-col">
                      <span className="flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Submit for Review
                      </span>
                      <span className="text-xs text-muted-foreground">Submit to librarian/researcher for approval</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="abstract">Abstract</Label>
            <Textarea
              id="abstract"
              value={abstract}
              onChange={(e) => setAbstract(e.target.value)}
              placeholder="Provide a brief description of the content"
              rows={3}
              disabled={isUploading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="keywords">Keywords</Label>
            <Input
              id="keywords"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="Enter tags separated by commas (e.g., AI, machine learning, research)"
              disabled={isUploading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="language">Language</Label>
            <Select value={language} onValueChange={setLanguage} disabled={isUploading}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="bn">বাংলা</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Upload Progress */}
          {isUploading && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Spinner className="h-4 w-4" />
                <span className="text-sm">Uploading...</span>
              </div>
              <Progress value={uploadProgress} className="w-full" />
            </div>
          )}

          <Button 
            type="submit" 
            onClick={handleSubmit}
            disabled={!uploadedFile || !titleState.trim() || isUploading}
            className="w-full"
          >
            {isUploading ? (
              <>
                <Spinner className="mr-2 h-4 w-4" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload File
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
