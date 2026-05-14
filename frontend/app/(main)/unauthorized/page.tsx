import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Unauthorized",
};

export default function UnauthorizedPage() {
  return (
    <div className="container flex flex-col items-center justify-center min-h-[60vh] py-12">
      <div className="flex flex-col items-center text-center max-w-md">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10 mb-6">
          <ShieldAlert className="h-10 w-10 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">Access Denied</h1>
        <p className="text-muted-foreground mb-6">
          You don&apos;t have permission to access this page. If you believe this is an error,
          please contact your administrator.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" asChild>
            <Link href="/">Go Home</Link>
          </Button>
          <Button asChild>
            <Link href="/dashboard">Go to Dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
