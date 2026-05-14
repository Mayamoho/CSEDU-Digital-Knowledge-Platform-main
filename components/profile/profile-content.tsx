"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { apiClient, type MediaItem, type LoanItem } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { User, Mail, Calendar, Shield, BookOpen, FileText, FolderOpen, Clock } from "lucide-react";
import { ROLE_DISPLAY_NAMES, type RoleTier } from "@/lib/types";

export function ProfileContent() {
  const { user } = useAuth();
  const [uploads, setUploads] = useState<MediaItem[]>([]);
  const [loans, setLoans] = useState<LoanItem[]>([]);
  const [addedBooks, setAddedBooks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        if (user?.role_tier === 'librarian') {
          // Librarians see books they've added instead of uploads
          const [loansRes] = await Promise.all([
            apiClient.getMyLoans(),
          ]);
          setLoans(loansRes.data);
          // TODO: Add API endpoint to get books added by librarian
          setAddedBooks([]);
        } else {
          const [uploadsRes, loansRes] = await Promise.all([
            apiClient.getMyUploads({ per_page: 100 }),
            apiClient.getMyLoans(),
          ]);
          setUploads(uploadsRes.data);
          setLoans(loansRes.data);
        }
      } catch (error) {
        console.error("Failed to load profile data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [user]);

  if (!user) return null;

  const stats = {
    totalUploads: uploads.length,
    published: uploads.filter(u => u.status === 'published').length,
    research: uploads.filter(u => u.item_type === 'research').length,
    projects: uploads.filter(u => u.item_type === 'project').length,
    archives: uploads.filter(u => u.item_type === 'archive').length,
    totalLoans: loans.length,
    activeLoans: loans.filter(l => l.status === 'active').length,
    addedBooks: addedBooks.length,
  };

  const isLibrarian = user?.role_tier === 'librarian';

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-6">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-primary-foreground text-2xl font-bold">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold">{user.name}</h2>
              <div className="mt-2 space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Mail className="h-4 w-4" />
                  {user.email}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Shield className="h-4 w-4" />
                  <Badge variant="secondary">{ROLE_DISPLAY_NAMES[user.role_tier as RoleTier]}</Badge>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="h-4 w-4" />
                  Member since {new Date(user.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Statistics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {!isLibrarian && (
          <>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <FileText className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.totalUploads}</p>
                    <p className="text-sm text-muted-foreground">Total Uploads</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-500/10">
                    <FileText className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{stats.published}</p>
                    <p className="text-sm text-muted-foreground">Published</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
        {isLibrarian && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <BookOpen className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.addedBooks}</p>
                  <p className="text-sm text-muted-foreground">Books Added</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-500/10">
                <BookOpen className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalLoans}</p>
                <p className="text-sm text-muted-foreground">Total Loans</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-500/10">
                <Clock className="h-6 w-6 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.activeLoans}</p>
                <p className="text-sm text-muted-foreground">Active Loans</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contributions */}
      {!isLibrarian && (
        <Card>
          <CardHeader>
            <CardTitle>My Contributions</CardTitle>
            <CardDescription>Your uploaded research papers, projects, and archives</CardDescription>
          </CardHeader>
          <CardContent>
          <Tabs defaultValue="all">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="all">All ({stats.totalUploads})</TabsTrigger>
              <TabsTrigger value="research">Research ({stats.research})</TabsTrigger>
              <TabsTrigger value="projects">Projects ({stats.projects})</TabsTrigger>
              <TabsTrigger value="archives">Archives ({stats.archives})</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-3 mt-4">
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
                </div>
              ) : uploads.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">No contributions yet</p>
              ) : (
                uploads.map(item => <ContributionCard key={item.item_id} item={item} />)
              )}
            </TabsContent>

            <TabsContent value="research" className="space-y-3 mt-4">
              {uploads.filter(u => u.item_type === 'research').map(item => (
                <ContributionCard key={item.item_id} item={item} />
              ))}
            </TabsContent>

            <TabsContent value="projects" className="space-y-3 mt-4">
              {uploads.filter(u => u.item_type === 'project').map(item => (
                <ContributionCard key={item.item_id} item={item} />
              ))}
            </TabsContent>

            <TabsContent value="archives" className="space-y-3 mt-4">
              {uploads.filter(u => u.item_type === 'archive').map(item => (
                <ContributionCard key={item.item_id} item={item} />
              ))}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      )}

      {/* Borrowing History */}
      <Card>
        <CardHeader>
          <CardTitle>Borrowing History</CardTitle>
          <CardDescription>Books and resources you've borrowed</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : loans.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No borrowing history</p>
          ) : (
            <div className="space-y-3">
              {loans.map(loan => (
                <div key={loan.loan_id} className="flex items-center justify-between p-4 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <BookOpen className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{loan.title}</p>
                      <p className="text-sm text-muted-foreground">
                        Borrowed: {new Date(loan.checkout_date).toLocaleDateString()}
                        {loan.return_date && ` • Returned: ${new Date(loan.return_date).toLocaleDateString()}`}
                      </p>
                    </div>
                  </div>
                  <Badge variant={loan.status === 'returned' ? 'secondary' : loan.status === 'overdue' ? 'destructive' : 'default'}>
                    {loan.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ContributionCard({ item }: { item: MediaItem }) {
  const statusColors = {
    draft: 'bg-slate-100 text-slate-700',
    review: 'bg-yellow-100 text-yellow-700',
    published: 'bg-green-100 text-green-700',
    archived: 'bg-gray-100 text-gray-700',
  };

  return (
    <div className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors">
      <div className="flex items-center gap-3 flex-1">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <FolderOpen className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{item.title}</p>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="capitalize">{item.item_type}</span>
            <span>•</span>
            <span>{new Date(item.upload_date).toLocaleDateString()}</span>
            <span>•</span>
            <span className="capitalize">{item.access_tier}</span>
          </div>
        </div>
      </div>
      <Badge className={statusColors[item.status]}>
        {item.status}
      </Badge>
    </div>
  );
}
