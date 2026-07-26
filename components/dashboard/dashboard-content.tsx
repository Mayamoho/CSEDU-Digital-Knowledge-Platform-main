"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { apiClient, type LoanItem, type MediaItem } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  BookOpen, Upload, FileText, Clock, AlertTriangle,
  ArrowRight, Library, Bot, FolderOpen, User, Calendar, Info, Archive,
} from "lucide-react";
import { ROLE_DISPLAY_NAMES, type RoleTier } from "@/lib/types";
import { RoleGate } from "@/components/auth/role-gate";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { ReviewNotifications } from "@/components/research/review-notifications";
import { Recommendations } from "@/components/dashboard/recommendations";

interface DashboardStats {
  activeLoans: number;
  overdueLoans: number;
  uploads: number;
  totalFines: number;
}

export function DashboardContent() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const [stats, setStats]       = useState<DashboardStats | null>(null);
  const [loans, setLoans]       = useState<LoanItem[]>([]);
  const [uploads, setUploads]   = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Show librarian-specific dashboard
  if (user?.role_tier === 'librarian') {
    return <LibrarianDashboard />;
  }

  useEffect(() => {
    if (!isAuthenticated) return;

    const load = async () => {
      setIsLoading(true);
      try {
        const [loansRes, uploadsRes] = await Promise.all([
          apiClient.getMyLoans(),
          apiClient.getMyUploads({ per_page: 5 }),
        ]);

        const active   = loansRes.data.filter((l) => l.status === "active").length;
        const overdue  = loansRes.data.filter((l) => l.status === "overdue").length;

        setLoans(loansRes.data.slice(0, 3));
        setUploads(uploadsRes.data.slice(0, 3));
        setStats({ activeLoans: active, overdueLoans: overdue, uploads: uploadsRes.total, totalFines: 0 });
      } catch {
        // API not yet running in dev — fall through with zeros
        setStats({ activeLoans: 0, overdueLoans: 0, uploads: 0, totalFines: 0 });
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [isAuthenticated]);

  if (authLoading) return <DashboardSkeleton />;

  if (!isAuthenticated || !user) {
    return (
      <div className="container max-w-4xl px-4 py-8">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Please <Link href="/login" className="font-medium text-primary hover:underline">sign in</Link> to view your dashboard.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Welcome back, {user.name.split(" ")[0]}
            </h1>
            <p className="mt-1 text-muted-foreground">Here&apos;s an overview of your activity</p>
          </div>
          <Badge variant="secondary" className="w-fit">
            {ROLE_DISPLAY_NAMES[user.role_tier as RoleTier]}
          </Badge>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <StatsCard title="Active Loans"      value={isLoading ? null : stats?.activeLoans ?? 0}               icon={BookOpen}      href="/loans" />
        <StatsCard title="Overdue Items"     value={isLoading ? null : stats?.overdueLoans ?? 0}              icon={AlertTriangle} href="/loans?status=overdue" variant={stats?.overdueLoans ? "destructive" : "default"} />
        <RoleGate allowedRoles={['student', 'researcher', 'librarian', 'administrator']} hideIfUnauthorized>
          <StatsCard title="My Uploads"        value={isLoading ? null : stats?.uploads ?? 0}                   icon={Upload}        href="/my-uploads" />
        </RoleGate>
        <StatsCard title="Outstanding Fines" value={isLoading ? null : `${stats?.totalFines ?? 0} BDT`}       icon={Clock}         href="/fines" variant={stats?.totalFines ? "warning" : "default"} />
      </div>

      {/* Review Notifications for Researchers */}
      {(user.role_tier === 'researcher' || user.role_tier === 'administrator') && (
        <div className="mb-8">
          <ReviewNotifications />
        </div>
      )}

      {/* FR-AI-017: personalized suggestions */}
      <div className="mb-8">
        <Recommendations />
      </div>

      {/* Quick Actions + Profile */}
      <div className="grid gap-6 lg:grid-cols-3 mb-8">
        <Card className="col-span-full lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Quick Actions</CardTitle>
            <CardDescription>Common tasks you can perform</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <QuickActionButton href="/catalog"  icon={Library}  label="Browse Catalog"        description="Search library resources" />
              <UploadMediaMenu />
              <QuickActionButton href="/research" icon={FileText} label="Research Repository"    description="Explore papers" />
              <QuickActionButton href="/projects" icon={BookOpen} label="Student Projects"       description="View projects" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Your Profile</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <User className="h-6 w-6" />
              </div>
              <div>
                <p className="font-medium">{user.name}</p>
                <p className="text-sm text-muted-foreground">{user.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              <span>Member since {new Date(user.created_at).toLocaleDateString()}</span>
            </div>
            <Button variant="outline" className="w-full" asChild>
              <Link href="/profile">Edit Profile</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Current Loans</CardTitle>
              <CardDescription>Books and resources you&apos;ve borrowed</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/loans">View all <ArrowRight className="ml-1 h-4 w-4" /></Link>
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
              </div>
            ) : loans.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No active loans</p>
            ) : (
              <div className="space-y-3">
                {loans.map((loan) => (
                  <div key={loan.loan_id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                        <BookOpen className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm line-clamp-1">{loan.title}</p>
                        <p className="text-xs text-muted-foreground">Due: {new Date(loan.due_date).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <Badge variant={loan.status === "overdue" ? "destructive" : "secondary"}>
                      {loan.status === "overdue" ? "Overdue" : "Active"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <RoleGate allowedRoles={['student', 'researcher', 'librarian', 'administrator']} hideIfUnauthorized>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg">Recent Uploads</CardTitle>
                <CardDescription>Your recently uploaded content</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/my-uploads">View all <ArrowRight className="ml-1 h-4 w-4" /></Link>
              </Button>
            </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
              </div>
            ) : uploads.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No uploads yet</p>
            ) : (
              <div className="space-y-3">
                {uploads.map((item) => (
                  <div key={item.item_id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                        <FolderOpen className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-sm line-clamp-1">{item.title}</p>
                        <p className="text-xs text-muted-foreground">{new Date(item.upload_date).toLocaleDateString()}</p>
                      </div>
                    </div>
                    <Badge variant={item.status === "published" ? "default" : "secondary"}>
                      {item.status === "published" ? "Published"
                        : item.status === "review" && item.reviewer_id ? "Ready to Publish"
                        : item.status === "review" ? "In Review"
                        : item.status === "draft" && item.reviewed_at ? "Rejected"
                        : "Draft"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        </RoleGate>
      </div>
    </>
  );
}

function StatsCard({ title, value, icon: Icon, href, variant = "default" }: {
  title: string; value: string | number | null;
  icon: React.ComponentType<{ className?: string }>;
  href: string; variant?: "default" | "destructive" | "warning";
}) {
  const styles = {
    default:     "bg-primary/10 text-primary",
    destructive: "bg-destructive/10 text-destructive",
    warning:     "bg-amber-500/10 text-amber-600",
  };
  return (
    <Link href={href}>
      <Card className="transition-shadow hover:shadow-md cursor-pointer">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${styles[variant]}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{title}</p>
              {value === null
                ? <Skeleton className="h-7 w-16 mt-1" />
                : <p className="text-2xl font-semibold">{value}</p>
              }
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

// Role-based upload menu — opens a dropdown with the upload options the
// current user is allowed to use, then links to the matching upload page.
function UploadMediaMenu() {
  const { user } = useAuth();
  const role = user?.role_tier;

  const uploadOptions: { href: string; label: string; description: string; icon: React.ComponentType<{ className?: string }> }[] =
    role === "student" || role === "researcher" || role === "administrator"
      ? [
          { href: "/upload/research", label: "Upload Research", description: "Papers & publications", icon: FileText },
          { href: "/upload/archive", label: "Upload Archive", description: "Historical & media files", icon: Archive },
          { href: "/upload/projects", label: "Upload Project", description: "Student projects", icon: FolderOpen },
        ]
      : role === "librarian"
      ? [{ href: "/upload/archive", label: "Upload Archive", description: "Historical & media files", icon: Archive }]
      : [];

  // No upload options for public/unauthenticated ("user") role.
  if (uploadOptions.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted transition-colors text-left"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Upload className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="font-medium text-sm">Upload Media</p>
            <p className="text-xs text-muted-foreground">Choose what to upload</p>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {uploadOptions.map((opt) => {
          const Icon = opt.icon;
          return (
            <DropdownMenuItem key={opt.href} asChild>
              <Link href={opt.href} className="flex items-center gap-2 cursor-pointer">
                <Icon className="h-4 w-4" />
                <div className="flex flex-col">
                  <span className="text-sm">{opt.label}</span>
                  <span className="text-xs text-muted-foreground">{opt.description}</span>
                </div>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function QuickActionButton({ href, icon: Icon, label, description }: {
  href: string; icon: React.ComponentType<{ className?: string }>;
  label: string; description: string;
}) {
  return (
    <Link href={href} className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-muted transition-colors">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="font-medium text-sm">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </Link>
  );
}

function DashboardSkeleton() {
  return (
    <div className="container px-4 py-8">
      <div className="mb-8">
        <Skeleton className="h-9 w-64 mb-2" />
        <Skeleton className="h-5 w-48" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardContent className="p-4">
            <div className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <div><Skeleton className="h-4 w-20 mb-1" /><Skeleton className="h-7 w-12" /></div>
            </div>
          </CardContent></Card>
        ))}
      </div>
    </div>
  );
}

// Librarian-specific dashboard
function LibrarianDashboard() {
  const { user } = useAuth();
  const [allLoans, setAllLoans] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const loansRes = await apiClient.adminListLoans({ per_page: 100 });
        setAllLoans(loansRes.data);
      } catch (error) {
        console.error("Failed to load loans:", error);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  if (isLoading) return <DashboardSkeleton />;

  const activeLoans = allLoans.filter(l => l.status === 'active');
  const overdueLoans = allLoans.filter(l => l.status === 'overdue');

  return (
    <>
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Librarian Dashboard
            </h1>
            <p className="mt-1 text-muted-foreground">Monitor library operations and member activity</p>
          </div>
          <Badge variant="secondary" className="w-fit">
            {ROLE_DISPLAY_NAMES[user?.role_tier as RoleTier]}
          </Badge>
        </div>
      </div>

      {/* Stats — clickable, routed to the loans/fines pages */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <Link href="/loans">
          <Card className="transition-shadow hover:shadow-md cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Active Loans</p>
                  <p className="text-2xl font-semibold">{activeLoans.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/fines">
          <Card className="transition-shadow hover:shadow-md cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Overdue Items</p>
                  <p className="text-2xl font-semibold">{overdueLoans.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/loans">
          <Card className="transition-shadow hover:shadow-md cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600">
                  <User className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Members</p>
                  <p className="text-2xl font-semibold">{new Set(allLoans.map(l => l.user_id)).size}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/loans">
          <Card className="transition-shadow hover:shadow-md cursor-pointer">
            <CardContent className="p-4">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500/10 text-green-600">
                  <Library className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Loans</p>
                  <p className="text-2xl font-semibold">{allLoans.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Quick Actions */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-lg">Quick Actions</CardTitle>
          <CardDescription>Common librarian tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <QuickActionButton href="/catalog" icon={Library} label="Manage Catalog" description="Add or update books" />
            <QuickActionButton href="/fines" icon={Clock} label="Fine Management" description="Monitor member fines" />
            <QuickActionButton href="/upload/archive" icon={Archive} label="Upload Archive" description="Add archival materials" />
          </div>
        </CardContent>
      </Card>

      {/* Active Loans */}
      <Card className="mb-8">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Active Loans</CardTitle>
            <CardDescription>Currently borrowed books</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/loans">View all <ArrowRight className="ml-1 h-4 w-4" /></Link>
          </Button>
        </CardHeader>
        <CardContent>
          {activeLoans.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No active loans</p>
          ) : (
            <div className="space-y-3">
              {activeLoans.slice(0, 5).map((loan) => (
                <div key={loan.loan_id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10">
                      <BookOpen className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm line-clamp-1">{loan.title}</p>
                      <p className="text-xs text-muted-foreground">{loan.user_email} • Due: {new Date(loan.due_date).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <Badge variant="secondary">Active</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Overdue Loans */}
      {overdueLoans.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Overdue Items</CardTitle>
            <CardDescription>Items that need attention</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {overdueLoans.slice(0, 5).map((loan) => (
                <div key={loan.loan_id} className="flex items-center justify-between p-3 rounded-lg border border-destructive/20 bg-destructive/5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-destructive/10">
                      <AlertTriangle className="h-4 w-4 text-destructive" />
                    </div>
                    <div>
                      <p className="font-medium text-sm line-clamp-1">{loan.title}</p>
                      <p className="text-xs text-muted-foreground">{loan.user_email} • Due: {new Date(loan.due_date).toLocaleDateString()}</p>
                    </div>
                  </div>
                  <Badge variant="destructive">Overdue</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
