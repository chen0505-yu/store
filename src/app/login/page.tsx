"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loginMember } from "@/lib/actions/auth";

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    const result = await loginMember({ phone, password });
    setIsSubmitting(false);
    if (result.success) {
      router.push("/member");
      router.refresh();
    } else {
      setMessage(result.message);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12">
      <h1 className="mb-6 text-2xl font-bold text-purple-700">會員登入</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-3xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500">手機號碼</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            className="rounded-lg border border-purple-200 px-3 py-2"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500">密碼</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="rounded-lg border border-purple-200 px-3 py-2"
          />
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-full bg-gradient-to-r from-pink-400 to-purple-400 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {isSubmitting ? "登入中..." : "登入"}
        </button>
        {message && <p className="text-xs text-red-500">{message}</p>}
        <p className="text-center text-xs text-zinc-400">
          還沒有帳號？{" "}
          <Link href="/register" className="text-purple-600 underline">
            註冊
          </Link>
        </p>
      </form>
    </div>
  );
}
