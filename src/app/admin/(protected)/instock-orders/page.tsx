import { getInstockOrdersForAdmin } from "@/lib/data/admin-instock-orders";
import { InstockOrderAdminList } from "@/components/admin/InstockOrderAdminList";
import { EmptyState } from "@/components/EmptyState";

export default async function AdminInstockOrdersPage() {
  const orders = await getInstockOrdersForAdmin();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-pink-600">現貨訂單</h1>
      {orders.length === 0 ? (
        <EmptyState text="目前沒有現貨訂單" />
      ) : (
        <InstockOrderAdminList orders={orders} />
      )}
    </div>
  );
}
