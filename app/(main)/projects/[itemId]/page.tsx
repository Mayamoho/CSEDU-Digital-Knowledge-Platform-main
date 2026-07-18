import type { Metadata } from "next";
import { ProjectDetailView } from "@/components/projects/project-detail-view";
import { AskAboutResource } from "@/components/ai-chat/ask-about-resource";

export const metadata: Metadata = {
  title: "Student Project",
  description: "View student project details",
};

export default async function ProjectDetailPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  return (
    <>
      <ProjectDetailView projectId={itemId} />
      <div className="container max-w-4xl px-4 pb-8">
        <AskAboutResource id={itemId} kind="project" />
      </div>
    </>
  );
}
