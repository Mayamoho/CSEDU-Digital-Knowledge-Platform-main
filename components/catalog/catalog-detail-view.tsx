"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiClient } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Book, 
  Calendar, 
  User, 
  MapPin,
  AlertCircle,
  ArrowLeft,
  BookOpen
} from "lucide-react";
import { toast } from "sonner";

interface CatalogDetailViewProps {
  itemId: string;
}

export function CatalogDetailView({ itemId }: CatalogDetailViewProps) {
  const router = useRouter();
  const { user } = useAuth();
  const [item, setItem] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBorrowing, setIsBorrowing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadItem();
  }, [itemId]);

  const loadItem = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.getLibraryItem(itemId);
      setItem(data);
    } catch (err) {
      console.error("Failed to load item:", err);
      setError(err instanceof Error ? err.message : "Failed to load item");
    } finally {
      setIsLoading(false);
    }
  };

  const handleBorrow = async () => {
    try {
      setIsBorrowing(true);
      await apiClient.borrowBook(itemId);
      toast.success("Book borrowed successfully!");
      await loadItem(); // Reload to update available copies
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to borrow book");
    } finally {
      setIsBorrowing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container max-w-4xl px-4 py-8">
        <Skeleton className="h-8 w-32 mb-6" />
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-3/4" />
          </CardHeader>
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
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error || "Item not found"}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const isAvailable = item.available_copies > 0;
  const canBorrow = user?.role_tier !== 'librarian' && user?.role_tier !== 'public';

  return (
    <div className="container max-w-4xl px-4 py-8">
      <Button variant="ghost" onClick={() => router.back()} className="mb-6">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back to Catalog
      </Button>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Cover Image */}
        <div className="md:col-span-1">
          <Card>
            <CardContent className="p-6">
              {item.cover_image ? (
                <img 
                  src={item.cover_image} 
                  alt={item.title}
                  className="w-full rounded-lg shadow-md"
                />
              ) : (
                <div className="aspect-[2/3] bg-muted rounded-lg flex items-center justify-center">
                  <Book className="h-16 w-16 text-muted-foreground" />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Details */}
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <CardTitle className="text-2xl mb-2">{item.title}</CardTitle>
                  <p className="text-lg text-muted-foreground">{item.author}</p>
                </div>
                <Badge variant={isAvailable ? "default" : "destructive"}>
                  {item.status}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="space-y-6">
              {/* Book Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {item.isbn && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">ISBN</p>
                    <p className="text-sm">{item.isbn}</p>
                  </div>
                )}
                {item.year && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Year</p>
                    <p className="text-sm">{item.year}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Format</p>
                  <p className="text-sm capitalize">{item.format}</p>
                </div>
                {item.location && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      <MapPin className="h-4 w-4 inline mr-1" />
                      Location
                    </p>
                    <p className="text-sm">{item.location}</p>
                  </div>
                )}
              </div>

              {/* Availability */}
              <div className="p-4 rounded-lg bg-muted">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Availability</p>
                    <p className="text-sm text-muted-foreground">
                      {item.available_copies} of {item.total_copies} copies available
                    </p>
                  </div>
                  {canBorrow && (
                    <Button 
                      onClick={handleBorrow}
                      disabled={!isAvailable || isBorrowing}
                    >
                      <BookOpen className="h-4 w-4 mr-2" />
                      {isBorrowing ? "Borrowing..." : "Borrow Book"}
                    </Button>
                  )}
                </div>
              </div>

              {/* Additional Info */}
              {user?.role_tier === 'librarian' && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    As a librarian, you can monitor borrowing activity but cannot borrow books yourself.
                  </AlertDescription>
                </Alert>
              )}
              {!isAvailable && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    This book is currently unavailable. Please check back later or contact the library.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
