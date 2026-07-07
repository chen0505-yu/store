import Link from "next/link";
import { getCurrentMember } from "@/lib/auth";
import { getMyOrders } from "@/lib/data/orders";
import { InstockOrderCard } from "@/components/InstockOrderCard";
import { EmptyState } from "@/components/EmptyState";

export default async function MyInstockOrdersPage() {
  const member = await getCurrentMember();

  if (!member) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold text-pink-600">我的現貨訂單</h1>
        <p className="text-zinc-500">
          請先{" "}
          <Link href="/login" className="text-pink-600 underline">
            登入
          </Link>{" "}
          會員才能查看訂單。
        </p>
      </div>
    );
  }

  const orders = await getMyOrders("instock");

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-pink-600">我的現貨訂單</h1>
      {orders.length === 0 ? (
        <EmptyState text="目前沒有現貨訂單" />
      ) : (
        <div className="flex flex-col gap-4">
          {orders.map((order) => (
            <InstockOrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  );
}
