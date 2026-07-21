import { notFound, redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/pos-auth";
import { getPosEventById } from "@/lib/data/pos-events";
import { getArtistGroupById } from "@/lib/data/pos-artist-groups";
import { getSellableProductGroupsByArtist } from "@/lib/data/pos-products";
import { getActiveFreebieRulesByArtist } from "@/lib/data/pos-freebies";
import { formatEventLabel } from "@/lib/pos-types";
import { PosTopBar } from "@/components/pos/PosTopBar";
import { PosSharedCashierView, type PosSharedArtistSection } from "@/components/pos/PosSharedCashierView";
import { PosCashierReturnFlow } from "@/components/pos/PosCashierReturnFlow";

export default async function PosSharedCashierPage({
  params,
}: {
  params: Promise<{ eventId: string; groupId: string }>;
}) {
  const { eventId, groupId } = await params;
  const staff = await getCurrentStaff();
  if (!staff) redirect("/pos/login");

  const [event, group] = await Promise.all([getPosEventById(eventId), getArtistGroupById(groupId)]);
  if (!event || !group || group.eventId !== eventId) notFound();

  const activeMembers = group.members.filter((m) => m.isActive);
  const [groupsByArtist, freebiesByArtist] = await Promise.all([
    Promise.all(activeMembers.map((m) => getSellableProductGroupsByArtist(m.id))),
    Promise.all(activeMembers.map((m) => getActiveFreebieRulesByArtist(m.id))),
  ]);

  const artistSections: PosSharedArtistSection[] = activeMembers.map((member, i) => ({
    artistId: member.id,
    artistName: member.name,
    groups: groupsByArtist[i],
    freebieRules: freebiesByArtist[i],
  }));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <PosTopBar
        staffName={staff.displayName}
        title={`${formatEventLabel(event)}｜共用攤位・${group.name}`}
        backHref={`/pos/${eventId}`}
        backLabel="選擇繪師"
        extra={<PosCashierReturnFlow eventId={eventId} sharedGroupId={groupId} />}
      />
      {activeMembers.length === 0 ? (
        <p className="text-sm text-[var(--pos-text-muted)]">這個共用攤位目前沒有啟用中的繪師，請聯絡管理員設定。</p>
      ) : (
        <PosSharedCashierView eventId={eventId} groupId={groupId} groupName={group.name} artistSections={artistSections} />
      )}
    </div>
  );
}
