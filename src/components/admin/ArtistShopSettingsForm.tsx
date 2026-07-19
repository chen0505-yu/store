"use client";

import { useState, useTransition } from "react";
import type { ArtistShopSettings } from "@/lib/data/artist-shop";
import { updateArtistShopSettings } from "@/lib/actions/artist-shop";
import { toLocalInputValue, fromLocalInputValue } from "@/lib/datetime";
import { MultiImageUploader } from "./MultiImageUploader";

export function ArtistShopSettingsForm({ shop }: { shop: ArtistShopSettings }) {
  const [name, setName] = useState(shop.name);
  const [imageUrls, setImageUrls] = useState<string[]>(shop.images);
  const [preorderStartsAt, setPreorderStartsAt] = useState(toLocalInputValue(shop.preorderStartsAt));
  const [preorderEndsAt, setPreorderEndsAt] = useState(toLocalInputValue(shop.preorderEndsAt));
  const [remittanceStartsAt, setRemittanceStartsAt] = useState(toLocalInputValue(shop.remittanceStartsAt));
  const [remittanceEndsAt, setRemittanceEndsAt] = useState(toLocalInputValue(shop.remittanceEndsAt));
  const [bankName, setBankName] = useState(shop.bankName ?? "");
  const [bankCode, setBankCode] = useState(shop.bankCode ?? "");
  const [accountName, setAccountName] = useState(shop.accountName ?? "");
  const [accountNumber, setAccountNumber] = useState(shop.accountNumber ?? "");
  const [remittanceNote, setRemittanceNote] = useState(shop.remittanceNote ?? "");
  const [marketplaceNote, setMarketplaceNote] = useState(shop.marketplaceNote ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const result = await updateArtistShopSettings(shop.teacherId, {
        name,
        imageUrls,
        preorderStartsAt: fromLocalInputValue(preorderStartsAt),
        preorderEndsAt: fromLocalInputValue(preorderEndsAt),
        remittanceStartsAt: fromLocalInputValue(remittanceStartsAt),
        remittanceEndsAt: fromLocalInputValue(remittanceEndsAt),
        bankName,
        bankCode,
        accountName,
        accountNumber,
        remittanceNote,
        marketplaceNote,
      });
      setMessage(result.message);
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-500">商店名稱</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-lg border border-purple-200 px-3 py-2"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-500">商店封面圖</label>
        <MultiImageUploader value={imageUrls} onChange={setImageUrls} folder="artist-shops" />
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-2xl bg-purple-50/60 p-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500">預購開始時間</label>
          <input
            type="datetime-local"
            value={preorderStartsAt}
            onChange={(e) => setPreorderStartsAt(e.target.value)}
            className="rounded-lg border border-purple-200 px-2 py-1 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500">預購截止時間</label>
          <input
            type="datetime-local"
            value={preorderEndsAt}
            onChange={(e) => setPreorderEndsAt(e.target.value)}
            className="rounded-lg border border-purple-200 px-2 py-1 text-sm"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-2xl bg-pink-50/60 p-3">
        <p className="text-xs font-semibold text-pink-700">
          匯款設定：未到開始時間顯示「尚未開放匯款」，期間內顯示下方匯款資料，超過截止時間顯示「匯款期限已截止」（是否補交由人工操作）
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500">匯款開始時間</label>
            <input
              type="datetime-local"
              value={remittanceStartsAt}
              onChange={(e) => setRemittanceStartsAt(e.target.value)}
              className="rounded-lg border border-pink-200 px-2 py-1 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500">匯款截止時間</label>
            <input
              type="datetime-local"
              value={remittanceEndsAt}
              onChange={(e) => setRemittanceEndsAt(e.target.value)}
              className="rounded-lg border border-pink-200 px-2 py-1 text-sm"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500">銀行名稱</label>
            <input
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              className="rounded-lg border border-pink-200 px-2 py-1 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500">銀行代碼</label>
            <input
              value={bankCode}
              onChange={(e) => setBankCode(e.target.value)}
              className="rounded-lg border border-pink-200 px-2 py-1 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500">戶名</label>
            <input
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              className="rounded-lg border border-pink-200 px-2 py-1 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-500">帳號</label>
            <input
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              className="rounded-lg border border-pink-200 px-2 py-1 text-sm"
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500">匯款備註</label>
          <textarea
            value={remittanceNote}
            onChange={(e) => setRemittanceNote(e.target.value)}
            rows={2}
            className="rounded-lg border border-pink-200 px-2 py-1 text-sm"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-500">賣貨便說明或連結（現貨到貨後給買家的提領資訊）</label>
        <textarea
          value={marketplaceNote}
          onChange={(e) => setMarketplaceNote(e.target.value)}
          rows={2}
          className="rounded-lg border border-purple-200 px-3 py-2"
        />
      </div>

      <button
        onClick={handleSave}
        disabled={isPending}
        className="w-fit rounded-full bg-purple-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {isPending ? "儲存中..." : "儲存商店設定"}
      </button>
      {message && <p className="text-xs text-purple-600">{message}</p>}
    </div>
  );
}
