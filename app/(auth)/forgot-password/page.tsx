"use client";

import Link from "next/link";
import { MagicLinkForm } from "@/components/auth/magic-link-form";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen } from "lucide-react";

// Passwordless recovery: rather than a reset-token flow, we email a one-time
// sign-in link (same magic-link mechanism as the login page). Once signed in the
// user can set a new password from Settings.
export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="flex items-center gap-2">
            <BookOpen className="h-10 w-10 text-primary" />
            <span className="text-2xl font-bold text-foreground">CSEDU</span>
          </div>
          <p className="text-muted-foreground text-center">Digital Knowledge Platform</p>
        </div>

        <Card className="border-border shadow-lg">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-semibold text-center">
              Reset your access
            </CardTitle>
            <CardDescription className="text-center">
              Enter your email and we&apos;ll send a secure sign-in link. No password needed —
              once signed in you can set a new one from Settings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MagicLinkForm />
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <p className="text-center text-sm text-muted-foreground">
              Remembered it?{" "}
              <Link href="/login" className="text-primary hover:underline font-medium">
                Back to sign in
              </Link>
            </p>
          </CardFooter>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Department of Computer Science and Engineering
          <br />
          University of Dhaka
        </p>
      </div>
    </div>
  );
}
