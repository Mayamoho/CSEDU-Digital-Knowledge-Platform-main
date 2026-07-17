"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Mail, CheckCircle2 } from "lucide-react";

// Passwordless email sign-in. POSTs the address to the Go API, which emails a
// one-time link; clicking it lands on /auth/callback with tokens in the URL
// fragment (same landing page as the OAuth flow). Same-origin API by default.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

export function MagicLinkForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/magic/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error("request failed");
      setSent(true);
    } catch {
      setError("Could not send the sign-in link. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <Alert>
        <CheckCircle2 className="h-4 w-4" />
        <AlertDescription>
          Check <span className="font-medium">{email}</span> for a sign-in link.
          It expires in 15 minutes.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={submit} className="w-full space-y-2">
      <Label htmlFor="magic-email">Sign in with an email link</Label>
      <div className="flex gap-2">
        <Input
          id="magic-email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={loading}
          autoComplete="email"
        />
        <Button type="submit" variant="outline" disabled={loading}>
          {loading ? (
            <Spinner className="h-4 w-4" />
          ) : (
            <>
              <Mail className="mr-2 h-4 w-4" />
              Send link
            </>
          )}
        </Button>
      </div>
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </form>
  );
}
