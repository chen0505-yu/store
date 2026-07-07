import Link from "next/link";
import { getPreorderTeacherSummaries } from "@/lib/data/teacher-shop";
import { TeacherBrowseList } from "@/components/TeacherBrowseList";
import { EmptyState } from "@/components/EmptyState";

export default async function PreorderPage() {
  const teachers = await getPreorderTeacherSummaries();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-purple-700">預購專區</h1>
          <p className="text-sm text-zinc-500">
            點進老師賣場即可一次瀏覽、調整多個品項/細項的數量，下單後請完成匯款，等待老師到貨後統一合併出貨。
          </p>
        </div>
        <Link
          href="/preorder/cart"
          className="rounded-full bg-purple-500 px-4 py-2 text-sm font-medium text-white"
        >
          預購購物車
        </Link>
      </div>

      {teachers.length === 0 ? (
        <EmptyState text="目前尚無老師賣場，請至後台建立。" />
      ) : (
        <TeacherBrowseList teachers={teachers} />
      )}
    </div>
  );
}
