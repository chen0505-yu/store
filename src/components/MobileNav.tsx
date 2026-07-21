"use client";

import { useState } from "react";
import Link from "next/link";
import { logoutMember } from "@/lib/actions/auth";

async function handleLogout() {
  await logoutMember();
}

// 手機版導覽選單：桌機維持原本橫向導覽列，這個元件只在 md 以下顯示。
// 後台連結只有目前有管理員 session 才顯示，避免一般客人在手機上看到後台入口。
export function MobileNav({
  memberName,
  isAdmin,
}: {
  memberName: string | null;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="選單"
        className="flex items-center gap-1 rounded-full border border-purple-200 px-3 py-1.5 text-sm font-medium text-purple-600"
      >
        <span>☰</span>
        <span>選單</span>
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={close}
            className="fixed inset-0 z-30 cursor-default"
          />
          <div className="absolute right-0 top-full z-40 mt-2 flex w-48 flex-col gap-1 rounded-2xl bg-white p-3 text-sm font-medium text-purple-600 shadow-lg">
            <Link href="/preorder" onClick={close} className="rounded-lg px-3 py-2 hover:bg-purple-50">
              葴葴預購專區
            </Link>
            <Link href="/artist" onClick={close} className="rounded-lg px-3 py-2 hover:bg-purple-50">
              繪師預購專區
            </Link>
            <Link href="/member" onClick={close} className="rounded-lg px-3 py-2 hover:bg-purple-50">
              會員中心
            </Link>
            <Link
              href="/member/preorder-orders"
              onClick={close}
              className="rounded-lg px-3 py-2 hover:bg-purple-50"
            >
              我的預購訂單
            </Link>
            <Link
              href="/member/artist-orders"
              onClick={close}
              className="rounded-lg px-3 py-2 hover:bg-purple-50"
            >
              我的繪師預購訂單
            </Link>
            <Link
              href="/member/shipment-orders"
              onClick={close}
              className="rounded-lg px-3 py-2 hover:bg-purple-50"
            >
              我的出貨訂單
            </Link>
            {memberName ? (
              <form action={handleLogout}>
                <button
                  type="submit"
                  onClick={close}
                  className="w-full rounded-lg px-3 py-2 text-left hover:bg-purple-50"
                >
                  登出
                </button>
              </form>
            ) : (
              <>
                <Link href="/login" onClick={close} className="rounded-lg px-3 py-2 hover:bg-purple-50">
                  登入
                </Link>
                <Link href="/register" onClick={close} className="rounded-lg px-3 py-2 hover:bg-purple-50">
                  註冊
                </Link>
              </>
            )}
            {isAdmin && (
              <Link
                href="/admin"
                onClick={close}
                className="rounded-lg px-3 py-2 text-xs text-zinc-400 hover:bg-purple-50"
              >
                後台
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}
