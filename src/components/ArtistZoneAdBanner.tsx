import type { ArtistZoneAd } from "@/lib/data/artist-zone-ads";

// 只出現在繪師預購專區首頁最上方，依 sort_order 排序橫向排列，本次不做排程/收費/自動上下架。
export function ArtistZoneAdBanner({ ads }: { ads: ArtistZoneAd[] }) {
  return (
    <div className="mb-6 flex gap-3 overflow-x-auto pb-1">
      {ads.map((ad) => {
        const content = (
          <div className="relative w-72 shrink-0 overflow-hidden rounded-3xl bg-gradient-to-br from-pink-100 to-purple-100 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ad.imageUrl} alt={ad.title ?? "廣告"} className="h-32 w-full object-cover" />
            {(ad.title || ad.description) && (
              <div className="p-3">
                {ad.title && <p className="text-sm font-semibold text-zinc-800">{ad.title}</p>}
                {ad.description && <p className="mt-0.5 text-xs text-zinc-500">{ad.description}</p>}
              </div>
            )}
          </div>
        );
        return ad.linkUrl ? (
          <a key={ad.id} href={ad.linkUrl} target="_blank" rel="noreferrer">
            {content}
          </a>
        ) : (
          <div key={ad.id}>{content}</div>
        );
      })}
    </div>
  );
}
