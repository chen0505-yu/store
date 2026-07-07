import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { AdminLogoutButton } from "@/components/admin/AdminLogoutButton";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/members", label: "會員管理" },
  { href: "/admin/announcements", label: "公告管理" },
  { href: "/admin/tags", label: "Tag 管理" },
  { href: "/admin/preorder-products", label: "預購商品" },
  { href: "/admin/instock-products", label: "現貨商品" },
  { href: "/admin/instock-settings", label: "現貨區設定" },
  { href: "/admin/archived-products", label: "已封存商品" },
  { href: "/admin/import", label: "Excel 批量上架" },
  { href: "/admin/preorder-orders", label: "預購訂單" },
  { href: "/admin/instock-orders", label: "現貨訂單" },
  { href: "/admin/shipments", label: "出貨訂單管理" },
  { href: "/admin/product-stats", label: "商品統計" },
  { href: "/admin/payment-settings", label: "匯款帳戶設定" },
];

// 涵蓋所有 /admin/* 後台管理頁面（/admin/login 不在這個 route group 底下，不受影響）：
// 一律要求管理員已登入，否則導回 /admin/login。
// artist（繪師）角色先預留，登入後只顯示「尚未開放」，不進到完整後台管理功能。
export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");

  if (admin.role === "artist") {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
        <p className="text-lg font-semibold text-purple-700">繪師功能尚未開放</p>
        <p className="text-sm text-zinc-500">
          目前登入身份：{admin.displayName}（繪師）。繪師自行上架商品的功能還在準備中，請耐心等候開放通知。
        </p>
        <AdminLogoutButton />
      </div>
    );
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
