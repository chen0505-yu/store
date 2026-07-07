"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loginAdmin } from "@/lib/actions/admin-auth";

export function AdminLoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await loginAdmin(username, password);
      if (result.success) {
        router.push("/admin");
        router.refresh();
      } else {
        setMessage(result.message);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4 rounded-3xl bg-white p-6 shadow-sm">
      <h1 className="text-center text-2xl font-bold text-purple-700">🦝 LITAN 後台登入</h1>
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
        <label className="text-xs text-zinc-500">密碼</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="rounded-lg border border-purple-200 px-3 py-2"
        />
      </div>
      {message && <p className="text-xs text-red-500">{message}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="rounded-full bg-gradient-to-r from-pink-400 to-purple-400 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {isPending ? "登入中..." : "登入"}
      </button>
    </form>
  );
}
