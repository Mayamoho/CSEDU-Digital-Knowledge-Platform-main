import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AuthGuard } from "@/components/auth/auth-guard";
import { MediaDetailView } from "@/components/media/media-detail-view";
import { AskAboutResource } from "@/components/ai-chat/ask-about-resource";
import { ReviewsSection } from "@/components/reviews/reviews-section";

export const metadata: Metadata = {
  title: "Archive Item",
  description: "View archive item details",
};

export default async function ArchiveDetailPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  
  return (
    <AuthGuard requireAuth>
      <MediaDetailView itemId={itemId} itemType="archive" />
      <div className="container max-w-4xl space-y-6 px-4 pb-8">
        <AskAboutResource id={itemId} kind="archive" />
        <ReviewsSection itemId={itemId} />
      </div>
    </AuthGuard>
  );
}
