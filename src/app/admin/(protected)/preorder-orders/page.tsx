import { getShipmentItemsForAdmin } from "@/lib/data/admin-shipment-items";
import { ShipmentItemMergeList } from "@/components/admin/ShipmentItemMergeList";
import { deletePreorderOrder } from "@/lib/actions/orders";
import { EmptyState } from "@/components/EmptyState";

export default async function AdminPreorderOrdersPage() {
  const items = await getShipmentItemsForAdmin("preorder");

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-purple-700">預購訂單</h1>
      {items.length === 0 ? (
        <EmptyState text="目前沒有預購訂單" />
      ) : (
        <ShipmentItemMergeList items={items} orderType="preorder" deleteOrderAction={deletePreorderOrder} />
      )}
    </div>
  );
}
