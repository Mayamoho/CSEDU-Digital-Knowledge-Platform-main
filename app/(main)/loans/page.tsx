import type { Metadata } from "next";
import { AuthGuard } from "@/components/auth/auth-guard";
import { LoansList } from "@/components/loans/loans-list";

export const metadata: Metadata = {
  title: "My Loans",
  description: "View and manage your library loans and borrow history.",
};

export default function LoansPage() {
  return (
    <AuthGuard requireAuth>
      <div className="container max-w-4xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            My Loans
          </h1>
          <p className="mt-2 text-muted-foreground">
            View your current loans, due dates, and borrowing history.
          </p>
        </div>

        <LoansList />
      </div>
    </AuthGuard>
  );
}
