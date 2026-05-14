import type { Metadata } from "next";
import { AuthGuard } from "@/components/auth/auth-guard";
import { FinesList } from "@/components/fines/fines-list";

export const metadata: Metadata = {
  title: "Fines",
  description: "View and manage your library fines and payment history.",
};

export default function FinesPage() {
  return (
    <AuthGuard requireAuth>
      <div className="container max-w-6xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Fines & Fees
          </h1>
          <p className="mt-2 text-muted-foreground">
            View outstanding fines and manage payment history.
          </p>
        </div>

        <FinesList />
      </div>
    </AuthGuard>
  );
}
