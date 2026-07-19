import { getArtistContext } from "@/lib/artist-context";
import { getShipmentItemsForAdmin } from "@/lib/data/admin-shipment-items";
import { ShipmentItemMergeList } from "@/components/admin/ShipmentItemMergeList";
import { deleteArtistOrder } from "@/lib/actions/artist-orders";
import { EmptyState } from "@/components/EmptyState";

export default async function ArtistOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ viewAs?: string }>;
}) {
  const { viewAs } = await searchParams;
  const context = await getArtistContext(viewAs);

  if (!context) {
    return (
      <div className="rounded-2xl bg-white p-6 text-sm text-zinc-500">
        請先在上方選擇要檢視的繪師商店。
      </div>
    );
  }

  const items = await getShipmentItemsForAdmin("artist", context.teacherId);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-purple-700">訂單管理</h1>
      {items.length === 0 ? (
        <EmptyState text="目前沒有訂單" />
      ) : (
        <ShipmentItemMergeList items={items} orderType="artist" deleteOrderAction={deleteArtistOrder} />
      )}
    </div>
  );
}
