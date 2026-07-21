import { getArtistContext } from "@/lib/artist-context";
import { getShipments } from "@/lib/data/shipments";
import { ShipmentList } from "@/components/admin/ShipmentList";
import { EmptyState } from "@/components/EmptyState";

export default async function ArtistShipmentsPage({
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

  const shipments = await getShipments("artist", context.teacherId);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-purple-700">出貨管理</h1>
      {shipments.length === 0 ? (
        <EmptyState text="尚無出貨訂單，請先到訂單管理頁面合併出貨" />
      ) : (
        <ShipmentList shipments={shipments} />
      )}
    </div>
  );
}
