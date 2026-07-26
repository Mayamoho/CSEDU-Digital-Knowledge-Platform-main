import type { Metadata } from "next";
import { AuthGuard } from "@/components/auth/auth-guard";
import { RoleGate } from "@/components/auth/role-gate";
import { AIMetricsDashboard } from "@/components/admin/ai-metrics-dashboard";

export const metadata: Metadata = {
  title: "AI Performance",
  description: "Usage, latency and answer quality for the RAG assistant.",
};

export default function AdminAIMetricsPage() {
  return (
    <AuthGuard requireAuth>
      <RoleGate allowedRoles={["administrator"]}>
        <div className="container max-w-6xl px-4 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              AI Performance
            </h1>
            <p className="mt-2 text-muted-foreground">
              Usage, response time and answer quality for the RAG assistant
              (FR-AI-015). The same series are exported to Prometheus at
              <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">/metrics</code>
              for Grafana.
            </p>
          </div>
          <AIMetricsDashboard />
        </div>
      </RoleGate>
    </AuthGuard>
  );
}
