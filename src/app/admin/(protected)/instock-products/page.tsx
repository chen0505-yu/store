import { getAdminInstockShops } from "@/lib/data/admin-instock-shops";
import { getAllTags } from "@/lib/data/tags";
import { InstockShopBatchForm } from "@/components/admin/InstockShopBatchForm";
import { AdminInstockShopList } from "@/components/admin/AdminInstockShopList";
import { EmptyState } from "@/components/EmptyState";

export default async function AdminInstockProductsPage() {
  const [shops, tags] = await Promise.all([getAdminInstockShops(), getAllTags()]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-pink-600">現貨商品：老師賣場</h1>
        <p className="mt-1 text-sm text-zinc-500">
          結構為「老師 → 品項 → 細項」，例如老師「越南Hitsuzi」底下有品項「小卡」，小卡底下有細項「白厄／昔漣／萬敵」，庫存記在細項上。
        </p>
      </div>
      <InstockShopBatchForm allTags={tags} />
      {shops.length === 0 ? (
        <EmptyState text="尚無老師現貨賣場，請用上方表單建立" />
      ) : (
        <AdminInstockShopList shops={shops} allTags={tags} />
      )}
    </div>
  );
}
