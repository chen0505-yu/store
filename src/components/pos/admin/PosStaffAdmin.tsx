"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PosStaffAccount } from "@/lib/data/pos-staff";
import type { PosStaffRole } from "@/lib/pos-auth";
import { createStaffAccount, setStaffActive, resetStaffPassword, deleteStaffAccount } from "@/lib/actions/pos-staff";
import { GlassCard } from "@/components/pos/GlassCard";
import { GlowButton } from "@/components/pos/GlowButton";

const ROLE_LABEL: Record<PosStaffRole, string> = {
  super_admin: "超級管理員",
  sub_admin: "副管理員",
  staff: "小幫手",
};

export function PosStaffAdmin({
  accounts,
  canManageAll,
}: {
  accounts: PosStaffAccount[];
  canManageAll: boolean;
}) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<PosStaffRole>("staff");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const availableRoles: PosStaffRole[] = canManageAll ? ["super_admin", "sub_admin", "staff"] : ["sub_admin", "staff"];

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createStaffAccount({ username, password, displayName, role });
      setMessage(result.message);
      if (result.success) {
        setUsername("");
        setPassword("");
        setDisplayName("");
        setRole("staff");
        router.refresh();
      }
    });
  }

  function toggleActive(account: PosStaffAccount) {
    startTransition(async () => {
      await setStaffActive(account.id, !account.isActive);
      router.refresh();
    });
  }

  function handleResetPassword(id: string) {
    const newPassword = prompt("請輸入新密碼（至少 6 碼）");
    if (!newPassword) return;
    startTransition(async () => {
      const result = await resetStaffPassword(id, newPassword);
      setMessage(result.message);
    });
  }

  function remove(id: string) {
    if (!confirm("確定要刪除這個帳號嗎？")) return;
    startTransition(async () => {
      const result = await deleteStaffAccount(id);
      setMessage(result.message);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold" style={{ color: "var(--pos-gold)" }}>
        員工管理
      </h1>

      <GlassCard>
        <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--pos-text-muted)]">帳號</label>
            <input className="pos-input px-3 py-2 text-sm" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--pos-text-muted)]">密碼</label>
            <input
              type="password"
              className="pos-input px-3 py-2 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--pos-text-muted)]">顯示名稱</label>
            <input
              className="pos-input px-3 py-2 text-sm"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[var(--pos-text-muted)]">角色</label>
            <select
              className="pos-input px-3 py-2 text-sm"
              value={role}
              onChange={(e) => setRole(e.target.value as PosStaffRole)}
            >
              {availableRoles.map((r) => (
                <option key={r} value={r} className="bg-[#1a1140]">
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </div>
          <GlowButton type="submit" disabled={isPending}>
            新增帳號
          </GlowButton>
        </form>
        {message && <p className="mt-2 text-sm text-[var(--pos-gold)]">{message}</p>}
      </GlassCard>

      <div className="flex flex-col gap-2">
        {accounts.map((account) => (
          <GlassCard key={account.id} className="flex items-center justify-between gap-3">
            <div className="flex-1">
              <p className="font-semibold">
                {account.displayName} <span className="text-xs text-[var(--pos-text-muted)]">@{account.username}</span>
              </p>
              <p className="text-xs" style={{ color: "var(--pos-gold)" }}>
                {ROLE_LABEL[account.role]}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-sm">
              <span style={{ color: account.isActive ? "var(--pos-gold)" : undefined }} className={account.isActive ? "" : "text-[var(--pos-text-muted)]"}>
                {account.isActive ? "啟用中" : "已停用"}
              </span>
              <button onClick={() => toggleActive(account)} className="pos-input px-3 py-1.5 text-xs">
                {account.isActive ? "停用" : "啟用"}
              </button>
              <button onClick={() => handleResetPassword(account.id)} className="pos-input px-3 py-1.5 text-xs">
                重設密碼
              </button>
              {canManageAll && (
                <button onClick={() => remove(account.id)} className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300">
                  刪除
                </button>
              )}
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
