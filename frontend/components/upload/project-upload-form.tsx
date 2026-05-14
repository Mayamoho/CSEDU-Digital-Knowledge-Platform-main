"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { useAuth } from "@/lib/auth-context";
import { apiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { Upload, FileText, X, AlertCircle, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export function ProjectUploadForm() {
  const router = useRouter();
  const { user } = useAuth();
  
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [teamMembers, setTeamMembers] = useState<string[]>([""]);
  const [supervisorId, setSupervisorId] = useState("");
  const [academicYear, setAcademicYear] = useState(new Date().getFullYear().toString());
  const [courseCode, setCourseCode] = useState("");
  const [abstract, setAbstract] = useState("");
  const [keywords, setKeywords] = useState<string[]>([""]);
  const [webUrl, setWebUrl] = useState("");
  const [githubRepo, setGithubRepo] = useState("");
  const [appDownload, setAppDownload] = useState("");
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
    
    setUploadedFile(file);
    
    if (!title) {
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
      setTitle(nameWithoutExt.replace(/[-_]/g, " "));
    }
  }, [title]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: 1,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
      'application/vnd.ms-powerpoint': ['.ppt'],
      'application/zip': ['.zip'],
      'application/x-zip-compressed': ['.zip'],
      'video/mp4': ['.mp4'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'application/vnd.android.package-archive': ['.apk'],
    },
  });

  const addTeamMember = () => setTeamMembers([...teamMembers, ""]);
  const removeTeamMember = (index: number) => setTeamMembers(teamMembers.filter((_, i) => i !== index));
  const updateTeamMember = (index: number, value: string) => {
    const newMembers = [...teamMembers];
    newMembers[index] = value;
    setTeamMembers(newMembers);
  };

  const addKeyword = () => setKeywords([...keywords, ""]);
  const removeKeyword = (index: number) => setKeywords(keywords.filter((_, i) => i !== index));
  const updateKeyword = (index: number, value: string) => {
    const newKeywords = [...keywords];
    newKeywords[index] = value;
    setKeywords(newKeywords);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      setError("Please enter a title");
      return;
    }

    const validMembers = teamMembers.filter(m => m.trim());
    if (validMembers.length === 0) {
      setError("Please add at least one team member");
      return;
    }

    if (!abstract.trim()) {
      setError("Please enter an abstract");
      return;
    }

    const year = parseInt(academicYear);
    if (year < 2000 || year > 2100) {
      setError("Please enter a valid academic year (2000-2100)");
      return;
    }

    // Check if at least one of file, web URL, GitHub repo, or app download is provided
    if (!uploadedFile && !webUrl.trim() && !githubRepo.trim() && !appDownload.trim()) {
      setError("Please provide at least one of: file upload, web URL, GitHub repository, or app download link");
      return;
    }
    
    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      let filePath: string | undefined;
      
      // Upload file if provided
      if (uploadedFile) {
        const formData = new FormData();
        formData.append('file', uploadedFile);
        formData.append('title', title);
        formData.append('description', abstract);
        formData.append('keywords', keywords.filter(k => k.trim()).join(','));
        formData.append('access_tier', 'student');
        formData.append('language', 'en');
        formData.append('status', 'published');
        formData.append('item_type', 'project');

        const mediaResult = await apiClient.uploadMedia(formData);
        filePath = mediaResult.file_path || undefined;
      }
      
      // Create project entry
      await apiClient.submitProject({
        title,
        team_members: validMembers,
        supervisor_id: supervisorId || undefined,
        academic_year: year,
        course_code: courseCode || undefined,
        abstract,
        keywords: keywords.filter(k => k.trim()),
        file_path: filePath,
        web_url: webUrl || undefined,
        github_repo: githubRepo || undefined,
        app_download: appDownload || undefined,
      });

      toast.success("Project published successfully! It's now visible in the projects showcase.");
      router.push('/projects');
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-4xl mx-auto space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload Student Project</CardTitle>
          <CardDescription>
            Submit your student project, final year work, or creative achievement. You can upload files, provide web links, or both. Projects will be reviewed by staff before publication.
          </CardDescription>
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
            <Label>Upload Project File (Optional)</Label>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
              }`}
            >
              <input {...getInputProps()} />
              {uploadedFile ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{uploadedFile.name}</span>
                    <Badge variant="secondary" className="text-xs">
                      {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB
                    </Badge>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setUploadedFile(null);
                    }}
                    disabled={isUploading}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Remove
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Drag and drop your project file here, or click to select
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PDF, DOCX, PPTX, MP4, JPG, PNG, ZIP, APK • Maximum 50MB
                  </p>
                  <p className="text-xs text-muted-foreground font-medium">
                    File upload is optional - you can also provide web links below
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Project Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter the title of your project"
              disabled={isUploading}
              required
            />
          </div>

          {/* Team Members */}
          <div className="space-y-2">
            <Label>Team Members * (Student names or IDs)</Label>
            {teamMembers.map((member, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={member}
                  onChange={(e) => updateTeamMember(index, e.target.value)}
                  placeholder="Team member name"
                  disabled={isUploading}
                />
                {teamMembers.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => removeTeamMember(index)}
                    disabled={isUploading}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addTeamMember}
              disabled={isUploading}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Team Member
            </Button>
          </div>

          {/* Project Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="academicYear">Academic Year *</Label>
              <Input
                id="academicYear"
                type="number"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="2024"
                min="2000"
                max="2100"
                disabled={isUploading}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="courseCode">Course Code (Optional)</Label>
              <Input
                id="courseCode"
                value={courseCode}
                onChange={(e) => setCourseCode(e.target.value)}
                placeholder="CSE499"
                disabled={isUploading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="supervisorId">Supervisor ID (Optional)</Label>
            <Input
              id="supervisorId"
              value={supervisorId}
              onChange={(e) => setSupervisorId(e.target.value)}
              placeholder="Enter supervisor's user ID"
              disabled={isUploading}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty if no supervisor assigned
            </p>
          </div>

          {/* Abstract */}
          <div className="space-y-2">
            <Label htmlFor="abstract">Project Description *</Label>
            <Textarea
              id="abstract"
              value={abstract}
              onChange={(e) => setAbstract(e.target.value)}
              placeholder="Provide a detailed description of your project, its objectives, and outcomes"
              rows={6}
              disabled={isUploading}
              required
            />
          </div>

          {/* Keywords */}
          <div className="space-y-2">
            <Label>Keywords/Tags *</Label>
            {keywords.map((keyword, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={keyword}
                  onChange={(e) => updateKeyword(index, e.target.value)}
                  placeholder="Keyword or technology used"
                  disabled={isUploading}
                />
                {keywords.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => removeKeyword(index)}
                    disabled={isUploading}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addKeyword}
              disabled={isUploading}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Keyword
            </Button>
          </div>

          {/* Project Links */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Project Links (Optional)</h3>
            
            <div className="space-y-2">
              <Label htmlFor="webUrl">Live Demo / Website URL</Label>
              <Input
                id="webUrl"
                type="url"
                value={webUrl}
                onChange={(e) => setWebUrl(e.target.value)}
                placeholder="https://your-project-demo.com"
                disabled={isUploading}
              />
              <p className="text-xs text-muted-foreground">
                Link to your live project or demo website
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="githubRepo">GitHub Repository</Label>
              <Input
                id="githubRepo"
                type="url"
                value={githubRepo}
                onChange={(e) => setGithubRepo(e.target.value)}
                placeholder="https://github.com/username/project-name"
                disabled={isUploading}
              />
              <p className="text-xs text-muted-foreground">
                Link to your project's source code repository
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="appDownload">App Download Link</Label>
              <Input
                id="appDownload"
                type="url"
                value={appDownload}
                onChange={(e) => setAppDownload(e.target.value)}
                placeholder="https://play.google.com/store/apps/details?id=..."
                disabled={isUploading}
              />
              <p className="text-xs text-muted-foreground">
                Link to download your mobile app (Play Store, App Store, or direct APK)
              </p>
            </div>
          </div>

          {/* Upload Progress */}
          {isUploading && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Spinner className="h-4 w-4" />
                <span className="text-sm">Uploading project...</span>
              </div>
              <Progress value={uploadProgress} className="w-full" />
            </div>
          )}

          <Button 
            type="submit" 
            disabled={!title.trim() || !abstract.trim() || isUploading}
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
                Submit Project
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
