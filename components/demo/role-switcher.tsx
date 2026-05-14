"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ROLE_DISPLAY_NAMES, type RoleTier } from "@/lib/types";
import { User as UserIcon, Shield } from "lucide-react";

// Demo component to test different roles
export function RoleSwitcher() {
  const { user } = useAuth();
  const [selectedRole, setSelectedRole] = useState<RoleTier>((user?.role_tier as RoleTier) || "student");
  const [useMockMode, setUseMockMode] = useState(false);

  useEffect(() => {
    // Load mock mode preference from localStorage
    setUseMockMode(localStorage.getItem('use_mock_mode') === 'true');
  }, []);

  const toggleMockMode = (enabled: boolean) => {
    setUseMockMode(enabled);
    localStorage.setItem('use_mock_mode', String(enabled));
    // Reload to apply the change
    window.location.reload();
  };

  const mockUsers: Record<RoleTier, any> = {
    public: {
      user_id: "mock-public-123",
      email: "public@gmail.com",
      name: "Public User",
      role_tier: "public" as const,
      created_at: new Date().toISOString(),
      last_login: null
    },
    student: {
      user_id: "mock-student-123",
      email: "student@cs.du.ac.bd",
      name: "Student User",
      role_tier: "student" as const,
      created_at: new Date().toISOString(),
      last_login: null
    },
    researcher: {
      user_id: "mock-researcher-123",
      email: "researcher@cs.du.ac.bd",
      name: "Researcher User",
      role_tier: "researcher" as const,
      created_at: new Date().toISOString(),
      last_login: null
    },
    librarian: {
      user_id: "mock-librarian-123",
      email: "librarian@cs.du.ac.bd",
      name: "Librarian User",
      role_tier: "librarian" as const,
      created_at: new Date().toISOString(),
      last_login: null
    },
    administrator: {
      user_id: "mock-administrator-123",
      email: "admin@cs.du.ac.bd",
      name: "Administrator User",
      role_tier: "administrator" as const,
      created_at: new Date().toISOString(),
      last_login: null
    }
  };

  const switchRole = (role: RoleTier) => {
    setSelectedRole(role);
    // Enable mock mode and store selected role in localStorage
    localStorage.setItem('use_mock_mode', 'true');
    localStorage.setItem('mock_role', role);
    console.log(`Switched to role: ${role}`);
    console.log(`Mock user data:`, mockUsers[role]);

    // Force page reload to trigger mock auth with new role
    window.location.reload();
  };

  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <Card className="border-2 border-primary/20 bg-primary/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Role Switcher (Development Only)
        </CardTitle>
        <CardDescription>
          Test different user roles to see how RBAC affects the UI
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <UserIcon className="h-4 w-4" />
              <span className="text-sm font-medium">Current Role:</span>
              <Badge variant="secondary">
                {user ? ROLE_DISPLAY_NAMES[user.role_tier as RoleTier] : "Not Authenticated"}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={useMockMode}
              onCheckedChange={toggleMockMode}
              id="mock-mode"
            />
            <label htmlFor="mock-mode" className="text-sm font-medium cursor-pointer">
              Mock Mode
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Switch Role:</label>
          <Select value={selectedRole} onValueChange={(value: RoleTier) => switchRole(value)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ROLE_DISPLAY_NAMES).map(([role, displayName]) => (
                <SelectItem key={role} value={role}>
                  <div className="flex items-center gap-2">
                    <span>{displayName}</span>
                    {role === selectedRole && <Badge variant="outline" className="text-xs">Current</Badge>}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <p><strong>Testing Tips:</strong></p>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Mock Mode</strong>: Enable to test UI without backend</li>
            <li><strong>Real Auth</strong>: Disable to use actual backend login/register</li>
            <li>Students can upload projects, research, and archives</li>
            <li>Researchers manage research and access restricted archives</li>
            <li>Librarians manage catalog, loans, and memberships</li>
            <li>Administrators have full system control</li>
            <li>Public users have limited browsing access</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
