"use client";

import Link from "next/link";
import { usePreorderCart } from "@/lib/cart/use-preorder-cart";
import { useInstockCart } from "@/lib/cart/use-instock-cart";
import { useArtistCart } from "@/lib/cart/use-artist-cart";

// 老師/繪師賣場頁專用的浮動購物車按鈕：固定在右下角，是賣場頁唯一的購物車入口。
export function FloatingCartButton({ cartType }: { cartType: "preorder" | "instock" | "artist" }) {
  const preorderItems = usePreorderCart((s) => s.items);
  const instockItems = useInstockCart((s) => s.items);
  const artistItems = useArtistCart((s) => s.items);

  const items = cartType === "preorder" ? preorderItems : cartType === "instock" ? instockItems : artistItems;
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  if (itemCount === 0) return null;

  const total = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
  const href = cartType === "preorder" ? "/preorder/cart" : cartType === "instock" ? "/instock/cart" : "/artist/cart";

  return (
    <Link
      href={href}
      className="fixed bottom-6 right-4 z-30 flex origin-bottom-right scale-[0.8] flex-col items-center gap-0.5 rounded-full bg-gradient-to-br from-pink-400 to-purple-400 px-4 py-3 text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl md:scale-100 print:hidden"
    >
      <span className="text-xl">🛒</span>
      <span className="text-xs font-semibold">{itemCount} 件</span>
      <span className="text-[11px] font-medium text-white/90">NT$ {total}</span>
    </Link>
  );
}
