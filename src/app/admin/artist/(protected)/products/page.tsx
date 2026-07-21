import { getArtistContext } from "@/lib/artist-context";
import { getArtistProductGroups, getArtistShopSettings } from "@/lib/data/artist-shop";
import { getAllTags } from "@/lib/data/tags";
import { ArtistProductGroupCreateForm } from "@/components/admin/ArtistProductGroupCreateForm";
import { AdminArtistProductGroupRow } from "@/components/admin/AdminArtistProductGroupRow";
import { EmptyState } from "@/components/EmptyState";

// 後台商品狀態顯示：預購中／已結束，判斷依據是賣場層級的 preorderEndsAt。
// 已封存品項不會出現在這個清單，見 /admin/archived-products 頁面。
// 純函式回傳文字/是否結束，不當成元件用，避免在渲染中直接呼叫 Date.now()。
function shopPreorderStatus(preorderEndsAt: string | null, nowMs: number = Date.now()): { ended: boolean; label: string } {
  const ended = preorderEndsAt !== null && new Date(preorderEndsAt).getTime() < nowMs;
  return { ended, label: ended ? "已結束" : "預購中" };
}

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
        <h1 className="text-2xl font-bold text-purple-700">
          商品管理{shop ? `：${shop.name}` : ""}
          {shop &&
            (() => {
              const status = shopPreorderStatus(shop.preorderEndsAt);
              return (
                <span
                  className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold align-middle ${
                    status.ended ? "bg-zinc-100 text-zinc-500" : "bg-green-50 text-green-600"
                  }`}
                >
                  {status.label}
                </span>
              );
            })()}
        </h1>
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
