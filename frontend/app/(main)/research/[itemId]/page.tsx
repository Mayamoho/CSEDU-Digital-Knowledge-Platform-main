import type { Metadata } from "next";
import { ResearchDetailView } from "@/components/research/research-detail-view";

export const metadata: Metadata = {
  title: "Research Paper",
  description: "View research paper details",
};

export default async function ResearchDetailPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  return <ResearchDetailView paperId={itemId} />;
}
