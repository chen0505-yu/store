import { getShipmentItemsForAdmin } from "@/lib/data/admin-shipment-items";
import { OrderPaymentOverviewList } from "@/components/admin/OrderPaymentOverviewList";
import { EmptyState } from "@/components/EmptyState";

// 待確認匯款：葴葴預購＋繪師預購合併顯示，只列出 payment_status='pending_confirmation' 的訂單，
// 每張訂單各只出現一次（同一訂單可能有多件商品/多筆 shipment_items）。
export default async function AdminPendingPaymentsPage() {
  const [preorderItems, artistItems] = await Promise.all([
    getShipmentItemsForAdmin("preorder"),
    getShipmentItemsForAdmin("artist"),
  ]);

  // OrderPaymentOverviewList 會再依 orderId 分組，這裡只要把符合狀態的品項全部丟進去即可。
  const items = [...preorderItems, ...artistItems].filter((i) => i.paymentStatus === "pending_confirmation");

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-purple-700">待確認匯款</h1>
      <p className="mb-6 text-sm text-zinc-500">葴葴預購與繪師預購合併顯示，確認匯款後這筆訂單就會從清單移除。</p>
      {items.length === 0 ? (
        <EmptyState text="目前沒有待確認匯款的訂單" />
      ) : (
        <OrderPaymentOverviewList items={items} label="補款" />
      )}
    </div>
  );
}
