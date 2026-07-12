"use client";

import { useState, useTransition } from "react";
import { logoutStaff } from "@/lib/actions/pos-auth";
import { changeOwnPassword } from "@/lib/actions/pos-staff";
import { GlassCard } from "@/components/pos/GlassCard";
import { GlowButton } from "@/components/pos/GlowButton";

// 右上角登入資訊的下拉選單：我的帳號（修改密碼）／登出。POS 收銀頁跟後台側欄
// 都共用這一個元件，兩邊的登入資訊區塊長得不一樣，但選單內容一致。
export function PosUserMenu({ displayName }: { displayName: string }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isChangeOpen, setIsChangeOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function openChangePassword() {
    setIsMenuOpen(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setMessage(null);
    setIsChangeOpen(true);
  }

  function submitChangePassword() {
    if (newPassword !== confirmPassword) {
      setMessage("兩次輸入的新密碼不一致");
      return;
    }
    startTransition(async () => {
      const result = await changeOwnPassword(currentPassword, newPassword);
      setMessage(result.message);
      if (result.success) {
        setTimeout(() => setIsChangeOpen(false), 1200);
      }
    });
  }

  function handleLogout() {
    startTransition(async () => {
      await logoutStaff();
      window.location.href = "/pos/login";
    });
  }

  return (
    <div className="relative text-sm text-[var(--pos-text-muted)]">
      <button
        type="button"
        onClick={() => setIsMenuOpen((v) => !v)}
        className="flex items-center gap-1 hover:text-[var(--pos-gold)]"
      >
        {displayName} <span className="text-xs">▾</span>
      </button>

      {isMenuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)} />
          <div className="pos-glass absolute right-0 z-50 mt-2 flex w-36 flex-col gap-1 rounded-xl p-2 text-sm">
            <p className="px-2 pb-1 pt-0.5 text-xs text-[var(--pos-text-muted)]">我的帳號</p>
            <button
              type="button"
              onClick={openChangePassword}
              className="rounded px-2 py-1.5 text-left hover:bg-white/5 hover:text-[var(--pos-gold)]"
            >
              修改密碼
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded px-2 py-1.5 text-left hover:bg-white/5 hover:text-[var(--pos-gold)]"
            >
              登出
            </button>
          </div>
        </>
      )}

      {isChangeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <GlassCard className="w-full max-w-sm text-left">
            <h3 className="mb-4 text-lg font-semibold" style={{ color: "var(--pos-gold)" }}>
              修改密碼
            </h3>
            <label className="mb-1 block text-xs text-[var(--pos-text-muted)]">目前密碼</label>
            <input
              type="password"
              className="pos-input mb-3 w-full px-3 py-2 text-sm"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoFocus
            />
            <label className="mb-1 block text-xs text-[var(--pos-text-muted)]">新密碼</label>
            <input
              type="password"
              className="pos-input mb-3 w-full px-3 py-2 text-sm"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <label className="mb-1 block text-xs text-[var(--pos-text-muted)]">再次確認新密碼</label>
            <input
              type="password"
              className="pos-input mb-3 w-full px-3 py-2 text-sm"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            {message && (
              <p className="mb-3 text-sm" style={{ color: "var(--pos-gold)" }}>
                {message}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsChangeOpen(false)}
                className="pos-input flex-1 py-2 text-sm"
                disabled={isPending}
              >
                取消
              </button>
              <GlowButton
                onClick={submitChangePassword}
                disabled={isPending || !currentPassword || !newPassword || !confirmPassword}
                className="flex-1 py-2"
              >
                {isPending ? "處理中..." : "儲存"}
              </GlowButton>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
