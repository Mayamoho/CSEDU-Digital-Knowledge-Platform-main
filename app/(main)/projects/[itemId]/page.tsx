import type { Metadata } from "next";
import { ProjectDetailView } from "@/components/projects/project-detail-view";

export const metadata: Metadata = {
  title: "Student Project",
  description: "View student project details",
};

export default async function ProjectDetailPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  return <ProjectDetailView projectId={itemId} />;
}
