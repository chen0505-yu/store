"use client";

import { useState } from "react";
import Link from "next/link";
import type { TeacherShop, TeacherShopGroup } from "@/lib/data/teacher-shop";
import { usePreorderCart } from "@/lib/cart/use-preorder-cart";
import { getPreorderPhase, getVariantDisabledReason } from "@/lib/product-availability";
import { PREORDER_STATUS_LABEL } from "@/lib/product-status";
import { ImageGalleryLightbox } from "@/components/ImageGalleryLightbox";

// CP 防雷：預設模糊遮罩蓋住圖片，客人點一下才看到圖片，只影響圖片，不影響名稱/價格/加入購物車。
function GroupImage({ group }: { group: TeacherShopGroup }) {
  const [revealed, setRevealed] = useState(false);
  const images = group.images.length > 0 ? group.images : group.imageUrl ? [group.imageUrl] : [];

  if (images.length === 0) {
    return (
      <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-2xl">
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

function formatDateTime(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TeacherShopView({
  shop,
  isBlacklisted,
}: {
  shop: TeacherShop;
  isBlacklisted: boolean;
}) {
  const { items, addItem, updateQuantity, removeItem } = usePreorderCart();

  const phase = getPreorderPhase(shop);
  const startText = formatDateTime(shop.preorderStartsAt);
  const endText = formatDateTime(shop.preorderEndsAt);
  const coverImage = shop.images[0] ?? shop.avatarUrl;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <Link href="/preorder" className="text-sm text-purple-500 underline">
        ← 回預購專區
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
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-purple-50 text-2xl">
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
              className="text-xs text-purple-500 underline"
            >
              社群連結
            </a>
          )}
          {(startText || endText) && (
            <p className="mt-1 text-xs text-purple-400">
              預購期間：{startText ?? "即日起"} ～ {endText ?? "不限制"}
            </p>
          )}
          {phase === "not_started" && (
            <p className="mt-1 text-xs font-medium text-orange-500">預購尚未開始</p>
          )}
          {phase === "ended" && <p className="mt-1 text-xs font-medium text-zinc-400">預購已結束</p>}
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
        <p className="mt-6 text-center text-sm text-zinc-500">這位老師目前沒有預購品項。</p>
      ) : (
        <div className="mt-4 flex flex-col gap-6">
          {shop.groups.map((group) => (
            <div key={group.id} className="rounded-3xl bg-white p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <GroupImage group={group} />
                <div>
                  <h2 className="font-bold text-zinc-800">{group.name}</h2>
                  <p className="text-sm text-pink-600">NT$ {group.price}</p>
                  <p className="text-xs text-purple-400">{PREORDER_STATUS_LABEL[group.arrivalStatus]}</p>
                  {group.isBlindDraw && (
                    <p className="text-xs font-medium text-pink-500">
                      盲抽：每買 {group.blindDrawThresholdQty} 抽可選 {group.blindDrawPickQty} 個保底
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
                      保底可選人物：{bonusNames.join("、")}（買滿抽數後請到購物車選擇）
                    </p>
                  );
                })()}

              <div className="mt-3 flex flex-col gap-2 border-t border-purple-50 pt-3">
                {group.variants.filter((v) => !(group.isBlindDraw && v.isBonusOption)).length === 0 ? (
                  <p className="text-xs text-zinc-400">目前沒有可選細項</p>
                ) : (
                  group.variants
                    .filter((v) => !(group.isBlindDraw && v.isBonusOption))
                    .map((variant) => {
                    const disabledReason = getVariantDisabledReason(shop, true, isBlacklisted);
                    const disabled = Boolean(disabledReason);
                    const cartItem = items.find((i) => i.variantId === variant.id);
                    const quantity = cartItem?.quantity ?? 0;

                    function setQuantity(next: number) {
                      if (next <= 0) {
                        removeItem(variant.id);
                      } else if (cartItem) {
                        updateQuantity(variant.id, next);
                      } else {
                        addItem({
                          variantId: variant.id,
                          variantName: variant.name,
                          productGroupId: group.id,
                          productGroupName: group.name,
                          teacherId: shop.teacherId,
                          teacherName: shop.teacherName,
                          unitPrice: group.price,
                          imageUrl: group.images[0] ?? group.imageUrl,
                          quantity: next,
                        });
                      }
                    }

                    return (
                      <div key={variant.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="text-zinc-700">{variant.name}</span>
                        {disabled ? (
                          <span className="text-xs text-zinc-400">{disabledReason}</span>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setQuantity(quantity - 1)}
                              disabled={quantity === 0}
                              className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-50 text-purple-600 disabled:opacity-40"
                            >
                              −
                            </button>
                            <span className="w-5 text-center">{quantity}</span>
                            <button
                              onClick={() => setQuantity(quantity + 1)}
                              className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-500 text-white"
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
    </div>
  );
}
