import Link from "next/link";
import { getCurrentMember } from "@/lib/auth";

export default async function MemberPage() {
  const member = await getCurrentMember();

  if (!member) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <h1 className="mb-6 text-2xl font-bold text-purple-700">會員中心</h1>
        <p className="text-zinc-500">
          請先{" "}
          <Link href="/login" className="text-purple-600 underline">
            登入
          </Link>{" "}
          或{" "}
          <Link href="/register" className="text-purple-600 underline">
            註冊
          </Link>{" "}
          會員。
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold text-purple-700">會員中心</h1>
      <p className="mb-6 text-sm text-zinc-500">
        {member.fbName}，歡迎回來。
        {member.isBlacklisted && (
          <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-500">
            您的帳號目前無法下單，請聯繫管理員
          </span>
        )}
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href="/member/preorder-orders"
          className="rounded-3xl bg-gradient-to-br from-purple-400 to-purple-300 p-6 text-white shadow-md transition hover:-translate-y-1"
        >
          <h2 className="text-lg font-bold">我的預購訂單</h2>
          <p className="mt-1 text-sm text-white/80">查看匯款狀態與到貨進度</p>
        </Link>
        <Link
          href="/member/artist-orders"
          className="rounded-3xl bg-gradient-to-br from-fuchsia-400 to-purple-300 p-6 text-white shadow-md transition hover:-translate-y-1"
        >
          <h2 className="text-lg font-bold">我的繪師預購訂單</h2>
          <p className="mt-1 text-sm text-white/80">查看匯款狀態與到貨進度</p>
        </Link>
        <Link
          href="/member/shipment-orders"
          className="rounded-3xl bg-gradient-to-br from-purple-300 to-pink-300 p-6 text-white shadow-md transition hover:-translate-y-1"
        >
          <h2 className="text-lg font-bold">我的出貨訂單</h2>
          <p className="mt-1 text-sm text-white/80">預購商品合併出貨後的出貨訂單</p>
        </Link>
        <Link
          href="/member/instock-orders"
          className="rounded-3xl bg-gradient-to-br from-pink-400 to-pink-300 p-6 text-white shadow-md transition hover:-translate-y-1"
        >
          <h2 className="text-lg font-bold">我的現貨訂單</h2>
          <p className="mt-1 text-sm text-white/80">查看賣貨便出貨進度</p>
        </Link>
      </div>
    </div>
  );
}
