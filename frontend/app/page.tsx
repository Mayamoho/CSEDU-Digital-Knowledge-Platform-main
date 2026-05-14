import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import {
  Library,
  FileText,
  FolderOpen,
  BookOpen,
  Search,
  Bot,
  ArrowRight,
  Users,
  Database,
  Sparkles,
} from "lucide-react";

const features = [
  {
    icon: Library,
    title: "Library Catalog",
    description: "Browse and search our digital library. Reserve books, track loans, and discover academic resources.",
    href: "/catalog",
    badge: "Core",
  },
  {
    icon: FolderOpen,
    title: "Digital Archive",
    description: "Access historical documents, departmental records, and multimedia archives.",
    href: "/archive",
    badge: "Core",
  },
  {
    icon: FileText,
    title: "Research Repository",
    description: "Discover and publish research papers, theses, and academic publications.",
    href: "/research",
    badge: "Research",
  },
  {
    icon: BookOpen,
    title: "Student Projects",
    description: "Showcase student projects, final year works, and creative achievements.",
    href: "/projects",
    badge: "Showcase",
  },
];

const stats = [
  { label: "Documents", value: "10,000+", icon: Database },
  { label: "Researchers", value: "500+", icon: Users },
  { label: "Projects", value: "1,200+", icon: BookOpen },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">
        <div className="flex flex-col">
          {/* Hero Section */}
          <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 via-background to-background">
            <div className="container px-4 py-16 md:py-24 lg:py-32">
              <div className="mx-auto max-w-3xl text-center">
                <Badge variant="secondary" className="mb-4">
                  <Sparkles className="mr-1 h-3 w-3" />
                  AI-Powered Knowledge Discovery
                </Badge>
                <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl text-balance">
                  CSEDU Digital Knowledge Platform
                </h1>
                <p className="mt-6 text-lg text-muted-foreground leading-relaxed text-pretty">
                  A unified platform for academic resources, research publications, student projects, 
                  and library services. Powered by AI for intelligent discovery.
                </p>
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Button size="lg" asChild>
                    <Link href="/catalog">
                      <Search className="mr-2 h-5 w-5" />
                      Explore Catalog
                    </Link>
                  </Button>
                  <Button size="lg" variant="outline" asChild>
                    <Link href="/research">
                      <FileText className="mr-2 h-5 w-5" />
                      Browse Research
                    </Link>
                  </Button>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="container px-4 pb-16">
              <div className="mx-auto max-w-3xl">
                <div className="grid grid-cols-3 gap-4">
                  {stats.map((stat) => (
                    <div
                      key={stat.label}
                      className="flex flex-col items-center p-4 rounded-lg bg-card border border-border"
                    >
                      <stat.icon className="h-6 w-6 text-primary mb-2" />
                      <span className="text-2xl font-bold text-foreground">{stat.value}</span>
                      <span className="text-sm text-muted-foreground">{stat.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* Features Section */}
          <section className="container px-4 py-16">
            <div className="mx-auto max-w-2xl text-center mb-12">
              <h2 className="text-3xl font-bold tracking-tight text-foreground">
                Everything in One Place
              </h2>
              <p className="mt-4 text-muted-foreground">
                Four integrated modules to serve students, researchers, librarians, and the public.
              </p>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {features.map((feature) => (
                <Card key={feature.title} className="group relative overflow-hidden transition-shadow hover:shadow-lg">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                        <feature.icon className="h-6 w-6 text-primary" />
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {feature.badge}
                      </Badge>
                    </div>
                    <CardTitle className="mt-4">{feature.title}</CardTitle>
                    <CardDescription className="leading-relaxed">
                      {feature.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Link
                      href={feature.href}
                      className="inline-flex items-center text-sm font-medium text-primary hover:underline"
                    >
                      Explore
                      <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* AI Section */}
          <section className="bg-muted/50">
            <div className="container px-4 py-16">
              <div className="mx-auto max-w-4xl">
                <div className="flex flex-col md:flex-row items-center gap-8">
                  <div className="flex-1">
                    <Badge variant="secondary" className="mb-4">
                      <Bot className="mr-1 h-3 w-3" />
                      RAG-Powered AI
                    </Badge>
                    <h2 className="text-3xl font-bold tracking-tight text-foreground">
                      Intelligent Knowledge Discovery
                    </h2>
                    <p className="mt-4 text-muted-foreground leading-relaxed">
                      Our AI assistant understands the context of departmental documents and research.
                      Ask questions in natural language and get cited answers from our knowledge base.
                    </p>
                    <ul className="mt-6 space-y-3">
                      {[
                        "Semantic search across all documents",
                        "Automatic summarization of research papers",
                        "Multilingual support (English & Bangla)",
                        "Citation-backed responses",
                      ].map((item) => (
                        <li key={item} className="flex items-center gap-2 text-sm text-foreground">
                          <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                          {item}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-6 text-sm text-muted-foreground">
                      Use the floating AI assistant (bottom-right) to ask questions about our resources.
                    </p>
                  </div>
                  <div className="flex-1">
                    <div className="rounded-lg border border-border bg-card p-6 shadow-lg">
                      <div className="space-y-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                            <Users className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="flex-1 rounded-lg bg-muted p-3">
                            <p className="text-sm">
                              What research has been done on machine learning in the department?
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary">
                            <Bot className="h-4 w-4 text-primary-foreground" />
                          </div>
                          <div className="flex-1 rounded-lg border border-border bg-card p-3">
                            <p className="text-sm text-muted-foreground">
                              Based on our research repository, there are 47 papers on machine learning topics...
                            </p>
                            <div className="mt-2 flex gap-2">
                              <Badge variant="outline" className="text-xs">3 citations</Badge>
                              <Badge variant="outline" className="text-xs">High confidence</Badge>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* CTA Section */}
          <section className="container px-4 py-16">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight text-foreground">
                Ready to Get Started?
              </h2>
              <p className="mt-4 text-muted-foreground">
                Join the CSEDU community and access thousands of academic resources.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button size="lg" asChild>
                  <Link href="/register">Create Account</Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/catalog">Browse as Guest</Link>
                </Button>
              </div>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
