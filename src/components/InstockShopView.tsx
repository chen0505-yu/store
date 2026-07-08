"use client";

import { useState } from "react";
import Link from "next/link";
import type { InstockShop, InstockShopGroup } from "@/lib/data/instock-shop";
import { useInstockCart } from "@/lib/cart/use-instock-cart";
import { getInstockVariantDisabledReason } from "@/lib/product-availability";
import type { InstockPhase } from "@/lib/product-availability";
import { ImageGalleryLightbox } from "@/components/ImageGalleryLightbox";
import { FloatingCartButton } from "@/components/FloatingCartButton";

// CP 防雷：預設模糊遮罩蓋住圖片，客人點一下才看到圖片，只影響圖片，不影響名稱/價格/加入購物車。
function GroupImage({ group }: { group: InstockShopGroup }) {
  const [revealed, setRevealed] = useState(false);
  const images = group.images.length > 0 ? group.images : group.imageUrl ? [group.imageUrl] : [];

  if (images.length === 0) {
    return (
      <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-pink-50 text-2xl">
        🦝
      </div>
    );
  }

  if (group.isCpSpoiler && !revealed) {
    return (
      <button
        type="button"
        onClick={() => setRevealed(true)}
        className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={images[0]} alt={group.name} className="h-full w-full object-cover blur-lg" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-black/50 text-center text-white">
          <span className="text-[10px] font-bold">CP 防雷</span>
          <span className="text-[10px]">點我看清楚</span>
        </div>
      </button>
    );
  }

  return (
    <ImageGalleryLightbox
      images={images}
      alt={group.name}
      thumbnailClassName="h-24 w-24 rounded-xl object-cover"
    />
  );
}

export function InstockShopView({
  shop,
  instockPhase,
  isBlacklisted,
}: {
  shop: InstockShop;
  instockPhase: InstockPhase;
  isBlacklisted: boolean;
}) {
  const { items, addItem, updateQuantity, removeItem } = useInstockCart();
  const coverImage = shop.images[0] ?? shop.avatarUrl;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-8 pb-[180px] md:pb-8">
      <Link href="/instock" className="text-sm text-pink-500 underline">
        ← 回現貨專區
      </Link>

      <div className="mt-4 flex items-center gap-4 rounded-3xl bg-white p-5 shadow-sm">
        {coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverImage}
            alt={shop.teacherName}
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-pink-50 text-2xl">
            🦝
          </div>
        )}
        <div>
          <h1 className="text-xl font-bold text-zinc-800">{shop.teacherName}</h1>
          {shop.socialUrl && (
            <a
              href={shop.socialUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-pink-500 underline"
            >
              社群連結
            </a>
          )}
          {instockPhase === "ended" && (
            <p className="mt-1 text-xs font-medium text-zinc-400">期間限定已結束，商品保留顯示但無法下單</p>
          )}
        </div>
      </div>

      {shop.images.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {shop.images.map((url, index) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={index}
              src={url}
              alt={`${shop.teacherName} 賣場圖片 ${index + 1}`}
              className="h-24 w-24 shrink-0 rounded-2xl object-cover"
            />
          ))}
        </div>
      )}

      {shop.groups.length === 0 ? (
        <p className="mt-6 text-center text-sm text-zinc-500">這位老師目前沒有現貨品項。</p>
      ) : (
        <div className="mt-4 flex flex-col gap-6">
          {shop.groups.map((group) => (
            <div key={group.id} className="rounded-3xl bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <GroupImage group={group} />
                <div>
                  <h2 className="font-bold text-zinc-800">{group.name}</h2>
                  <p className="text-sm text-pink-600">NT$ {group.price}</p>
                  {group.isBlindDraw && (
                    <p className="text-xs font-medium text-pink-500">
                      盲抽：每買 {group.blindDrawThresholdQty} 件可選 {group.blindDrawPickQty} 個保底
                    </p>
                  )}
                </div>
              </div>

              {group.isBlindDraw &&
                group.variants.some((v) => v.isBonusOption) &&
                (() => {
                  const bonusNames = group.variants.filter((v) => v.isBonusOption).map((v) => v.name);
                  return (
                    <p className="mt-2 text-xs text-zinc-400">
                      保底可選人物：{bonusNames.join("、")}（買滿數量後請到購物車選擇）
                    </p>
                  );
                })()}

              <div className="mt-3 flex flex-col gap-2 border-t border-pink-50 pt-3">
                {group.variants.filter((v) => !(group.isBlindDraw && v.isBonusOption)).length === 0 ? (
                  <p className="text-xs text-zinc-400">目前沒有可選細項</p>
                ) : (
                  group.variants
                    .filter((v) => !(group.isBlindDraw && v.isBonusOption))
                    .map((variant) => {
                    const disabledReason = getInstockVariantDisabledReason(
                      instockPhase,
                      { isActive: true, isSoldOut: variant.isSoldOut, stockQuantity: variant.stockQuantity },
                      isBlacklisted
                    );
                    const disabled = Boolean(disabledReason);
                    const cartItem = items.find((i) => i.variantId === variant.id);
                    const quantity = cartItem?.quantity ?? 0;

                    function setQuantity(next: number) {
                      const capped = Math.min(next, variant.stockQuantity);
                      if (capped <= 0) {
                        removeItem(variant.id);
                      } else if (cartItem) {
                        updateQuantity(variant.id, capped);
                      } else {
                        addItem({
                          variantId: variant.id,
                          variantName: variant.name,
                          groupId: group.id,
                          groupName: group.name,
                          teacherId: shop.teacherId,
                          teacherName: shop.teacherName,
                          unitPrice: group.price,
                          imageUrl: group.images[0] ?? group.imageUrl,
                          stockQuantity: variant.stockQuantity,
                          quantity: capped,
                        });
                      }
                    }

                    return (
                      <div key={variant.id} className="flex items-center justify-between gap-2 text-sm">
                        <div>
                          <span className="text-zinc-700">{variant.name}</span>
                          <span className="ml-2 text-xs text-zinc-400">庫存 {variant.stockQuantity}</span>
                        </div>
                        {disabled ? (
                          <span className="text-xs text-zinc-400">{disabledReason}</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setQuantity(quantity - 1)}
                              disabled={quantity === 0}
                              className="flex h-7 w-7 items-center justify-center rounded-full bg-pink-50 text-pink-600 disabled:opacity-40"
                            >
                              −
                            </button>
                            <span className="w-5 text-center">{quantity}</span>
                            <button
                              onClick={() => setQuantity(quantity + 1)}
                              disabled={quantity >= variant.stockQuantity}
                              className="flex h-7 w-7 items-center justify-center rounded-full bg-pink-500 text-white disabled:opacity-40"
                            >
                              +
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <FloatingCartButton cartType="instock" />
    </div>
  );
}
