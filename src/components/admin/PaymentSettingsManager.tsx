"use client";

import { useState, useTransition } from "react";
import type { PaymentSettingsView } from "@/lib/data/payment-settings";
import {
  createPaymentSettings,
  setActivePaymentSettings,
  updatePaymentSettings,
  type PaymentSettingsInput,
} from "@/lib/actions/payment-settings";

const EMPTY_INPUT: PaymentSettingsInput = {
  bankName: "",
  bankCode: "",
  accountName: "",
  accountNumber: "",
  remittanceNote: "",
  isActive: false,
};

function AccountForm({
  initial,
  onSaved,
  submitLabel,
}: {
  initial: PaymentSettingsInput;
  onSaved: (input: PaymentSettingsInput) => Promise<{ success: boolean; message: string }>;
  submitLabel: string;
}) {
  const [form, setForm] = useState(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    startTransition(async () => {
      const result = await onSaved(form);
      setMessage(result.message);
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-purple-50/60 p-4">
      <div className="grid grid-cols-2 gap-2">
        <input
          value={form.bankName}
          onChange={(e) => setForm({ ...form, bankName: e.target.value })}
          placeholder="銀行名稱"
          className="rounded-lg border border-purple-200 px-3 py-2 text-sm"
        />
        <input
          value={form.bankCode}
          onChange={(e) => setForm({ ...form, bankCode: e.target.value })}
          placeholder="銀行代碼"
          className="rounded-lg border border-purple-200 px-3 py-2 text-sm"
        />
        <input
          value={form.accountName}
          onChange={(e) => setForm({ ...form, accountName: e.target.value })}
          placeholder="戶名"
          className="rounded-lg border border-purple-200 px-3 py-2 text-sm"
        />
        <input
          value={form.accountNumber}
          onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
          placeholder="帳號"
          className="rounded-lg border border-purple-200 px-3 py-2 text-sm"
        />
      </div>
      <input
        value={form.remittanceNote}
        onChange={(e) => setForm({ ...form, remittanceNote: e.target.value })}
        placeholder="匯款備註（選填）"
        className="rounded-lg border border-purple-200 px-3 py-2 text-sm"
      />
      <label className="flex items-center gap-2 text-sm text-zinc-600">
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
        />
        設為啟用帳戶（客戶下單完成頁與會員中心會顯示這組帳戶）
      </label>
      <button
        onClick={handleSubmit}
        disabled={isPending}
        className="self-start rounded-full bg-gradient-to-r from-pink-400 to-purple-400 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {isPending ? "儲存中..." : submitLabel}
      </button>
      {message && <p className="text-xs text-purple-600">{message}</p>}
    </div>
  );
}

function AccountRow({ account }: { account: PaymentSettingsView }) {
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSetActive() {
    startTransition(async () => {
      const result = await setActivePaymentSettings(account.id);
      setMessage(result.message);
    });
  }

  if (editing) {
    return (
      <AccountForm
        submitLabel="更新帳戶"
        initial={{
          bankName: account.bankName,
          bankCode: account.bankCode ?? "",
          accountName: account.accountName,
          accountNumber: account.accountNumber,
          remittanceNote: account.remittanceNote ?? "",
          isActive: account.isActive,
        }}
        onSaved={async (input) => {
          const result = await updatePaymentSettings(account.id, input);
          if (result.success) setEditing(false);
          return result;
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-zinc-800">
            {account.bankName}
            {account.bankCode ? `（${account.bankCode}）` : ""}
          </p>
          <p className="text-sm text-zinc-600">
            戶名：{account.accountName}　帳號：{account.accountNumber}
          </p>
          {account.remittanceNote && (
            <p className="text-xs text-zinc-400">備註：{account.remittanceNote}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {account.isActive ? (
            <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
              啟用中
            </span>
          ) : (
            <button
              onClick={handleSetActive}
              disabled={isPending}
              className="rounded-full bg-purple-500 px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
            >
              設為啟用
            </button>
          )}
          <button
            onClick={() => setEditing(true)}
            className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700"
          >
            編輯
          </button>
        </div>
      </div>
      {message && <p className="text-xs text-purple-600">{message}</p>}
    </div>
  );
}

export function PaymentSettingsManager({ accounts }: { accounts: PaymentSettingsView[] }) {
  const [showForm, setShowForm] = useState(accounts.length === 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {accounts.map((account) => (
          <AccountRow key={account.id} account={account} />
        ))}
      </div>

      {showForm ? (
        <AccountForm
          submitLabel="新增帳戶"
          initial={{ ...EMPTY_INPUT, isActive: accounts.length === 0 }}
          onSaved={createPaymentSettings}
        />
      ) : (
        <button
          onClick={() => setShowForm(true)}
          className="self-start rounded-full bg-purple-100 px-4 py-2 text-sm font-semibold text-purple-700"
        >
          新增匯款帳戶
        </button>
      )}
    </div>
  );
}
