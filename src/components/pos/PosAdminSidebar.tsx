"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/pos/admin", label: "Dashboard" },
  { href: "/pos/admin/events", label: "活動管理" },
  { href: "/pos/admin/artists", label: "繪師管理" },
  { href: "/pos/admin/products", label: "商品管理" },
  { href: "/pos/admin/freebies", label: "滿額贈品" },
  { href: "/pos/admin/orders", label: "訂單管理" },
  { href: "/pos/admin/settlement", label: "活動結算中心" },
  { href: "/pos/admin/stats", label: "商品銷售統計" },
  { href: "/pos/admin/reports", label: "銷售報表" },
  { href: "/pos/admin/staff", label: "員工管理" },
];

export function PosAdminSidebar({ displayName }: { displayName: string }) {
  const pathname = usePathname();

  return (
    <aside className="pos-glass w-52 shrink-0 p-4">
      <p className="mb-1 text-lg font-bold" style={{ color: "var(--pos-gold)" }}>
        POS 後台
      </p>
      <p className="mb-4 text-xs text-[var(--pos-text-muted)]">{displayName}</p>
      <nav className="flex flex-col gap-1 text-sm">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-lg px-3 py-2 transition ${
                isActive
                  ? "bg-[var(--pos-glass-border)] text-[var(--pos-gold-strong)]"
                  : "text-[var(--pos-text-muted)] hover:bg-white/5 hover:text-[var(--pos-gold)]"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <Link
        href="/pos"
        className="mt-4 block rounded-lg px-3 py-2 text-xs text-[var(--pos-text-muted)] hover:text-[var(--pos-gold)]"
      >
        ← 前往收銀畫面
      </Link>
    </aside>
  );
}
