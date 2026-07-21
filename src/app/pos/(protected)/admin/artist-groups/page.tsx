import { redirect } from "next/navigation";
import { getCurrentStaff, canManageAllData } from "@/lib/pos-auth";
import { getAllPosEvents } from "@/lib/data/pos-events";
import { getAllArtistsWithEventName } from "@/lib/data/pos-artists";
import { getAllArtistGroupsWithEventName } from "@/lib/data/pos-artist-groups";
import { PosArtistGroupsAdmin } from "@/components/pos/admin/PosArtistGroupsAdmin";

export default async function PosAdminArtistGroupsPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/pos/login");
  const [events, artists, groups] = await Promise.all([
    getAllPosEvents(),
    getAllArtistsWithEventName(),
    getAllArtistGroupsWithEventName(),
  ]);

  return <PosArtistGroupsAdmin events={events} artists={artists} groups={groups} canDelete={canManageAllData(staff.role)} />;
}
