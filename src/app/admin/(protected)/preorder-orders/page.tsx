import { getShipmentItemsForAdmin } from "@/lib/data/admin-shipment-items";
import { ShipmentItemMergeList } from "@/components/admin/ShipmentItemMergeList";
import { deletePreorderOrder } from "@/lib/actions/orders";
import { EmptyState } from "@/components/EmptyState";
import { filterShipmentItems } from "@/lib/dashboard-filters";

export default async function AdminPreorderOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const allItems = await getShipmentItemsForAdmin("preorder");
  const items = filterShipmentItems(allItems, filter);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-purple-700">預購訂單</h1>
      {items.length === 0 ? (
        <EmptyState text={filter ? "沒有符合篩選條件的訂單" : "目前沒有預購訂單"} />
      ) : (
        <ShipmentItemMergeList items={items} orderType="preorder" deleteOrderAction={deletePreorderOrder} />
      )}
    </div>
  );
}
