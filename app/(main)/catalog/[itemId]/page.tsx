import type { Metadata } from "next";
import { AuthGuard } from "@/components/auth/auth-guard";
import { CatalogDetailView } from "@/components/catalog";

export const metadata: Metadata = {
  title: "Library Item",
  description: "View library catalog item details",
};

export default async function CatalogDetailPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  
  return (
    <AuthGuard requireAuth>
      <CatalogDetailView itemId={itemId} />
    </AuthGuard>
  );
}
