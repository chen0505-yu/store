import Link from "next/link";
import { getCurrentMember } from "@/lib/auth";
import { getMyOrders } from "@/lib/data/orders";
import { getArtistOrderShopInfoMap } from "@/lib/data/artist-storefront";
import { OrderCard } from "@/components/OrderCard";
import { ArtistPaymentAccountInfo } from "@/components/ArtistPaymentAccountInfo";
import { EmptyState } from "@/components/EmptyState";

export default async function MyArtistOrdersPage() {
  const member = await getCurrentMember();

  if (!member) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold text-purple-700">我的繪師預購訂單</h1>
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

  const orders = await getMyOrders("artist");
  const shopInfoMap = await getArtistOrderShopInfoMap(orders.map((o) => o.id));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-purple-700">我的繪師預購訂單</h1>
        <Link href="/member/shipment-orders" className="text-sm text-purple-500 underline">
          查看我的出貨訂單 →
        </Link>
      </div>

      {orders.length === 0 ? (
        <EmptyState text="目前沒有繪師預購訂單" />
      ) : (
        <div className="flex flex-col gap-4">
          {orders.map((order) => {
            const shopInfo = shopInfoMap.get(order.id);
            const showRemittanceInfo =
              order.paymentStatus === "not_remitted" || order.paymentStatus === "pending_confirmation";
            return (
              <div key={order.id} className="flex flex-col gap-2">
                {showRemittanceInfo && shopInfo && <ArtistPaymentAccountInfo shopInfo={shopInfo} />}
                <OrderCard order={order} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
