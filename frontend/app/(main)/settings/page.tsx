import type { Metadata } from "next";
import { AuthGuard } from "@/components/auth/auth-guard";
import { SettingsContent } from "@/components/settings/settings-content";

export const metadata: Metadata = {
  title: "Settings",
  description: "Configure your account settings and preferences.",
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
            Manage your profile, password, and account preferences.
          </p>
        </div>
        <SettingsContent />
      </div>
    </AuthGuard>
  );
}
