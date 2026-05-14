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

export function ResearchUploadForm() {
  const router = useRouter();
  const { user } = useAuth();
  
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [authors, setAuthors] = useState<string[]>([""]);
  const [coAuthors, setCoAuthors] = useState<string[]>([]);
  const [abstract, setAbstract] = useState("");
  const [keywords, setKeywords] = useState<string[]>([""]);
  const [publicationDate, setPublicationDate] = useState("");
  const [doi, setDoi] = useState("");
  const [journal, setJournal] = useState("");
  const [conference, setConference] = useState("");
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
    
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!['.pdf', '.docx', '.doc'].includes(fileExtension)) {
      setError("Only PDF and Word documents are allowed for research papers");
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
    },
  });

  const addAuthor = () => setAuthors([...authors, ""]);
  const removeAuthor = (index: number) => setAuthors(authors.filter((_, i) => i !== index));
  const updateAuthor = (index: number, value: string) => {
    const newAuthors = [...authors];
    newAuthors[index] = value;
    setAuthors(newAuthors);
  };

  const addCoAuthor = () => setCoAuthors([...coAuthors, ""]);
  const removeCoAuthor = (index: number) => setCoAuthors(coAuthors.filter((_, i) => i !== index));
  const updateCoAuthor = (index: number, value: string) => {
    const newCoAuthors = [...coAuthors];
    newCoAuthors[index] = value;
    setCoAuthors(newCoAuthors);
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
    
    if (!uploadedFile) {
      setError("Please select a file to upload");
      return;
    }
    
    if (!title.trim()) {
      setError("Please enter a title");
      return;
    }

    const validAuthors = authors.filter(a => a.trim());
    if (validAuthors.length === 0) {
      setError("Please add at least one author");
      return;
    }

    if (!abstract.trim()) {
      setError("Please enter an abstract");
      return;
    }
    
    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      // First upload the file to media
      const formData = new FormData();
      formData.append('file', uploadedFile);
      formData.append('title', title);
      formData.append('description', abstract);
      formData.append('keywords', keywords.filter(k => k.trim()).join(','));
      formData.append('item_type', 'research');
      formData.append('access_tier', 'researcher');
      formData.append('language', 'en');
      formData.append('status', 'draft');

      const mediaResult = await apiClient.uploadMedia(formData);
      
      // Then create research paper entry
      await apiClient.submitResearch({
        title,
        authors: validAuthors,
        co_authors: coAuthors.filter(a => a.trim()),
        abstract,
        keywords: keywords.filter(k => k.trim()),
        publication_date: publicationDate || undefined,
        doi: doi || undefined,
        journal: journal || undefined,
        conference: conference || undefined,
        file_path: mediaResult.file_path || '',
      });

      toast.success("Research paper saved as draft! You can submit it for review from your uploads.");
      router.push('/my-uploads');
      
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
          <CardTitle>Upload Research Paper</CardTitle>
          <CardDescription>
            Submit your research paper, thesis, or academic publication. Papers are saved as drafts and can be submitted for review later.
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
            <Label>Upload PDF or Word Document *</Label>
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
                    Drag and drop your research paper here, or click to select
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PDF, DOCX, or DOC • Maximum 50MB
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Paper Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter the full title of your research paper"
              disabled={isUploading}
              required
            />
          </div>

          {/* Authors */}
          <div className="space-y-2">
            <Label>Authors * (Primary authors)</Label>
            {authors.map((author, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={author}
                  onChange={(e) => updateAuthor(index, e.target.value)}
                  placeholder="Author name"
                  disabled={isUploading}
                />
                {authors.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => removeAuthor(index)}
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
              onClick={addAuthor}
              disabled={isUploading}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Author
            </Button>
          </div>

          {/* Co-Authors */}
          <div className="space-y-2">
            <Label>Co-Authors (Optional)</Label>
            {coAuthors.map((coAuthor, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={coAuthor}
                  onChange={(e) => updateCoAuthor(index, e.target.value)}
                  placeholder="Co-author name"
                  disabled={isUploading}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => removeCoAuthor(index)}
                  disabled={isUploading}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addCoAuthor}
              disabled={isUploading}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Co-Author
            </Button>
          </div>

          {/* Abstract */}
          <div className="space-y-2">
            <Label htmlFor="abstract">Abstract *</Label>
            <Textarea
              id="abstract"
              value={abstract}
              onChange={(e) => setAbstract(e.target.value)}
              placeholder="Provide a comprehensive abstract of your research"
              rows={6}
              disabled={isUploading}
              required
            />
          </div>

          {/* Keywords */}
          <div className="space-y-2">
            <Label>Keywords *</Label>
            {keywords.map((keyword, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={keyword}
                  onChange={(e) => updateKeyword(index, e.target.value)}
                  placeholder="Keyword or topic"
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

          {/* Publication Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="publicationDate">Publication Date</Label>
              <Input
                id="publicationDate"
                type="date"
                value={publicationDate}
                onChange={(e) => setPublicationDate(e.target.value)}
                disabled={isUploading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="doi">DOI</Label>
              <Input
                id="doi"
                value={doi}
                onChange={(e) => setDoi(e.target.value)}
                placeholder="10.1234/example"
                disabled={isUploading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="journal">Journal Name</Label>
              <Input
                id="journal"
                value={journal}
                onChange={(e) => setJournal(e.target.value)}
                placeholder="Journal of Computer Science"
                disabled={isUploading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="conference">Conference Name</Label>
              <Input
                id="conference"
                value={conference}
                onChange={(e) => setConference(e.target.value)}
                placeholder="ICML 2024"
                disabled={isUploading}
              />
            </div>
          </div>

          {/* Upload Progress */}
          {isUploading && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Spinner className="h-4 w-4" />
                <span className="text-sm">Uploading research paper...</span>
              </div>
              <Progress value={uploadProgress} className="w-full" />
            </div>
          )}

          <Button 
            type="submit" 
            disabled={!uploadedFile || !title.trim() || !abstract.trim() || isUploading}
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
                Submit Research Paper
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
