import type { Metadata } from "next";
import { AuthGuard } from "@/components/auth/auth-guard";
import { ProfileContent } from "@/components/profile/profile-content";

export const metadata: Metadata = {
  title: "Profile",
  description: "Manage your profile information and view your contributions.",
};

export default function ProfilePage() {
  return (
    <AuthGuard requireAuth>
      <div className="container max-w-6xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            My Profile
          </h1>
          <p className="mt-2 text-muted-foreground">
            View your account information, contributions, and borrowing history.
          </p>
        </div>

        <ProfileContent />
      </div>
    </AuthGuard>
  );
}
