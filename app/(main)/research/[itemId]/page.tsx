import type { Metadata } from "next";
import { ResearchDetailView } from "@/components/research/research-detail-view";
import { AskAboutResource } from "@/components/ai-chat/ask-about-resource";

export const metadata: Metadata = {
  title: "Research Paper",
  description: "View research paper details",
};

export default async function ResearchDetailPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  return (
    <>
      <ResearchDetailView paperId={itemId} />
      <div className="container max-w-4xl px-4 pb-8">
        <AskAboutResource id={itemId} kind="research" />
      </div>
    </>
  );
}
