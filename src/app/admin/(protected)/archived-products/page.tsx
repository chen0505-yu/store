import { getArchivedProducts } from "@/lib/data/admin-products";
import { getArchivedProductGroups, getArchivedArtistProductGroups } from "@/lib/data/archived-groups";
import { ArchivedProductRow } from "@/components/admin/ArchivedProductRow";
import { ArchivedGroupRow } from "@/components/admin/ArchivedGroupRow";
import { EmptyState } from "@/components/EmptyState";
import {
  restoreProductGroup,
  getProductGroupDeletePreview,
  permanentlyDeleteProductGroup,
} from "@/lib/actions/teacher-shop";
import {
  restoreArtistProductGroup,
  getArtistProductGroupDeletePreview,
  permanentlyDeleteArtistProductGroup,
} from "@/lib/actions/artist-shop";

const preorderGroupActions = {
  restore: restoreProductGroup,
  getDeletePreview: getProductGroupDeletePreview,
  permanentlyDelete: permanentlyDeleteProductGroup,
};

const artistGroupActions = {
  restore: restoreArtistProductGroup,
  getDeletePreview: getArtistProductGroupDeletePreview,
  permanentlyDelete: permanentlyDeleteArtistProductGroup,
};

export default async function AdminArchivedProductsPage() {
  const [products, preorderGroups, artistGroups] = await Promise.all([
    getArchivedProducts(),
    getArchivedProductGroups(),
    getArchivedArtistProductGroups(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-purple-700">已封存商品</h1>
        <p className="mt-1 text-sm text-zinc-500">
          封存品項不會出現在前台或一般商品清單，這裡可以找回並恢復，或在確認沒有未完成訂單／補款後永久刪除。
        </p>
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-purple-500">葴葴預購</h2>
        {preorderGroups.length === 0 ? (
          <EmptyState text="目前沒有封存中的品項" />
        ) : (
          <div className="flex flex-col gap-3">
            {preorderGroups.map((g) => (
              <ArchivedGroupRow key={g.id} group={g} actions={preorderGroupActions} />
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-purple-500">繪師預購</h2>
        {artistGroups.length === 0 ? (
          <EmptyState text="目前沒有封存中的品項" />
        ) : (
          <div className="flex flex-col gap-3">
            {artistGroups.map((g) => (
              <ArchivedGroupRow key={g.id} group={g} actions={artistGroupActions} />
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-semibold text-purple-500">舊版商品（現貨等）</h2>
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
    </div>
  );
}
