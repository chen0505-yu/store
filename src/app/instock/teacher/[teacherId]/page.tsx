import { notFound } from "next/navigation";
import { getInstockShop } from "@/lib/data/instock-shop";
import { getInstockSettings } from "@/lib/data/instock-settings";
import { getInstockPhase } from "@/lib/product-availability";
import { getCurrentMember } from "@/lib/auth";
import { InstockShopView } from "@/components/InstockShopView";

export default async function InstockShopPage({
  params,
}: {
  params: Promise<{ teacherId: string }>;
}) {
  const { teacherId } = await params;
  const [shop, settings, member] = await Promise.all([
    getInstockShop(teacherId),
    getInstockSettings(),
    getCurrentMember(),
  ]);
  if (!shop) notFound();

  const instockPhase = getInstockPhase(settings);

  return (
    <InstockShopView shop={shop} instockPhase={instockPhase} isBlacklisted={member?.isBlacklisted ?? false} />
  );
}
