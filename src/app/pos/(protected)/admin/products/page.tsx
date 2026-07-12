import { redirect } from "next/navigation";
import { getCurrentStaff, canManageAllData } from "@/lib/pos-auth";
import { getAllArtistsWithEventName } from "@/lib/data/pos-artists";
import { getAllProductGroupsWithArtistName } from "@/lib/data/pos-products";
import { PosProductsAdmin } from "@/components/pos/admin/PosProductsAdmin";
import { PosProductImportPanel } from "@/components/pos/admin/PosProductImportPanel";

export default async function PosAdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ artistId?: string }>;
}) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/pos/login");
  const { artistId } = await searchParams;
  const [allArtists, allGroups] = await Promise.all([getAllArtistsWithEventName(), getAllProductGroupsWithArtistName()]);
  // 封存（停用）的繪師預設不出現在商品管理：繪師篩選清單跟商品列表都排除，
  // 商品資料本身不會被刪除，繪師重新啟用後就會再出現。
  const artists = allArtists.filter((a) => a.isActive);
  const activeArtistIds = new Set(artists.map((a) => a.id));
  const groups = allGroups.filter((g) => activeArtistIds.has(g.artistId));

  return (
    <div className="flex flex-col gap-6">
      <PosProductImportPanel />
      <PosProductsAdmin
        groups={groups}
        artists={artists}
        canDelete={canManageAllData(staff.role)}
        selectedArtistId={artistId ?? ""}
      />
    </div>
  );
}
