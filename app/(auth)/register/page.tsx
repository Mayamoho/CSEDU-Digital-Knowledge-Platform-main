"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { BookOpen, AlertCircle, Check, User, GraduationCap, FlaskConical, Book } from "lucide-react";
import { ROLE_DISPLAY_NAMES, type RoleTier } from "@/lib/types";

const passwordRequirements = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "Contains a number", test: (p: string) => /\d/.test(p) },
  { label: "Contains uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Contains lowercase letter", test: (p: string) => /[a-z]/.test(p) },
];

const roleDescriptions: Record<RoleTier, string> = {
  public: "Browse public archives and view student projects",
  student: "Upload projects, research, and archives. Access library resources.",
  researcher: "Manage research publications and access restricted archives",
  librarian: "Manage library catalog, loans, and memberships",
  administrator: "Full system administration and user management",
};

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<RoleTier>("student");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const isPasswordValid = passwordRequirements.every((req) => req.test(password));
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!isPasswordValid) {
      setError("Password does not meet requirements");
      return;
    }

    if (!passwordsMatch) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);

    try {
      await register({ email, password, name, role });
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="flex items-center gap-2">
            <BookOpen className="h-10 w-10 text-primary" />
            <span className="text-2xl font-bold text-foreground">CSEDU</span>
          </div>
          <p className="text-muted-foreground text-center">
            Digital Knowledge Platform
          </p>
        </div>

        <Card className="border-border shadow-lg">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-semibold text-center">
              Create an account
            </CardTitle>
            <CardDescription className="text-center">
              Join the CSEDU digital knowledge community
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={isLoading}
                  autoComplete="name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@cs.du.ac.bd"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  autoComplete="email"
                />
                <p className="text-xs text-muted-foreground">
                  Use your university email for member access
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">User Type</Label>
                <Select value={role} onValueChange={(value: RoleTier) => setRole(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select your role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="student">
                      <div className="flex items-center gap-2">
                        <GraduationCap className="h-4 w-4" />
                        <div>
                          <div className="font-medium">Student</div>
                          <div className="text-xs text-muted-foreground">Undergrad/MSc/PhD</div>
                        </div>
                      </div>
                    </SelectItem>
                    <SelectItem value="researcher">
                      <div className="flex items-center gap-2">
                        <FlaskConical className="h-4 w-4" />
                        <div>
                          <div className="font-medium">Researcher</div>
                          <div className="text-xs text-muted-foreground">Faculty & Researchers</div>
                        </div>
                      </div>
                    </SelectItem>
                    <SelectItem value="librarian">
                      <div className="flex items-center gap-2">
                        <Book className="h-4 w-4" />
                        <div>
                          <div className="font-medium">Librarian</div>
                          <div className="text-xs text-muted-foreground">Library Administration</div>
                        </div>
                      </div>
                    </SelectItem>
                    <SelectItem value="public">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        <div>
                          <div className="font-medium">Public User</div>
                          <div className="text-xs text-muted-foreground">Limited Access</div>
                        </div>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {roleDescriptions[role]}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Create a strong password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  autoComplete="new-password"
                />
                {password.length > 0 && (
                  <div className="space-y-1 mt-2">
                    {passwordRequirements.map((req, index) => (
                      <div
                        key={index}
                        className={`flex items-center gap-2 text-xs ${
                          req.test(password) ? "text-accent" : "text-muted-foreground"
                        }`}
                      >
                        <Check className={`h-3 w-3 ${req.test(password) ? "opacity-100" : "opacity-30"}`} />
                        {req.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  autoComplete="new-password"
                />
                {confirmPassword.length > 0 && (
                  <p className={`text-xs ${passwordsMatch ? "text-accent" : "text-destructive"}`}>
                    {passwordsMatch ? "Passwords match" : "Passwords do not match"}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading || !isPasswordValid || !passwordsMatch}
              >
                {isLoading ? (
                  <>
                    <Spinner className="mr-2 h-4 w-4" />
                    Creating account...
                  </>
                ) : (
                  "Create account"
                )}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex flex-col gap-4">
            <p className="text-center text-xs text-muted-foreground">
              By creating an account, you agree to our{" "}
              <Link href="/terms" className="text-primary hover:underline">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </Link>
            </p>

            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="text-primary hover:underline font-medium">
                Sign in
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
