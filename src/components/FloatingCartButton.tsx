"use client";

import Link from "next/link";
import { usePreorderCart } from "@/lib/cart/use-preorder-cart";
import { useInstockCart } from "@/lib/cart/use-instock-cart";

// 繪師賣場頁專用的浮動購物車按鈕：固定在右下角，跟頁面底部原本就有的 CartBar 分開、
// 兩者同時存在（CartBar 是全站底部長條、這個是賣場頁專屬的圓形按鈕），
// 用 bottom-24 跟較高的 z-index 讓兩者不會疊在一起看不清楚。
export function FloatingCartButton({ cartType }: { cartType: "preorder" | "instock" }) {
  const preorderItems = usePreorderCart((s) => s.items);
  const instockItems = useInstockCart((s) => s.items);

  const items = cartType === "preorder" ? preorderItems : instockItems;
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  if (itemCount === 0) return null;

  const total = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const href = cartType === "preorder" ? "/preorder/cart" : "/instock/cart";

  return (
    <Link
      href={href}
      className="fixed bottom-24 right-4 z-30 flex flex-col items-center gap-0.5 rounded-full bg-gradient-to-br from-pink-400 to-purple-400 px-4 py-3 text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl print:hidden"
    >
      <span className="text-xl">🛒</span>
      <span className="text-xs font-semibold">{itemCount} 件</span>
      <span className="text-[11px] font-medium text-white/90">NT$ {total}</span>
    </Link>
  );
}
