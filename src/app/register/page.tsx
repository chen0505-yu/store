"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { registerMember } from "@/lib/actions/auth";
import { isFacebookProfileUrl } from "@/lib/validation";

export default function RegisterPage() {
  const router = useRouter();
  const [fbName, setFbName] = useState("");
  const [fbProfileUrl, setFbProfileUrl] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!isFacebookProfileUrl(fbProfileUrl)) {
      setMessage("FB 個人頁面連結必須是 facebook.com 網址");
      return;
    }

    setIsSubmitting(true);
    const result = await registerMember({ fbName, fbProfileUrl, phone, password });
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
      <h1 className="mb-6 text-2xl font-bold text-purple-700">會員註冊</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-3xl bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500">FB 名字 *</label>
          <input
            value={fbName}
            onChange={(e) => setFbName(e.target.value)}
            required
            className="rounded-lg border border-purple-200 px-3 py-2"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500">FB 個人頁面連結 *</label>
          <input
            value={fbProfileUrl}
            onChange={(e) => setFbProfileUrl(e.target.value)}
            placeholder="https://www.facebook.com/..."
            required
            className="rounded-lg border border-purple-200 px-3 py-2"
          />
          <p className="text-[11px] text-zinc-400">需為 facebook.com 或 www.facebook.com 網址</p>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500">手機號碼 *</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            className="rounded-lg border border-purple-200 px-3 py-2"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500">密碼 *（至少 6 碼）</label>
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
          {isSubmitting ? "註冊中..." : "註冊"}
        </button>
        {message && <p className="text-xs text-red-500">{message}</p>}
        <p className="text-center text-xs text-zinc-400">
          已經有帳號了？{" "}
          <Link href="/login" className="text-purple-600 underline">
            登入
          </Link>
        </p>
      </form>
    </div>
  );
}
