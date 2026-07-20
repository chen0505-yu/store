import { getShipments } from "@/lib/data/shipments";
import { ShipmentList } from "@/components/admin/ShipmentList";
import { EmptyState } from "@/components/EmptyState";
import { filterShipments } from "@/lib/dashboard-filters";

export default async function AdminShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const allShipments = await getShipments();
  const shipments = filterShipments(allShipments, filter);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-purple-700">出貨訂單管理</h1>
      {shipments.length === 0 ? (
        <EmptyState text={filter ? "沒有符合篩選條件的出貨訂單" : "尚無出貨訂單，請先到預購訂單頁面合併出貨"} />
      ) : (
        <ShipmentList shipments={shipments} />
      )}
    </div>
  );
}
