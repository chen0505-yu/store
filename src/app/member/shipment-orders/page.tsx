import Link from "next/link";
import { getCurrentMember } from "@/lib/auth";
import { getMyShipmentBatches } from "@/lib/data/my-shipments";
import { MyShipmentBatchCard } from "@/components/MyShipmentBatchCard";
import { EmptyState } from "@/components/EmptyState";

export default async function MyShipmentOrdersPage() {
  const member = await getCurrentMember();

  if (!member) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold text-purple-700">我的出貨訂單</h1>
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

  const batches = await getMyShipmentBatches();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-purple-700">我的出貨訂單</h1>
        <Link href="/member/preorder-orders" className="text-sm text-purple-500 underline">
          查看我的預購訂單 →
        </Link>
      </div>
      <p className="mb-6 text-sm text-zinc-500">
        後台把您已到台的預購商品合併出貨後，會在這裡顯示成一筆獨立的出貨訂單。商品開賣貨便後，請到賣貨便完成下單，再回來把賣貨便訂單編號填在對應的出貨訂單上。
      </p>
      {batches.length === 0 ? (
        <EmptyState text="目前沒有出貨訂單" />
      ) : (
        <div className="flex flex-col gap-4">
          {batches.map((batch) => (
            <MyShipmentBatchCard key={batch.id} batch={batch} />
          ))}
        </div>
      )}
    </div>
  );
}
