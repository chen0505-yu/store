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
  const [artists, groups] = await Promise.all([getAllArtistsWithEventName(), getAllProductGroupsWithArtistName()]);

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
