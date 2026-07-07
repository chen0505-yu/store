import { getAdminTeacherShops } from "@/lib/data/admin-teacher-shops";
import { getAllTags } from "@/lib/data/tags";
import { TeacherShopBatchForm } from "@/components/admin/TeacherShopBatchForm";
import { AdminTeacherShopList } from "@/components/admin/AdminTeacherShopList";
import { EmptyState } from "@/components/EmptyState";

export default async function AdminPreorderProductsPage() {
  const [shops, tags] = await Promise.all([getAdminTeacherShops(), getAllTags()]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-purple-700">預購商品：老師賣場</h1>
        <p className="mt-1 text-sm text-zinc-500">
          結構為「老師 → 品項 → 細項」，例如老師「越南Hitsuzi」底下有品項「小卡」，小卡底下有細項「白厄／昔漣／萬敵」。
        </p>
      </div>
      <TeacherShopBatchForm allTags={tags} />
      {shops.length === 0 ? (
        <EmptyState text="尚無老師賣場，請用上方表單建立" />
      ) : (
        <AdminTeacherShopList shops={shops} allTags={tags} />
      )}
    </div>
  );
}
