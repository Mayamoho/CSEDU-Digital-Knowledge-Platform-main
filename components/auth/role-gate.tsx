"use client";

import { type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { type RoleTier, hasPermission, canAccessContent, type AccessTier } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Lock, LogIn } from "lucide-react";
import Link from "next/link";

interface RoleGateProps {
  children: ReactNode;
  /** Minimum role required to view content */
  allowedRoles?: RoleTier[];
  /** Specific permission required */
  requiredPermission?: string;
  /** Access tier of content */
  accessTier?: AccessTier;
  /** Custom fallback component */
  fallback?: ReactNode;
  /** Hide content entirely vs showing access denied */
  hideIfUnauthorized?: boolean;
}

/**
 * RoleGate - Conditionally renders children based on user role/permissions
 * 
 * Usage:
 * <RoleGate allowedRoles={['admin', 'staff']}>
 *   <AdminPanel />
 * </RoleGate>
 * 
 * <RoleGate requiredPermission="manage_catalog">
 *   <CatalogManager />
 * </RoleGate>
 */
export function RoleGate({
  children,
  allowedRoles,
  requiredPermission,
  accessTier,
  fallback,
  hideIfUnauthorized = false,
}: RoleGateProps) {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  // Check if user is authenticated
  if (!isAuthenticated || !user) {
    if (hideIfUnauthorized) return null;
    
    if (fallback) return <>{fallback}</>;
    
    return (
      <Alert className="border-primary/20 bg-primary/5">
        <LogIn className="h-4 w-4" />
        <AlertTitle>Authentication Required</AlertTitle>
        <AlertDescription className="mt-2">
          <p className="mb-3">Please sign in to access this content.</p>
          <Button asChild size="sm">
            <Link href="/login">Sign In</Link>
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // Check allowed roles
  if (allowedRoles && !allowedRoles.includes(user.role_tier)) {
    if (hideIfUnauthorized) return null;
    
    if (fallback) return <>{fallback}</>;
    
    return (
      <Alert variant="destructive" className="bg-destructive/5 border-destructive/20">
        <ShieldAlert className="h-4 w-4" />
        <AlertTitle>Access Denied</AlertTitle>
        <AlertDescription>
          You don&apos;t have the required role to access this content.
        </AlertDescription>
      </Alert>
    );
  }

  // Check specific permission
  if (requiredPermission && !hasPermission(user.role_tier, requiredPermission)) {
    if (hideIfUnauthorized) return null;
    
    if (fallback) return <>{fallback}</>;
    
    return (
      <Alert variant="destructive" className="bg-destructive/5 border-destructive/20">
        <Lock className="h-4 w-4" />
        <AlertTitle>Permission Required</AlertTitle>
        <AlertDescription>
          You don&apos;t have permission to perform this action.
        </AlertDescription>
      </Alert>
    );
  }

  // Check access tier
  if (accessTier && !canAccessContent(user.role_tier, accessTier)) {
    if (hideIfUnauthorized) return null;
    
    if (fallback) return <>{fallback}</>;
    
    return (
      <Alert className="border-muted bg-muted/50">
        <Lock className="h-4 w-4" />
        <AlertTitle>Restricted Content</AlertTitle>
        <AlertDescription>
          This content requires a higher access level.
        </AlertDescription>
      </Alert>
    );
  }

  return <>{children}</>;
}

/**
 * useRoleCheck - Hook to check roles and permissions
 */
export function useRoleCheck() {
  const { user, isAuthenticated } = useAuth();

  const checkRole = (allowedRoles: RoleTier[]): boolean => {
    if (!isAuthenticated || !user) return false;
    return allowedRoles.includes(user.role_tier);
  };

  const checkPermission = (permission: string): boolean => {
    if (!isAuthenticated || !user) return false;
    return hasPermission(user.role_tier, permission);
  };

  const checkAccess = (accessTier: AccessTier): boolean => {
    if (!isAuthenticated || !user) return false;
    return canAccessContent(user.role_tier, accessTier);
  };

  const isAdmin = user?.role_tier === "admin" || user?.role_tier === "ai_admin";
  const isStaff = user?.role_tier === "staff" || isAdmin;
  const isMember = user?.role_tier === "member" || isStaff;

  return {
    user,
    isAuthenticated,
    checkRole,
    checkPermission,
    checkAccess,
    isAdmin,
    isStaff,
    isMember,
  };
}
