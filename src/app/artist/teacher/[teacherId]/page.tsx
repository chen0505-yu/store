import { notFound } from "next/navigation";
import { getArtistShop } from "@/lib/data/artist-storefront";
import { getCurrentMember } from "@/lib/auth";
import { ArtistShopView } from "@/components/ArtistShopView";

export default async function ArtistTeacherShopPage({
  params,
}: {
  params: Promise<{ teacherId: string }>;
}) {
  const { teacherId } = await params;
  const [shop, member] = await Promise.all([getArtistShop(teacherId), getCurrentMember()]);
  if (!shop) notFound();

  return <ArtistShopView shop={shop} isBlacklisted={member?.isBlacklisted ?? false} />;
}
