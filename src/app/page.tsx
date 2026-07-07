import Link from "next/link";
import { getPublicAnnouncements } from "@/lib/data/announcements";
import { ANNOUNCEMENT_CATEGORY_LABEL } from "@/lib/announcement-category";

export default async function Home() {
  const announcements = await getPublicAnnouncements();

  return (
    <div className="flex flex-1 flex-col items-center gap-8 bg-gradient-to-b from-pink-50 via-white to-purple-50 px-4 py-16 text-center">
      <div>
        <p className="text-5xl">🦝</p>
        <h1 className="mt-2 text-3xl font-bold text-purple-700">
          LITAN Platform
        </h1>
        <p className="mt-2 text-zinc-500">同人商品預購與現貨販售平台</p>
      </div>

      {/* 首頁雙入口：預購與現貨從這裡開始完全分流 */}
      <div className="grid w-full max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
        <Link
          href="/preorder"
          className="flex flex-col items-center gap-3 rounded-3xl bg-gradient-to-br from-purple-400 to-purple-300 p-10 text-white shadow-lg transition hover:-translate-y-1 hover:shadow-xl"
        >
          <span className="text-4xl">📦</span>
          <h2 className="text-xl font-bold">預購專區</h2>
          <p className="text-sm text-white/80">下單 → 匯款 → 到貨後合併出貨</p>
        </Link>

        <Link
          href="/instock"
          className="flex flex-col items-center gap-3 rounded-3xl bg-gradient-to-br from-pink-400 to-pink-300 p-10 text-white shadow-lg transition hover:-translate-y-1 hover:shadow-xl"
        >
          <span className="text-4xl">🛍️</span>
          <h2 className="text-xl font-bold">現貨專區</h2>
          <p className="text-sm text-white/80">下單 → 賣貨便付款 → 完成</p>
        </Link>
      </div>

      {announcements.length > 0 && (
        <div className="w-full max-w-3xl text-left">
          <h2 className="mb-3 text-lg font-bold text-purple-700">最新消息</h2>
          <div className="flex flex-col gap-3">
            {announcements.map((a) => (
              <div key={a.id} className="rounded-3xl bg-white p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-600">
                    {ANNOUNCEMENT_CATEGORY_LABEL[a.category]}
                  </span>
                  {a.isPinned && (
                    <span className="rounded-full bg-purple-500 px-2 py-0.5 text-xs text-white">
                      置頂
                    </span>
                  )}
                  <p className="font-semibold text-zinc-800">{a.title}</p>
                </div>
                {a.content && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-600">{a.content}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
