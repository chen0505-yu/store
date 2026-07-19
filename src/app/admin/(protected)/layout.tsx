import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { AdminLogoutButton } from "@/components/admin/AdminLogoutButton";

// 「現貨商品／現貨訂單／現貨區設定」從選單移除，但頁面與資料原封不動保留，
// 直接用網址仍可進入使用（平台調整：拆分葴葴預購與繪師預購）。
const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/members", label: "會員管理" },
  { href: "/admin/artists", label: "繪師管理" },
  { href: "/admin/artist-ads", label: "繪師廣告管理" },
  { href: "/admin/announcements", label: "公告管理" },
  { href: "/admin/tags", label: "Tag 管理" },
  { href: "/admin/preorder-products", label: "預購商品" },
  { href: "/admin/archived-products", label: "已封存商品" },
  { href: "/admin/import", label: "Excel 批量上架" },
  { href: "/admin/preorder-orders", label: "預購訂單" },
  { href: "/admin/shipments", label: "出貨訂單管理" },
  { href: "/admin/completed-shipments", label: "已完成訂單" },
  { href: "/admin/product-stats", label: "商品統計" },
  { href: "/admin/payment-settings", label: "匯款帳戶設定" },
];

// 涵蓋所有 /admin/* 後台管理頁面（/admin/login 不在這個 route group 底下，不受影響）：
// 一律要求管理員已登入，否則導回 /admin/login。
// artist（繪師）角色只能管理自己的商店，導去獨立的 /admin/artist 路由群組，
// 不進到 super_admin 專用的全站後台。
export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");

  if (admin.role === "artist") {
    redirect("/admin/artist");
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 gap-6 px-4 py-8">
      <aside className="w-48 shrink-0">
        <p className="mb-4 text-lg font-bold text-purple-700">🦝 葴葴x貍攤不售後 後台</p>
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
        </nav>
      </aside>
      <div className="flex-1">
        <div className="mb-4 flex items-center justify-end gap-3 text-sm">
          <span className="text-zinc-500">目前登入：{admin.displayName}</span>
          <AdminLogoutButton />
        </div>
        {children}
      </div>
    </div>
  );
}
