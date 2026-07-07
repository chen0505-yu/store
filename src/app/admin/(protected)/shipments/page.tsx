import { getShipments } from "@/lib/data/shipments";
import { ShipmentList } from "@/components/admin/ShipmentList";
import { EmptyState } from "@/components/EmptyState";

export default async function AdminShipmentsPage() {
  const shipments = await getShipments();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-purple-700">出貨訂單管理</h1>
      {shipments.length === 0 ? (
        <EmptyState text="尚無出貨訂單，請先到預購訂單頁面合併出貨" />
      ) : (
        <ShipmentList shipments={shipments} />
      )}
    </div>
  );
}
