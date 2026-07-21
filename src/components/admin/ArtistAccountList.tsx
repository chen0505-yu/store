"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ArtistAccount } from "@/lib/data/artist-accounts";
import { createArtistAccount, resetArtistPassword, setArtistActive } from "@/lib/actions/artist-accounts";

export function ArtistAccountList({ artists }: { artists: ArtistAccount[] }) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [shopName, setShopName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleCreate() {
    startTransition(async () => {
      const result = await createArtistAccount(username, password, displayName, shopName);
      setMessage(result.message);
      if (result.success) {
        setUsername("");
        setPassword("");
        setDisplayName("");
        setShopName("");
        setShowCreateForm(false);
        router.refresh();
      }
    });
  }

  function handleResetPassword(adminId: string) {
    startTransition(async () => {
      const result = await resetArtistPassword(adminId, newPassword);
      setMessage(result.message);
      if (result.success) {
        setResettingId(null);
        setNewPassword("");
      }
    });
  }

  function handleToggleActive(adminId: string, isActive: boolean) {
    startTransition(async () => {
      const result = await setArtistActive(adminId, !isActive);
      setMessage(result.message);
      if (result.success) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {message && <div className="rounded-2xl bg-purple-50 p-3 text-sm text-purple-600">{message}</div>}

      <button
        onClick={() => setShowCreateForm((v) => !v)}
        className="self-start rounded-full bg-gradient-to-r from-pink-400 to-purple-400 px-5 py-2 text-sm font-semibold text-white"
      >
        {showCreateForm ? "取消" : "新增繪師帳號"}
      </button>

      {showCreateForm && (
        <div className="flex flex-col gap-2 rounded-2xl bg-purple-50/60 p-4">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="登入帳號"
            className="rounded-lg border border-purple-200 px-3 py-2 text-sm"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="初始密碼（至少 8 碼）"
            className="rounded-lg border border-purple-200 px-3 py-2 text-sm"
          />
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="顯示名稱"
            className="rounded-lg border border-purple-200 px-3 py-2 text-sm"
          />
          <input
            value={shopName}
            onChange={(e) => setShopName(e.target.value)}
            placeholder="商店名稱"
            className="rounded-lg border border-purple-200 px-3 py-2 text-sm"
          />
          <button
            onClick={handleCreate}
            disabled={isPending}
            className="self-start rounded-full bg-purple-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {isPending ? "建立中..." : "建立帳號"}
          </button>
        </div>
      )}

      {artists.length === 0 ? (
        <p className="text-sm text-zinc-400">目前沒有繪師帳號</p>
      ) : (
        <div className="flex flex-col gap-3">
          {artists.map((artist) => (
            <div key={artist.id} className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-purple-700">
                    {artist.displayName}（{artist.username}）
                  </p>
                  <p className="text-xs text-zinc-400">
                    商店：{artist.teacherName}　Teacher ID：{artist.teacherCode}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      artist.isActive ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-400"
                    }`}
                  >
                    {artist.isActive ? "已啟用" : "已停用"}
                  </span>
                  <button
                    onClick={() => setResettingId(resettingId === artist.id ? null : artist.id)}
                    className="rounded-full bg-purple-50 px-3 py-1 text-xs text-purple-600"
                  >
                    重設密碼
                  </button>
                  <button
                    onClick={() => handleToggleActive(artist.id, artist.isActive)}
                    disabled={isPending}
                    className={`rounded-full px-3 py-1 text-xs font-semibold text-white disabled:opacity-40 ${
                      artist.isActive ? "bg-red-500" : "bg-green-500"
                    }`}
                  >
                    {artist.isActive ? "停用" : "啟用"}
                  </button>
                </div>
              </div>
              {resettingId === artist.id && (
                <div className="flex items-center gap-2 border-t border-purple-50 pt-2">
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="新密碼（至少 8 碼）"
                    className="flex-1 rounded-lg border border-purple-200 px-3 py-1.5 text-sm"
                  />
                  <button
                    onClick={() => handleResetPassword(artist.id)}
                    disabled={isPending}
                    className="rounded-full bg-purple-500 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    確認重設
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
