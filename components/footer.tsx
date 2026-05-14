import Link from "next/link";
import { BookOpen } from "lucide-react";

const footerLinks = {
  platform: [
    { href: "/catalog", label: "Library Catalog" },
    { href: "/archive", label: "Digital Archive" },
    { href: "/research", label: "Research Repository" },
    { href: "/projects", label: "Student Projects" },
  ],
  resources: [
    { href: "/help", label: "Help Center" },
    { href: "/docs", label: "Documentation" },
    { href: "/api", label: "API Reference" },
    { href: "/faq", label: "FAQ" },
  ],
  legal: [
    { href: "/privacy", label: "Privacy Policy" },
    { href: "/terms", label: "Terms of Service" },
    { href: "/accessibility", label: "Accessibility" },
  ],
};

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-card">
      <div className="container px-4 py-12">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:grid-cols-4">
          {/* Brand */}
          <div className="space-y-4">
            <Link href="/" className="flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-primary" />
              <span className="font-bold text-lg text-foreground">CSEDU</span>
            </Link>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Digital Knowledge Platform for the Department of Computer Science
              and Engineering, University of Dhaka.
            </p>
          </div>

          {/* Platform Links */}
          <div>
            <h3 className="font-semibold text-foreground mb-4">Platform</h3>
            <ul className="space-y-3">
              {footerLinks.platform.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources Links */}
          <div>
            <h3 className="font-semibold text-foreground mb-4">Resources</h3>
            <ul className="space-y-3">
              {footerLinks.resources.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal Links */}
          <div>
            <h3 className="font-semibold text-foreground mb-4">Legal</h3>
            <ul className="space-y-3">
              {footerLinks.legal.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom section */}
        <div className="mt-12 pt-8 border-t border-border">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <p className="text-sm text-muted-foreground text-center sm:text-left">
              {currentYear} CSEDU Digital Knowledge Platform. Built by Team Devops.
            </p>
            <p className="text-sm text-muted-foreground">
              University of Dhaka
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
