import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { listArtistAccounts } from "@/lib/data/artist-accounts";
import { AdminLogoutButton } from "@/components/admin/AdminLogoutButton";
import { ArtistShopSwitcher } from "@/components/admin/ArtistShopSwitcher";

const NAV_ITEMS = [
  { href: "/admin/artist", label: "Dashboard" },
  { href: "/admin/artist/products", label: "商品管理" },
  { href: "/admin/artist/settings", label: "商店設定" },
  { href: "/admin/artist/orders", label: "訂單管理" },
  { href: "/admin/artist/shipments", label: "出貨管理" },
  { href: "/admin/artist/completed", label: "已完成訂單" },
];

// 繪師後台守門：未登入導回登入頁；super_admin 也可以進來（用上面的
// ArtistShopSwitcher 切換要檢視哪一位繪師，底下每個 page.tsx 各自用
// getArtistContext(searchParams.viewAs) 解析）；role==='artist' 一律只能
// 看自己的商店，所有資料查詢/異動都在伺服器端用 admin.teacherId 過濾
// （requireArtistShopAccess），不是只靠這裡的導覽隱藏連結。
export default async function ArtistProtectedLayout({ children }: { children: React.ReactNode }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  if (admin.role !== "artist" && admin.role !== "super_admin") redirect("/admin/login");

  const artists = admin.role === "super_admin" ? await listArtistAccounts() : [];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 gap-6 px-4 py-8">
      <aside className="w-48 shrink-0">
        <p className="mb-4 text-lg font-bold text-purple-700">🦝 繪師預購後台</p>
        <nav className="flex flex-col gap-1 text-sm">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-xl px-3 py-2 text-zinc-600 hover:bg-purple-50 hover:text-purple-700"
            >
              {item.label}
            </Link>
          ))}
          {admin.role === "super_admin" && (
            <Link href="/admin" className="mt-2 rounded-xl px-3 py-2 text-xs text-zinc-400 hover:bg-purple-50">
              ← 回全站後台
            </Link>
          )}
        </nav>
      </aside>
      <div className="flex-1">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          {admin.role === "super_admin" ? (
            <Suspense fallback={<div className="text-sm text-zinc-400">載入繪師清單中...</div>}>
              <ArtistShopSwitcher artists={artists} />
            </Suspense>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-3">
            <span className="text-zinc-500">目前登入：{admin.displayName}</span>
            <AdminLogoutButton />
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
