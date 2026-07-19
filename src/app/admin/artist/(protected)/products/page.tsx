import { getArtistContext } from "@/lib/artist-context";
import { getArtistProductGroups, getArtistShopSettings } from "@/lib/data/artist-shop";
import { getAllTags } from "@/lib/data/tags";
import { ArtistProductGroupCreateForm } from "@/components/admin/ArtistProductGroupCreateForm";
import { AdminArtistProductGroupRow } from "@/components/admin/AdminArtistProductGroupRow";
import { EmptyState } from "@/components/EmptyState";

export default async function ArtistProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ viewAs?: string }>;
}) {
  const { viewAs } = await searchParams;
  const context = await getArtistContext(viewAs);

  if (!context) {
    return (
      <div className="rounded-2xl bg-white p-6 text-sm text-zinc-500">
        請先在上方選擇要檢視的繪師商店。
      </div>
    );
  }

  const [groups, shop, tags] = await Promise.all([
    getArtistProductGroups(context.teacherId),
    getArtistShopSettings(context.teacherId),
    getAllTags(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-purple-700">商品管理{shop ? `：${shop.name}` : ""}</h1>
        <p className="mt-1 text-sm text-zinc-500">結構為「品項 → 細項」，例如品項「小卡」底下有細項「白厄／昔漣／萬敵」。</p>
      </div>
      <ArtistProductGroupCreateForm teacherId={context.teacherId} allTags={tags} />
      {groups.length === 0 ? (
        <EmptyState text="尚無商品，請用上方表單建立" />
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((group) => (
            <AdminArtistProductGroupRow key={group.id} group={group} allTags={tags} />
          ))}
        </div>
      )}
    </div>
  );
}
