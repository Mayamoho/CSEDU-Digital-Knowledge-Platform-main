"use client";

import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ROLE_DISPLAY_NAMES } from "@/lib/types";

export default function DebugAuthPage() {
  const { user, isAuthenticated, isLoading } = useAuth();

  const allowedRoles = ['student', 'researcher', 'librarian', 'administrator'];

  return (
    <div className="container max-w-2xl px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Auth Debug Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium mb-2">Loading State:</p>
            <Badge variant={isLoading ? "secondary" : "default"}>
              {isLoading ? "Loading..." : "Loaded"}
            </Badge>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Authentication Status:</p>
            <Badge variant={isAuthenticated ? "default" : "destructive"}>
              {isAuthenticated ? "Authenticated" : "Not Authenticated"}
            </Badge>
          </div>

          {user && (
            <>
              <div>
                <p className="text-sm font-medium mb-2">User Data:</p>
                <pre className="bg-muted p-4 rounded text-xs overflow-auto">
                  {JSON.stringify(user, null, 2)}
                </pre>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Role Tier:</p>
                <Badge variant="secondary">{user.role_tier}</Badge>
                <p className="text-xs text-muted-foreground mt-1">
                  Display Name: {ROLE_DISPLAY_NAMES[user.role_tier]}
                </p>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Upload Page Allowed Roles:</p>
                <div className="flex flex-wrap gap-2">
                  {allowedRoles.map(role => (
                    <Badge 
                      key={role} 
                      variant={user.role_tier === role ? "default" : "outline"}
                    >
                      {role}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Access Check:</p>
                <Badge variant={allowedRoles.includes(user.role_tier) ? "default" : "destructive"}>
                  {allowedRoles.includes(user.role_tier) 
                    ? "✓ Should have access to upload" 
                    : "✗ No access to upload"}
                </Badge>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Mock Mode:</p>
                <Badge variant="secondary">
                  {typeof window !== 'undefined' && localStorage.getItem('use_mock_mode') === 'true' 
                    ? "Enabled" 
                    : "Disabled"}
                </Badge>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
