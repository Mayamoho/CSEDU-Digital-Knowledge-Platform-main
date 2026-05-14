"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, FileSpreadsheet, Plus } from "lucide-react";
import { RoleGate } from "@/components/auth/role-gate";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";

export function LibrarianCatalogTools() {
  const { user } = useAuth();
  const [isSingleUploadOpen, setIsSingleUploadOpen] = useState(false);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Single book form state
  const [bookData, setBookData] = useState({
    title: "",
    author: "",
    isbn: "",
    format: "book",
    location: "",
    year: "",
    total_copies: "1",
  });

  const handleSingleUpload = async () => {
    if (!bookData.title || !bookData.author) {
      toast.error("Title and author are required");
      return;
    }

    setIsSubmitting(true);
    try {
      const data: any = {
        title: bookData.title,
        author: bookData.author,
        format: bookData.format || "book",
        total_copies: parseInt(bookData.total_copies) || 1,
      };

      if (bookData.isbn) data.isbn = bookData.isbn;
      if (bookData.location) data.location = bookData.location;
      if (bookData.year) {
        const yearNum = parseInt(bookData.year);
        if (!isNaN(yearNum)) data.year = yearNum;
      }

      await apiClient.addBook(data);
      toast.success("Book added successfully!");
      setIsSingleUploadOpen(false);
      setBookData({
        title: "",
        author: "",
        isbn: "",
        format: "book",
        location: "",
        year: "",
        total_copies: "1",
      });
      // Reload page to show new book
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add book");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBulkUpload = async () => {
    if (!bulkFile) {
      toast.error("Please select a CSV file");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await apiClient.importCatalogCSV(bulkFile);
      toast.success(
        `Import complete: ${result.inserted} inserted, ${result.updated} updated, ${result.skipped} skipped`
      );
      setIsBulkUploadOpen(false);
      setBulkFile(null);
      // Reload page to show new books
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to import CSV");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <RoleGate allowedRoles={['librarian', 'administrator']}>
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Librarian Tools
          </CardTitle>
          <CardDescription>
            Add books to the catalog - single entry or bulk CSV upload
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-4">
          {/* Single Book Upload */}
          <Dialog open={isSingleUploadOpen} onOpenChange={setIsSingleUploadOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Add Single Book
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Single Book</DialogTitle>
                <DialogDescription>
                  Enter book details to add to the catalog
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    placeholder="Book title"
                    value={bookData.title}
                    onChange={(e) => setBookData({ ...bookData, title: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="author">Author *</Label>
                  <Input
                    id="author"
                    placeholder="Author name"
                    value={bookData.author}
                    onChange={(e) => setBookData({ ...bookData, author: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="isbn">ISBN</Label>
                  <Input
                    id="isbn"
                    placeholder="ISBN number"
                    value={bookData.isbn}
                    onChange={(e) => setBookData({ ...bookData, isbn: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="format">Format</Label>
                    <Input
                      id="format"
                      placeholder="book"
                      value={bookData.format}
                      onChange={(e) => setBookData({ ...bookData, format: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="copies">Total Copies</Label>
                    <Input
                      id="copies"
                      type="number"
                      placeholder="1"
                      value={bookData.total_copies}
                      onChange={(e) => setBookData({ ...bookData, total_copies: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="location">Location</Label>
                    <Input
                      id="location"
                      placeholder="Shelf location"
                      value={bookData.location}
                      onChange={(e) => setBookData({ ...bookData, location: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="year">Year</Label>
                    <Input
                      id="year"
                      type="number"
                      placeholder="2024"
                      value={bookData.year}
                      onChange={(e) => setBookData({ ...bookData, year: e.target.value })}
                    />
                  </div>
                </div>
                <Button
                  onClick={handleSingleUpload}
                  className="w-full"
                  disabled={isSubmitting || !bookData.title || !bookData.author}
                >
                  {isSubmitting ? "Adding..." : "Add Book"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Bulk CSV Upload */}
          <Dialog open={isBulkUploadOpen} onOpenChange={setIsBulkUploadOpen}>
            <DialogTrigger asChild>
              <Button>
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                Bulk CSV Upload
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Bulk CSV Upload</DialogTitle>
                <DialogDescription>
                  Upload a CSV file with multiple books. Format: title,author,isbn,format,location,year,total_copies
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="csv-file">CSV File</Label>
                  <Input
                    id="csv-file"
                    type="file"
                    accept=".csv"
                    onChange={(e) => setBulkFile(e.target.files?.[0] || null)}
                  />
                </div>
                <div className="text-sm text-muted-foreground">
                  <p className="font-semibold">CSV Format:</p>
                  <p>title,author,isbn,format,location,year,total_copies</p>
                  <p className="mt-2">Example:</p>
                  <p className="text-xs">"Introduction to Algorithms","Thomas H. Cormen","9780262033848","book","CS-101",2022,5</p>
                </div>
                <Button
                  onClick={handleBulkUpload}
                  className="w-full"
                  disabled={!bulkFile || isSubmitting}
                >
                  {isSubmitting ? "Uploading..." : "Upload CSV"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </RoleGate>
  );
}
