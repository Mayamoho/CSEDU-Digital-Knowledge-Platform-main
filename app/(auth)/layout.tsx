import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Authentication - CSEDU Digital Knowledge Platform",
  description: "Sign in or create an account to access the CSEDU Digital Knowledge Platform",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
