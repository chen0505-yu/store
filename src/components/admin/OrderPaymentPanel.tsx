"use client";

import { useState, useTransition } from "react";
import type {
  PaymentView,
  PreorderPaymentStatus,
  SupplementPaymentMethod,
  SupplementStatus,
  SupplementView,
} from "@/lib/types";
import { setOrderPaymentStatus } from "@/lib/actions/orders";
import { createSupplement } from "@/lib/actions/supplements";
import {
  PAYMENT_STATUS_LABEL,
  PAYMENT_STATUS_ORDER,
  SUPPLEMENT_PAYMENT_METHOD_LABEL,
  SUPPLEMENT_PAYMENT_METHOD_ORDER,
  SUPPLEMENT_STATUS_LABEL,
} from "@/lib/product-status";
import { ImageLightbox } from "./ImageLightbox";

const SUPPLEMENT_STATUS_ORDER: SupplementStatus[] = ["pending", "completed", "not_needed", "cancelled"];

export function OrderPaymentPanel({
  orderId,
  orderNumber,
  paymentStatus,
  payment,
  supplements,
  label = "補款",
}: {
  orderId: string;
  orderNumber?: string;
  paymentStatus: PreorderPaymentStatus | null;
  payment: PaymentView | null;
  supplements: SupplementView[];
  label?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showSupplementForm, setShowSupplementForm] = useState(false);
  const [amount, setAmount] = useState("0");
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState<SupplementStatus>("pending");
  const [paymentMethod, setPaymentMethod] = useState<SupplementPaymentMethod>("remittance");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handlePaymentStatusChange(next: PreorderPaymentStatus) {
    startTransition(async () => {
      await setOrderPaymentStatus(orderId, next);
    });
  }

  function handleCreateSupplement() {
    startTransition(async () => {
      const result = await createSupplement(
        orderId,
        Number(amount) || 0,
        reason,
        status,
        note,
        paymentMethod
      );
      setMessage(result.message);
      if (result.success) {
        setAmount("0");
        setReason("");
        setNote("");
        setPaymentMethod("remittance");
        setShowSupplementForm(false);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <select
          value={paymentStatus ?? "not_remitted"}
          onChange={(e) => handlePaymentStatusChange(e.target.value as PreorderPaymentStatus)}
          disabled={isPending}
          className="rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs text-purple-700"
        >
          {PAYMENT_STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {PAYMENT_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-purple-500 underline"
        >
          {expanded ? `收合匯款/${label}` : `查看匯款/${label}`}
        </button>
      </div>

      {expanded && (
        <div className="w-full max-w-sm rounded-2xl bg-purple-50/60 p-3 text-left text-xs">
          {orderNumber && <p className="mb-1 font-mono text-[11px] text-purple-400">{orderNumber}</p>}
          <p className="font-semibold text-purple-600">匯款資料</p>
          {payment ? (
            <div className="mt-1 flex flex-col gap-1 text-zinc-600">
              <p>
                日期：{payment.remittanceDate ?? "-"} {payment.remittanceTime ?? ""}
              </p>
              <p>帳號末五碼：{payment.accountLast5 ?? "-"}</p>
              <p>已匯款：NT$ {payment.actualAmount ?? 0}</p>
              {payment.underpaidAmount !== null && payment.underpaidAmount > 0 && (
                <p className="font-semibold text-pink-600">少匯款：NT$ {payment.underpaidAmount}</p>
              )}
              {payment.screenshotUrl && (
                <ImageLightbox src={payment.screenshotUrl} alt="匯款截圖" />
              )}
            </div>
          ) : (
            <p className="mt-1 text-zinc-400">客戶尚未提交匯款資料</p>
          )}

          <div className="mt-3 flex items-center justify-between">
            <p className="font-semibold text-pink-600">{label}</p>
            <button
              onClick={() => setShowSupplementForm((v) => !v)}
              className="rounded-full bg-pink-100 px-2 py-0.5 text-pink-600"
            >
              {showSupplementForm ? "取消" : `新增${label}`}
            </button>
          </div>

          {supplements.length > 0 && (
            <div className="mt-1 flex flex-col gap-1">
              {supplements.map((s, idx) => (
                <div key={idx} className="flex items-center justify-between text-zinc-600">
                  <span>
                    NT$ {s.amount}
                    {s.reason ? `（${s.reason}）` : ""}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-500">
                      {SUPPLEMENT_PAYMENT_METHOD_LABEL[s.paymentMethod]}
                    </span>
                    <span className="rounded-full bg-pink-100 px-2 py-0.5 text-pink-600">
                      {SUPPLEMENT_STATUS_LABEL[s.status]}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {showSupplementForm && (
            <div className="mt-2 flex flex-col gap-2 rounded-xl bg-white p-2">
              <input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`${label}金額`}
                className="rounded-lg border border-pink-200 px-2 py-1"
              />
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={`${label}原因`}
                className="rounded-lg border border-pink-200 px-2 py-1"
              />
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as SupplementStatus)}
                className="rounded-lg border border-pink-200 px-2 py-1"
              >
                {SUPPLEMENT_STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>
                    {SUPPLEMENT_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as SupplementPaymentMethod)}
                className="rounded-lg border border-pink-200 px-2 py-1"
              >
                {SUPPLEMENT_PAYMENT_METHOD_ORDER.map((m) => (
                  <option key={m} value={m}>
                    {SUPPLEMENT_PAYMENT_METHOD_LABEL[m]}
                  </option>
                ))}
              </select>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="備註"
                className="rounded-lg border border-pink-200 px-2 py-1"
              />
              <button
                onClick={handleCreateSupplement}
                disabled={isPending}
                className="rounded-full bg-pink-500 px-3 py-1 text-white disabled:opacity-50"
              >
                儲存{label}
              </button>
            </div>
          )}
          {message && <p className="mt-1 text-purple-600">{message}</p>}
        </div>
      )}
    </div>
  );
}
