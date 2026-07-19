import Link from "next/link";
import { getArtistTeacherSummaries } from "@/lib/data/artist-storefront";
import { getVisibleArtistZoneAds } from "@/lib/data/artist-zone-ads";
import { ArtistBrowseList } from "@/components/ArtistBrowseList";
import { ArtistZoneAdBanner } from "@/components/ArtistZoneAdBanner";
import { EmptyState } from "@/components/EmptyState";

export default async function ArtistZonePage() {
  const [teachers, ads] = await Promise.all([getArtistTeacherSummaries(), getVisibleArtistZoneAds()]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      {ads.length > 0 && <ArtistZoneAdBanner ads={ads} />}

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-purple-700">繪師預購專區</h1>
          <p className="text-sm text-zinc-500">
            點進繪師賣場即可瀏覽、調整品項/細項的數量，每位繪師需各自結帳。下單後請完成匯款，等待繪師到貨後統一合併出貨。
          </p>
        </div>
        <Link href="/artist/cart" className="rounded-full bg-purple-500 px-4 py-2 text-sm font-medium text-white">
          繪師購物車
        </Link>
      </div>

      {teachers.length === 0 ? (
        <EmptyState text="目前尚無繪師賣場，請至後台建立。" />
      ) : (
        <ArtistBrowseList teachers={teachers} />
      )}
    </div>
  );
}
