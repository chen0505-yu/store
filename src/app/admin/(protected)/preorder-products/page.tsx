import { getAdminTeacherShops } from "@/lib/data/admin-teacher-shops";
import { getAllTags } from "@/lib/data/tags";
import { TeacherShopBatchForm } from "@/components/admin/TeacherShopBatchForm";
import { AdminTeacherShopList } from "@/components/admin/AdminTeacherShopList";
import { EmptyState } from "@/components/EmptyState";

export default async function AdminPreorderProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const [allShops, tags] = await Promise.all([getAdminTeacherShops(), getAllTags()]);

  // filter=packing（Dashboard「待開賣場」卡片）：只留下整理中的品項，並隱藏底下沒有
  // 符合品項的老師賣場。這是暫時的檢視鏡頭，不影響其餘品項的實際資料。
  const shops =
    filter === "packing"
      ? allShops
          .map((shop) => ({ ...shop, groups: shop.groups.filter((g) => g.arrivalStatus === "packing") }))
          .filter((shop) => shop.groups.length > 0)
      : allShops;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-purple-700">預購商品：老師賣場</h1>
        <p className="mt-1 text-sm text-zinc-500">
          結構為「老師 → 品項 → 細項」，例如老師「越南Hitsuzi」底下有品項「小卡」，小卡底下有細項「白厄／昔漣／萬敵」。
        </p>
        {filter === "packing" && (
          <p className="mt-2 rounded-xl bg-orange-50 px-3 py-2 text-xs text-orange-600">
            目前只顯示整理中（待開賣場）的品項，其餘品項未顯示但資料仍完整保留。
          </p>
        )}
      </div>
      <TeacherShopBatchForm allTags={tags} />
      {shops.length === 0 ? (
        <EmptyState text={filter ? "沒有符合篩選條件的品項" : "尚無老師賣場，請用上方表單建立"} />
      ) : (
        <AdminTeacherShopList shops={shops} allTags={tags} />
      )}
    </div>
  );
}
