import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/pos-auth";

// 涵蓋 /pos（選活動）、/pos/[eventId]（選繪師）、/pos/[eventId]/[artistId]（收銀畫面）、
// /pos/admin/*：一律要求員工已登入，否則導回 /pos/login。
export default async function PosProtectedLayout({ children }: { children: React.ReactNode }) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/pos/login");

  return <>{children}</>;
}
