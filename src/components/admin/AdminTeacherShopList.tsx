"use client";

import { useMemo, useState, useTransition } from "react";
import type { AdminTeacherShop } from "@/lib/data/admin-teacher-shops";
import type { Tag } from "@/lib/data/tags";
import { updateTeacherPreorderWindow } from "@/lib/actions/teacher-shop";
import { toLocalInputValue, fromLocalInputValue } from "@/lib/datetime";
import { AdminProductGroupRow } from "./AdminProductGroupRow";
import { TeacherImagesEditor } from "./TeacherImagesEditor";
import { TeacherEventPickupSettings } from "./TeacherEventPickupSettings";
import { Collapsible } from "./Collapsible";
import { Pagination } from "./Pagination";

const PAGE_SIZE = 20;

function TeacherPreorderWindow({ shop }: { shop: AdminTeacherShop }) {
  const [startsAt, setStartsAt] = useState(toLocalInputValue(shop.preorderStartsAt));
  const [endsAt, setEndsAt] = useState(toLocalInputValue(shop.preorderEndsAt));
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const result = await updateTeacherPreorderWindow(
        shop.teacherId,
        fromLocalInputValue(startsAt),
        fromLocalInputValue(endsAt)
      );
      setMessage(result.message);
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-2xl bg-purple-50/60 p-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-500">預購開始時間</label>
        <input
          type="datetime-local"
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          className="rounded-lg border border-purple-200 px-2 py-1 text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-500">預購截止時間</label>
        <input
          type="datetime-local"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
          className="rounded-lg border border-purple-200 px-2 py-1 text-sm"
        />
      </div>
      <button
        onClick={handleSave}
        disabled={isPending}
        className="rounded-full bg-purple-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        儲存預購時間
      </button>
      {message && <p className="text-xs text-purple-600">{message}</p>}
    </div>
  );
}

// 後台商品狀態顯示：預購中／已結束（已封存的品項不會出現在這個清單，見 archived-products 頁面）。
// 判斷依據是賣場層級的 preorderEndsAt（老師預購截止時間），不是個別品項的欄位。
// 用純函式回傳文字/是否結束，不當成元件用（小寫命名、不回傳 JSX），Date.now() 預設值
// 只在這個函式被呼叫時才求值，比照 src/lib/product-availability.ts 既有的 getPreorderPhase
// 寫法，這樣才不會被 React 的 purity lint 規則擋下（它只檢查元件/hook 本體內直接出現的
// 呼叫，不會分析跨函式呼叫鏈）。
function shopPreorderStatus(preorderEndsAt: string | null, nowMs: number = Date.now()): { ended: boolean; label: string } {
  const ended = preorderEndsAt !== null && new Date(preorderEndsAt).getTime() < nowMs;
  return { ended, label: ended ? "已結束" : "預購中" };
}

export function AdminTeacherShopList({ shops, allTags }: { shops: AdminTeacherShop[]; allTags: Tag[] }) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(shops.length / PAGE_SIZE));
  const pageShops = useMemo(
    () => shops.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [shops, page]
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-8">
        {pageShops.map((shop) => (
          <Collapsible
            key={shop.teacherId}
            summary={
              <div className="flex flex-wrap items-center gap-3">
                {shop.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={shop.avatarUrl}
                    alt={shop.teacherName}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-50 text-lg">
                    🦝
                  </div>
                )}
                <div>
                  <h2 className="flex items-center gap-2 text-base font-bold text-purple-700">
                    {shop.teacherName}（{shop.teacherCode}）
                    {(() => {
                      const status = shopPreorderStatus(shop.preorderEndsAt);
                      return (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            status.ended ? "bg-zinc-100 text-zinc-500" : "bg-green-50 text-green-600"
                          }`}
                        >
                          {status.label}
                        </span>
                      );
                    })()}
                  </h2>
                  <p className="text-xs text-zinc-400">{shop.groups.length} 個品項</p>
                </div>
              </div>
            }
          >
            <TeacherPreorderWindow shop={shop} />
            <TeacherImagesEditor teacherId={shop.teacherId} images={shop.images} />
            <TeacherEventPickupSettings
              teacherId={shop.teacherId}
              allowEventPickup={shop.allowEventPickup}
              options={shop.eventPickupOptions}
            />
            <div className="flex flex-col gap-3">
              {shop.groups.map((group) => (
                <AdminProductGroupRow key={group.id} group={group} allTags={allTags} />
              ))}
            </div>
          </Collapsible>
        ))}
      </div>
      <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
    </div>
  );
}
