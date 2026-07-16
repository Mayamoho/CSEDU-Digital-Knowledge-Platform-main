import type { Metadata } from "next";
import { AuthGuard } from "@/components/auth/auth-guard";
import { RoleGate } from "@/components/auth/role-gate";
import { CirculationDesk } from "@/components/admin/circulation-desk";

export const metadata: Metadata = {
  title: "Circulation Desk",
  description: "Barcode-based checkout and return for library staff.",
};

export default function CirculationPage() {
  return (
    <AuthGuard requireAuth>
      <RoleGate allowedRoles={["librarian", "administrator"]}>
        <div className="container max-w-2xl px-4 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Circulation Desk
            </h1>
            <p className="mt-2 text-muted-foreground">
              Scan a member card and a book barcode to check items out, or scan a
              returned book to close its loan.
            </p>
          </div>

          <CirculationDesk />
        </div>
      </RoleGate>
    </AuthGuard>
  );
}
