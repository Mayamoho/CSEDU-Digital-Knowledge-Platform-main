import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AuthGuard } from "@/components/auth/auth-guard";
import { MediaDetailView } from "@/components/media/media-detail-view";

export const metadata: Metadata = {
  title: "Archive Item",
  description: "View archive item details",
};

export default async function ArchiveDetailPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  
  return (
    <AuthGuard requireAuth>
      <MediaDetailView itemId={itemId} itemType="archive" />
    </AuthGuard>
  );
}
