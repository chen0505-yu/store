import { redirect } from "next/navigation";
import { getCurrentStaff, canAccessPosAdmin } from "@/lib/pos-auth";
import { PosAdminSidebar } from "@/components/pos/PosAdminSidebar";

// 小幫手不可進入管理後台，只能使用 POS 收銀畫面（規格 11）。
export default async function PosAdminLayout({ children }: { children: React.ReactNode }) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/pos/login");
  if (!canAccessPosAdmin(staff.role)) redirect("/pos");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 gap-6 px-4 py-8">
      <PosAdminSidebar displayName={staff.displayName} />
      <div className="flex-1">{children}</div>
    </div>
  );
}
