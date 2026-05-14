"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { type RoleTier } from "@/lib/types";
import { Spinner } from "@/components/ui/spinner";

interface AuthGuardProps {
  children: ReactNode;
  /** Require authentication */
  requireAuth?: boolean;
  /** Allowed roles (leave empty for any authenticated user) */
  allowedRoles?: RoleTier[];
  /** Redirect to this path if unauthorized */
  redirectTo?: string;
  /** Show loading spinner while checking auth */
  showLoading?: boolean;
}

/**
 * AuthGuard - Protects routes and redirects unauthorized users
 * 
 * Usage:
 * <AuthGuard requireAuth>
 *   <ProtectedPage />
 * </AuthGuard>
 * 
 * <AuthGuard allowedRoles={['admin']} redirectTo="/dashboard">
 *   <AdminPage />
 * </AuthGuard>
 */
export function AuthGuard({
  children,
  requireAuth = true,
  allowedRoles,
  redirectTo = "/login",
  showLoading = true,
}: AuthGuardProps) {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    // Check authentication
    if (requireAuth && !isAuthenticated) {
      router.push(redirectTo);
      return;
    }

    // Check roles
    if (allowedRoles && user && !allowedRoles.includes(user.role_tier)) {
      router.push("/unauthorized");
      return;
    }
  }, [isLoading, isAuthenticated, user, requireAuth, allowedRoles, redirectTo, router]);

  if (isLoading && showLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <Spinner className="h-8 w-8 text-primary" />
          <p className="text-sm text-muted-foreground">Verifying access...</p>
        </div>
      </div>
    );
  }

  if (requireAuth && !isAuthenticated) {
    return null;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role_tier)) {
    return null;
  }

  return <>{children}</>;
}
