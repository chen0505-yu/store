import { getShipments } from "@/lib/data/shipments";
import { CompletedShipmentsList } from "@/components/admin/CompletedShipmentsList";
import { EmptyState } from "@/components/EmptyState";

// 從「繪師出貨訂單」頁面連過來，只看繪師預購（不含葴葴預購），
// 沿用既有的 CompletedShipmentsList（Excel 匯出／批量永久刪除）不用重寫。
export default async function AdminArtistCompletedShipmentsPage() {
  const shipments = (await getShipments("artist")).filter((s) => s.status === "completed");

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-purple-700">繪師已完成訂單</h1>
      <p className="mb-6 text-sm text-zinc-500">
        可依繪師／日期／取貨方式篩選，勾選多張匯出 Excel，匯出後才符合永久刪除資格。
      </p>
      {shipments.length === 0 ? (
        <EmptyState text="目前沒有已完成的繪師出貨訂單" />
      ) : (
        <CompletedShipmentsList shipments={shipments} showSellerFilter />
      )}
    </div>
  );
}
