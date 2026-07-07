import { redirect } from "next/navigation";
import { getCurrentStaff, canManageAllData } from "@/lib/pos-auth";
import { getAllPosEvents } from "@/lib/data/pos-events";
import { getAllArtistsWithEventName } from "@/lib/data/pos-artists";
import { PosArtistsAdmin } from "@/components/pos/admin/PosArtistsAdmin";

export default async function PosAdminArtistsPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/pos/login");
  const [events, artists] = await Promise.all([getAllPosEvents(), getAllArtistsWithEventName()]);

  return <PosArtistsAdmin artists={artists} events={events} canDelete={canManageAllData(staff.role)} />;
}
