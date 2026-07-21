import { Suspense } from "react";
import Link from "next/link";
import { getShipments } from "@/lib/data/shipments";
import { listArtistAccounts } from "@/lib/data/artist-accounts";
import { ShipmentList } from "@/components/admin/ShipmentList";
import { ArtistShopSwitcher } from "@/components/admin/ArtistShopSwitcher";
import { EmptyState } from "@/components/EmptyState";

// super_admin 專用：跨所有繪師的出貨訂單總覽。已完成訂單與 Excel 匯出走獨立頁面
// （/admin/artist-completed-shipments，未放進側邊選單，從這裡連過去），
// 比照葴葴預購「出貨訂單管理」跟「已完成訂單」分開兩頁的既有慣例。
export default async function AdminArtistShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ viewAs?: string }>;
}) {
  const { viewAs } = await searchParams;
  const [artists, shipments] = await Promise.all([
    listArtistAccounts(),
    getShipments("artist", viewAs || undefined),
  ]);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-purple-700">繪師出貨訂單</h1>
        <Link href="/admin/artist-completed-shipments" className="text-sm text-purple-500 underline">
          查看已完成訂單與 Excel 匯出 →
        </Link>
      </div>
      <p className="mb-4 text-sm text-zinc-500">
        可依繪師篩選，賣貨便與面交／活動取貨分開顯示。
      </p>
      <div className="mb-4">
        <Suspense fallback={<div className="text-sm text-zinc-400">載入繪師清單中...</div>}>
          <ArtistShopSwitcher artists={artists} />
        </Suspense>
      </div>
      {shipments.length === 0 ? (
        <EmptyState text="尚無出貨訂單，請先到繪師訂單頁面合併出貨" />
      ) : (
        <ShipmentList shipments={shipments} />
      )}
    </div>
  );
}
