"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

// Landing page for the Google OAuth redirect. The Go API delivers the freshly
// minted tokens in the URL fragment (never sent to any server), so we parse
// them here, persist via the auth context, then continue to the dashboard.
export default function AuthCallbackPage() {
  const router = useRouter();
  const { loginWithTokens } = useAuth();
  const [error, setError] = useState("");

  useEffect(() => {
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(hash);

    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    const expiresIn = parseInt(params.get("expires_in") || "3600", 10);

    if (!accessToken || !refreshToken) {
      setError("Sign-in failed: no credentials were returned. Please try again.");
      return;
    }

    // Strip tokens from the address bar immediately.
    window.history.replaceState(null, "", window.location.pathname);

    loginWithTokens({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: Number.isFinite(expiresIn) ? expiresIn : 3600,
    })
      .then(() => router.replace("/dashboard"))
      .catch(() => setError("Sign-in failed while loading your account. Please try again."));
  }, [loginWithTokens, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      {error ? (
        <div className="w-full max-w-md space-y-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <button
            className="text-sm text-primary underline"
            onClick={() => router.replace("/login")}
          >
            Back to login
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 text-muted-foreground">
          <Spinner />
          <p>Completing sign-in…</p>
        </div>
      )}
    </div>
  );
}
