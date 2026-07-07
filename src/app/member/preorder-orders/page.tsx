import Link from "next/link";
import { getCurrentMember } from "@/lib/auth";
import { getMyOrders } from "@/lib/data/orders";
import { getActivePaymentSettings } from "@/lib/data/payment-settings";
import { OrderCard } from "@/components/OrderCard";
import { EmptyState } from "@/components/EmptyState";

export default async function MyPreorderOrdersPage() {
  const member = await getCurrentMember();

  if (!member) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold text-purple-700">我的預購訂單</h1>
        <p className="text-zinc-500">
          請先{" "}
          <Link href="/login" className="text-purple-600 underline">
            登入
          </Link>{" "}
          會員才能查看訂單。
        </p>
      </div>
    );
  }

  const [orders, paymentSettings] = await Promise.all([
    getMyOrders("preorder"),
    getActivePaymentSettings(),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-purple-700">我的預購訂單</h1>
        <Link href="/member/shipment-orders" className="text-sm text-purple-500 underline">
          查看我的出貨訂單 →
        </Link>
      </div>

      {orders.length === 0 ? (
        <EmptyState text="目前沒有預購訂單" />
      ) : (
        <div className="flex flex-col gap-4">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} paymentSettings={paymentSettings} />
          ))}
        </div>
      )}
    </div>
  );
}
