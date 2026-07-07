"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePreorderCart } from "@/lib/cart/use-preorder-cart";
import { useInstockCart } from "@/lib/cart/use-instock-cart";

// 底部固定購物車列：手機版與桌機版都需要方便操作，不用滑回頁面上方才找得到購物車入口。
// 依目前所在頁面（預購／現貨）決定要顯示哪一個購物車的內容，兩者都是各自獨立的
// 老師/品項/細項購物車 store，都以細項 unitPrice 計價，但資料互不相通，分開計算。
export function CartBar() {
  const pathname = usePathname();
  const preorderItems = usePreorderCart((s) => s.items);
  const instockItems = useInstockCart((s) => s.items);

  const isPreorder = pathname.startsWith("/preorder");
  const isInstock = pathname.startsWith("/instock");
  const isCartPage = pathname === "/preorder/cart" || pathname === "/instock/cart";
  const isPos = pathname.startsWith("/pos");

  if (isPos || isCartPage || (!isPreorder && !isInstock)) return null;

  const itemCount = isPreorder
    ? preorderItems.reduce((sum, i) => sum + i.quantity, 0)
    : instockItems.reduce((sum, i) => sum + i.quantity, 0);
  if (itemCount === 0) return null;

  const total = isPreorder
    ? preorderItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
    : instockItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const href = isPreorder ? "/preorder/cart" : "/instock/cart";
  const accent = isPreorder
    ? "from-pink-400 to-purple-400"
    : "from-pink-500 to-pink-400";

  return (
    <div className="sticky bottom-0 z-20 border-t border-pink-100 bg-white/95 px-4 py-3 shadow-[0_-4px_16px_rgba(216,148,214,0.18)] backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <div className="text-sm text-zinc-600">
          <span className="font-semibold text-zinc-800">已選 {itemCount} 件</span>
          <span className="ml-2 text-pink-600">總金額 NT$ {total}</span>
        </div>
        <Link
          href={href}
          className={`shrink-0 rounded-full bg-gradient-to-r ${accent} px-5 py-2 text-sm font-semibold text-white`}
        >
          檢視購物車
        </Link>
      </div>
    </div>
  );
}
