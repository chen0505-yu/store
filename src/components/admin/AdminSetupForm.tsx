"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createFirstAdmin } from "@/lib/actions/admin-setup";

export function AdminSetupForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await createFirstAdmin(username, password, displayName);
      setMessage(result.message);
      if (result.success) {
        setTimeout(() => router.push("/admin/login"), 1000);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4 rounded-3xl bg-white p-6 shadow-sm">
      <h1 className="text-center text-2xl font-bold text-purple-700">建立第一個管理員帳號</h1>
      <p className="text-center text-xs text-zinc-400">
        僅開發環境可用，且只有在還沒有任何管理員帳號時才能建立。
      </p>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-500">帳號</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          className="rounded-lg border border-purple-200 px-3 py-2"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-500">顯示名稱</label>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="rounded-lg border border-purple-200 px-3 py-2"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-500">密碼（至少 8 碼）</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          className="rounded-lg border border-purple-200 px-3 py-2"
        />
      </div>
      {message && <p className="text-xs text-purple-600">{message}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-full bg-gradient-to-r from-pink-400 to-purple-400 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {isPending ? "建立中..." : "建立管理員帳號"}
      </button>
    </form>
  );
}
