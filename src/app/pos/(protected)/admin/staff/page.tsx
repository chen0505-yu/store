import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/pos-auth";
import { getAllStaffAccounts } from "@/lib/data/pos-staff";
import { PosStaffAdmin } from "@/components/pos/admin/PosStaffAdmin";

export default async function PosAdminStaffPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/pos/login");
  const accounts = await getAllStaffAccounts();

  return <PosStaffAdmin accounts={accounts} currentRole={staff.role} />;
}
