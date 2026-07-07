import { getAllMembers } from "@/lib/data/members";
import { MemberAdminList } from "@/components/admin/MemberAdminList";
import { EmptyState } from "@/components/EmptyState";

export default async function AdminMembersPage() {
  const members = await getAllMembers();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-purple-700">會員管理</h1>
        <p className="mt-1 text-sm text-zinc-500">
          黑名單客戶仍可登入、查看自己的訂單，但無法加入購物車或下單。
        </p>
      </div>
      {members.length === 0 ? (
        <EmptyState text="目前沒有會員" />
      ) : (
        <MemberAdminList members={members} />
      )}
    </div>
  );
}
