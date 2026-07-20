import { getShipmentItemsForAdmin } from "@/lib/data/admin-shipment-items";
import { OrderPaymentOverviewList } from "@/components/admin/OrderPaymentOverviewList";
import { EmptyState } from "@/components/EmptyState";

// 補款／二補：葴葴預購＋繪師預購合併顯示，只列出還有「待處理」補款紀錄的訂單。
// 新增補款、查看已有補款一律沿用既有的 OrderPaymentPanel（訂單管理頁本來就有的功能，
// 這裡只是換一個以「有待處理補款」為篩選條件的入口，不重寫邏輯）。
export default async function AdminSupplementsPage() {
  const [preorderItems, artistItems] = await Promise.all([
    getShipmentItemsForAdmin("preorder"),
    getShipmentItemsForAdmin("artist"),
  ]);

  const items = [...preorderItems, ...artistItems].filter((i) =>
    i.supplements.some((s) => s.status === "pending")
  );

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-purple-700">補款／二補</h1>
      <p className="mb-6 text-sm text-zinc-500">
        葴葴預購與繪師預購合併顯示，只列出還有待處理補款的訂單；新增補款請在下方訂單卡片操作。
      </p>
      {items.length === 0 ? (
        <EmptyState text="目前沒有待處理的補款／二補" />
      ) : (
        <OrderPaymentOverviewList items={items} label="補款" />
      )}
    </div>
  );
}
