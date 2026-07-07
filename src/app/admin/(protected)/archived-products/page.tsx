import { getArchivedProducts } from "@/lib/data/admin-products";
import { ArchivedProductRow } from "@/components/admin/ArchivedProductRow";
import { EmptyState } from "@/components/EmptyState";

export default async function AdminArchivedProductsPage() {
  const products = await getArchivedProducts();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-purple-700">已封存商品</h1>
        <p className="mt-1 text-sm text-zinc-500">
          封存商品不會出現在前台或一般商品清單，這裡可以找回並恢復。
        </p>
      </div>
      {products.length === 0 ? (
        <EmptyState text="目前沒有封存中的商品" />
      ) : (
        <div className="flex flex-col gap-3">
          {products.map((p) => (
            <ArchivedProductRow key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
