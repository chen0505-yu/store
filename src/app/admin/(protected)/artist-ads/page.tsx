import { listAllArtistZoneAds } from "@/lib/data/artist-zone-ads";
import { ArtistZoneAdList } from "@/components/admin/ArtistZoneAdList";

export default async function AdminArtistAdsPage() {
  const ads = await listAllArtistZoneAds();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-purple-700">繪師廣告管理</h1>
        <p className="mt-1 text-sm text-zinc-500">只顯示在「繪師預購專區」首頁最上方，可管理圖片/標題/說明/連結/顯示隱藏/排序。</p>
      </div>
      <ArtistZoneAdList ads={ads} />
    </div>
  );
}
