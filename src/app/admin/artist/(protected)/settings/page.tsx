import { getArtistContext } from "@/lib/artist-context";
import { getArtistShopSettings } from "@/lib/data/artist-shop";
import { ArtistShopSettingsForm } from "@/components/admin/ArtistShopSettingsForm";

export default async function ArtistSettingsPage({
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

  const shop = await getArtistShopSettings(context.teacherId);
  if (!shop) {
    return <div className="rounded-2xl bg-white p-6 text-sm text-zinc-500">找不到這間商店的設定資料。</div>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-purple-700">商店設定</h1>
        <p className="mt-1 text-sm text-zinc-500">商店名稱、封面、預購時間、匯款開始/截止時間、銀行資訊、賣貨便說明。</p>
      </div>
      <ArtistShopSettingsForm shop={shop} />
    </div>
  );
}
