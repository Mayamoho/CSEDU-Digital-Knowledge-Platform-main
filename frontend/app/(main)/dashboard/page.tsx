import type { Metadata } from "next";
import { DashboardContent } from "@/components/dashboard/dashboard-content";
import { AuthGuard } from "@/components/auth/auth-guard";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Your personal dashboard on the CSEDU Digital Knowledge Platform.",
};

export default function DashboardPage() {
  return (
    <AuthGuard requireAuth>
      <div className="container px-4 py-8">
        <DashboardContent />
      </div>
    </AuthGuard>
  );
}
