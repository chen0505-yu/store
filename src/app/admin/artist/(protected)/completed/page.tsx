import { getArtistContext } from "@/lib/artist-context";
import { getShipments } from "@/lib/data/shipments";
import { CompletedShipmentsList } from "@/components/admin/CompletedShipmentsList";
import { EmptyState } from "@/components/EmptyState";

export default async function ArtistCompletedShipmentsPage({
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

  const shipments = (await getShipments("artist", context.teacherId)).filter((s) => s.status === "completed");

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-purple-700">已完成訂單</h1>
      <p className="mb-6 text-sm text-zinc-500">可依日期／取貨方式篩選，勾選多張匯出 Excel，匯出後才符合永久刪除資格。</p>
      {shipments.length === 0 ? (
        <EmptyState text="目前沒有已完成的出貨訂單" />
      ) : (
        <CompletedShipmentsList shipments={shipments} showSellerFilter={false} />
      )}
    </div>
  );
}
