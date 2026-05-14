import type { Metadata } from "next";
import { AuthGuard } from "@/components/auth/auth-guard";

export const metadata: Metadata = {
  title: "Settings",
  description: "Configure your application preferences and account settings.",
};

export default function SettingsPage() {
  return (
    <AuthGuard requireAuth>
      <div className="container max-w-4xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Settings
          </h1>
          <p className="mt-2 text-muted-foreground">
            Configure your application preferences and account settings.
          </p>
        </div>

        <div className="space-y-8">
          {/* General Settings */}
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-lg font-semibold mb-4">General Settings</h2>
            <p className="text-muted-foreground">
              General application settings coming soon. Language preferences, theme options, and 
              display settings will be available here.
            </p>
          </div>

          {/* Notification Settings */}
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-lg font-semibold mb-4">Notifications</h2>
            <p className="text-muted-foreground">
              Email and in-app notification preferences coming soon. You'll be able to control 
              how you receive updates about your loans, uploads, and account activity.
            </p>
          </div>

          {/* Privacy Settings */}
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-lg font-semibold mb-4">Privacy</h2>
            <p className="text-muted-foreground">
              Privacy and data management settings coming soon. Control your data sharing preferences 
              and manage your digital footprint.
            </p>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
