import Link from "next/link";
import { getInstockTeacherSummaries } from "@/lib/data/instock-shop";
import { getInstockSettings } from "@/lib/data/instock-settings";
import { getInstockPhase } from "@/lib/product-availability";
import { InstockBrowseList } from "@/components/InstockBrowseList";
import { EmptyState } from "@/components/EmptyState";

export default async function InstockPage() {
  const settings = await getInstockSettings();
  const phase = getInstockPhase(settings);

  const teachers = phase === "closed" || phase === "not_started" ? [] : await getInstockTeacherSummaries();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-pink-600">現貨專區</h1>
          <p className="text-sm text-zinc-500">
            點進老師現貨賣場即可瀏覽、調整多個品項/細項的數量，下單後至賣貨便完成付款即可，不需要匯款。
          </p>
        </div>
        <Link
          href="/instock/cart"
          className="rounded-full bg-pink-500 px-4 py-2 text-sm font-medium text-white"
        >
          現貨購物車
        </Link>
      </div>

      {phase === "closed" ? (
        <EmptyState text="現貨區整理中，尚未開放。" />
      ) : phase === "not_started" ? (
        <EmptyState text="現貨尚未開始，請稍後再回來看看。" />
      ) : teachers.length === 0 ? (
        <EmptyState text="目前尚無現貨老師賣場，請至後台建立。" />
      ) : (
        <>
          {phase === "ended" && (
            <div className="mb-4 rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-600">
              期間限定已結束，商品保留顯示但無法下單。
            </div>
          )}
          <InstockBrowseList teachers={teachers} />
        </>
      )}
    </div>
  );
}
