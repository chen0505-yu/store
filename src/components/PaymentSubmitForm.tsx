"use client";

import { useState, useTransition } from "react";
import type { PaymentView } from "@/lib/types";
import { submitPayment } from "@/lib/actions/payments";
import { uploadImage } from "@/lib/actions/upload";
import { MAX_IMAGE_SIZE_BYTES, MAX_IMAGE_SIZE_MESSAGE } from "@/lib/upload-constants";

export function PaymentSubmitForm({
  orderId,
  existingPayment,
}: {
  orderId: string;
  existingPayment: PaymentView | null;
}) {
  const [remittanceDate, setRemittanceDate] = useState(existingPayment?.remittanceDate ?? "");
  const [remittanceTime, setRemittanceTime] = useState(existingPayment?.remittanceTime ?? "");
  const [accountLast5, setAccountLast5] = useState(existingPayment?.accountLast5 ?? "");
  const [screenshotUrl, setScreenshotUrl] = useState(existingPayment?.screenshotUrl ?? "");
  const [actualAmount, setActualAmount] = useState(
    existingPayment?.actualAmount !== null && existingPayment?.actualAmount !== undefined
      ? String(existingPayment.actualAmount)
      : ""
  );
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, startSubmit] = useTransition();
  const [isUploading, startUpload] = useTransition();

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setMessage(MAX_IMAGE_SIZE_MESSAGE);
      e.target.value = "";
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    startUpload(async () => {
      const result = await uploadImage(formData, "payments");
      if (result.success && result.url) {
        setScreenshotUrl(result.url);
      } else {
        setMessage(result.message);
      }
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!screenshotUrl) {
      setMessage("請上傳匯款截圖才能送出");
      return;
    }
    startSubmit(async () => {
      const result = await submitPayment(orderId, {
        remittanceDate,
        remittanceTime,
        accountLast5,
        screenshotUrl,
        actualAmount: Number(actualAmount) || 0,
      });
      setMessage(result.message);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2 rounded-2xl bg-purple-50/60 p-3">
      <p className="text-xs font-semibold text-purple-600">
        {existingPayment ? "更新匯款資料" : "提交匯款資料"}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="date"
          value={remittanceDate}
          onChange={(e) => setRemittanceDate(e.target.value)}
          className="rounded-lg border border-purple-200 px-2 py-1 text-xs"
          required
        />
        <input
          type="time"
          value={remittanceTime}
          onChange={(e) => setRemittanceTime(e.target.value)}
          className="rounded-lg border border-purple-200 px-2 py-1 text-xs"
          required
        />
        <input
          value={accountLast5}
          onChange={(e) => setAccountLast5(e.target.value)}
          placeholder="無卡匯款請填：無卡"
          maxLength={5}
          className="rounded-lg border border-purple-200 px-2 py-1 text-xs"
          required
        />
        <input
          type="number"
          min={0}
          value={actualAmount}
          onChange={(e) => setActualAmount(e.target.value)}
          placeholder="實際匯款金額"
          className="rounded-lg border border-purple-200 px-2 py-1 text-xs"
          required
        />
      </div>
      <div className="flex items-center gap-2">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={handleFileChange}
          required={!screenshotUrl}
          className="text-xs"
        />
        {isUploading && <span className="text-xs text-purple-500">上傳中...</span>}
      </div>
      <p className="text-[11px] text-zinc-400">帳號末五碼：無卡匯款請填「無卡」。匯款截圖為必填，請務必上傳。</p>
      {screenshotUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={screenshotUrl} alt="匯款截圖" className="h-20 w-20 rounded-lg object-cover" />
      )}
      <button
        type="submit"
        disabled={isSubmitting || !screenshotUrl}
        className="self-start rounded-full bg-purple-500 px-4 py-1 text-xs text-white disabled:opacity-50"
      >
        {isSubmitting ? "送出中..." : "送出匯款資料"}
      </button>
      {message && <p className="text-xs text-purple-600">{message}</p>}
    </form>
  );
}
