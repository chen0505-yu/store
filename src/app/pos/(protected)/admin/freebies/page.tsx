import { redirect } from "next/navigation";
import { getCurrentStaff, canManageAllData } from "@/lib/pos-auth";
import { getAllArtistsWithEventName } from "@/lib/data/pos-artists";
import { getAllProductGroupsWithArtistName } from "@/lib/data/pos-products";
import { getAllFreebieRulesWithArtistName } from "@/lib/data/pos-freebies";
import { PosFreebiesAdmin } from "@/components/pos/admin/PosFreebiesAdmin";

export default async function PosAdminFreebiesPage({
  searchParams,
}: {
  searchParams: Promise<{ artistId?: string }>;
}) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/pos/login");
  const { artistId } = await searchParams;
  const [artists, groups, rules] = await Promise.all([
    getAllArtistsWithEventName(),
    getAllProductGroupsWithArtistName(),
    getAllFreebieRulesWithArtistName(),
  ]);

  return (
    <PosFreebiesAdmin
      rules={rules}
      artists={artists}
      groups={groups}
      canDelete={canManageAllData(staff.role)}
      selectedArtistId={artistId ?? ""}
    />
  );
}
