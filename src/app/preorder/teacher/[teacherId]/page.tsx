import { notFound } from "next/navigation";
import { getTeacherShop } from "@/lib/data/teacher-shop";
import { getCurrentMember } from "@/lib/auth";
import { TeacherShopView } from "@/components/TeacherShopView";

export default async function TeacherShopPage({
  params,
}: {
  params: Promise<{ teacherId: string }>;
}) {
  const { teacherId } = await params;
  const [shop, member] = await Promise.all([getTeacherShop(teacherId), getCurrentMember()]);
  if (!shop) notFound();

  return <TeacherShopView shop={shop} isBlacklisted={member?.isBlacklisted ?? false} />;
}
