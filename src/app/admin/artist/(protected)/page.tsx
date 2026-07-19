import { getArtistContext } from "@/lib/artist-context";
import { getArtistDashboardStats } from "@/lib/data/artist-dashboard";
import { getArtistShopSettings } from "@/lib/data/artist-shop";

const CARDS: { key: keyof Awaited<ReturnType<typeof getArtistDashboardStats>>; label: string; suffix?: string }[] = [
  { key: "preorderingProducts", label: "預購中商品數" },
  { key: "totalOrders", label: "訂單總數" },
  { key: "pendingPaymentConfirmation", label: "待確認匯款數" },
  { key: "confirmedOrders", label: "已確認訂單數" },
  { key: "pendingMergeItems", label: "待合併出貨數" },
  { key: "pendingMarketplaceNumberShipments", label: "待填賣貨便編號數" },
  { key: "completedOrders", label: "已完成訂單數" },
  { key: "totalAmount", label: "訂單總金額", suffix: "NT$" },
];

export default async function ArtistDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ viewAs?: string }>;
}) {
  const { viewAs } = await searchParams;
  const context = await getArtistContext(viewAs);

  if (!context) {
    return (
      <div className="rounded-2xl bg-white p-6 text-sm text-zinc-500">
        請先在上方選擇要檢視的繪師商店。
      </div>
    );
  }

  const [stats, shop] = await Promise.all([
    getArtistDashboardStats(context.teacherId),
    getArtistShopSettings(context.teacherId),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-purple-700">Dashboard{shop ? `：${shop.name}` : ""}</h1>
        <p className="mt-1 text-sm text-zinc-500">繪師預購專區經營概況</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {CARDS.map((card) => (
          <div key={card.key} className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs text-zinc-500">{card.label}</p>
            <p className="mt-1 text-2xl font-bold text-purple-700">
              {card.suffix ? `${card.suffix} ` : ""}
              {stats[card.key]}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
