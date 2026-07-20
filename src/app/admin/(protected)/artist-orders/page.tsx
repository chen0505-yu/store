import { Suspense } from "react";
import { getShipmentItemsForAdmin } from "@/lib/data/admin-shipment-items";
import { listArtistAccounts } from "@/lib/data/artist-accounts";
import { ShipmentItemMergeList } from "@/components/admin/ShipmentItemMergeList";
import { ArtistShopSwitcher } from "@/components/admin/ArtistShopSwitcher";
import { deleteArtistOrder } from "@/lib/actions/artist-orders";
import { EmptyState } from "@/components/EmptyState";

// super_admin 專用：跨所有繪師的訂單總覽（不用像 /admin/artist/orders 一次只能看一位繪師）。
// ?viewAs= 省略時 getShipmentItemsForAdmin("artist") 本來就會回傳全部繪師的品項，
// 篩選單一繪師時再帶入 teacherId，伺服器端過濾（見 admin-shipment-items.ts）。
export default async function AdminArtistOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ viewAs?: string }>;
}) {
  const { viewAs } = await searchParams;
  const [artists, items] = await Promise.all([
    listArtistAccounts(),
    getShipmentItemsForAdmin("artist", viewAs || undefined),
  ]);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-purple-700">繪師訂單</h1>
      <p className="mb-4 text-sm text-zinc-500">
        可依繪師篩選，預設顯示全部繪師的訂單。不同繪師的訂單不會合併成同一張出貨訂單。
      </p>
      <div className="mb-4">
        <Suspense fallback={<div className="text-sm text-zinc-400">載入繪師清單中...</div>}>
          <ArtistShopSwitcher artists={artists} />
        </Suspense>
      </div>
      {items.length === 0 ? (
        <EmptyState text="目前沒有繪師訂單" />
      ) : (
        <ShipmentItemMergeList items={items} orderType="artist" deleteOrderAction={deleteArtistOrder} />
      )}
    </div>
  );
}
