import { redirect } from "next/navigation";
import { getCurrentStaff, canManageAllData } from "@/lib/pos-auth";
import { getAllPosEvents } from "@/lib/data/pos-events";
import { PosEventsAdmin } from "@/components/pos/admin/PosEventsAdmin";

export default async function PosAdminEventsPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/pos/login");
  const events = await getAllPosEvents();

  return <PosEventsAdmin events={events} canDelete={canManageAllData(staff.role)} />;
}
