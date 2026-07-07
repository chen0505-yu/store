import { getPreorderQuantityStats } from "@/lib/data/preorder-stats";
import { EmptyState } from "@/components/EmptyState";

export default async function AdminProductStatsPage() {
  const stats = await getPreorderQuantityStats();
  const grandTotal = stats.reduce((sum, t) => sum + t.teacherTotal, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-purple-700">預購商品品項總數</h1>
        <p className="mt-1 text-sm text-zinc-500">
          只計入已匯款確認完成、或補款已完成的訂單，方便向廠商訂貨。
        </p>
        <p className="mt-2 text-lg font-bold text-pink-600">全部老師總件數：{grandTotal}</p>
      </div>

      {stats.length === 0 ? (
        <EmptyState text="目前沒有符合付款狀態的預購訂單" />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {stats.map((teacher) => (
            <div key={teacher.teacherCode} className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
              <div>
                <p className="font-semibold text-purple-700">{teacher.teacherName}</p>
                <p className="font-mono text-xs text-zinc-400">Teacher ID：{teacher.teacherCode}</p>
              </div>

              <div className="flex flex-col gap-2">
                {teacher.groups.map((group) => (
                  <div key={group.groupName} className="rounded-xl bg-purple-50/50 p-2">
                    <p className="text-sm font-semibold text-zinc-700">{group.groupName}</p>
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {group.variants.map((variant) => (
                        <li
                          key={variant.variantName}
                          className="flex items-center justify-between text-xs text-zinc-600"
                        >
                          <span>{variant.variantName}</span>
                          <span className="font-semibold">{variant.quantity}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <p className="border-t border-purple-50 pt-2 text-right text-sm font-bold text-pink-600">
                該老師總件數：{teacher.teacherTotal}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
