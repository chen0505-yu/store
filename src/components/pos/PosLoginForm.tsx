"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loginStaff } from "@/lib/actions/pos-auth";
import { GlowButton } from "@/components/pos/GlowButton";

export function PosLoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result = await loginStaff(username, password);
      if (result.success) {
        router.push("/pos");
        router.refresh();
      } else {
        setMessage(result.message);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="pos-glass flex w-full max-w-sm flex-col gap-4 p-8">
      <h1 className="text-center text-2xl font-bold" style={{ color: "var(--pos-gold)" }}>
        LITAN POS
      </h1>
      <p className="text-center text-xs text-[var(--pos-text-muted)]">同人活動現場收銀系統</p>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-[var(--pos-text-muted)]">帳號</label>
        <input
          className="pos-input px-3 py-2 text-sm"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-[var(--pos-text-muted)]">密碼</label>
        <input
          type="password"
          className="pos-input px-3 py-2 text-sm"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </div>
      {message && <p className="text-center text-sm text-red-400">{message}</p>}
      <GlowButton type="submit" disabled={isPending} className="w-full py-2.5">
        {isPending ? "登入中..." : "登入"}
      </GlowButton>
    </form>
  );
}
