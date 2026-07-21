import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/pos-auth";
import { getPosEventById } from "@/lib/data/pos-events";
import { getActiveArtistsByEvent } from "@/lib/data/pos-artists";
import { getArtistGroupsByEvent } from "@/lib/data/pos-artist-groups";
import { formatEventLabel } from "@/lib/pos-types";
import { GlassCard } from "@/components/pos/GlassCard";
import { PosTopBar } from "@/components/pos/PosTopBar";

export default async function PosSelectArtistPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const { eventId } = await params;
  const staff = await getCurrentStaff();
  if (!staff) redirect("/pos/login");
  const event = await getPosEventById(eventId);
  if (!event) notFound();

  const [artists, groups] = await Promise.all([getActiveArtistsByEvent(eventId), getArtistGroupsByEvent(eventId)]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <PosTopBar staffName={staff.displayName} title={`${formatEventLabel(event)}｜選擇繪師`} />

      {groups.length > 0 && (
        <div className="mb-6">
          <p className="mb-2 text-sm text-[var(--pos-text-muted)]">共用攤位</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {groups.map((group) => (
              <Link key={group.id} href={`/pos/${eventId}/group/${group.id}`}>
                <GlassCard
                  className="flex h-24 flex-col items-center justify-center gap-1 text-center transition hover:scale-[1.02]"
                  style={{ borderColor: "var(--pos-gold)" }}
                >
                  <span className="text-lg font-semibold" style={{ color: "var(--pos-gold)" }}>
                    {group.name}
                  </span>
                  <span className="text-xs text-[var(--pos-text-muted)]">
                    {group.members.map((m) => m.name).join("、") || "尚未加入 Artist"}
                  </span>
                </GlassCard>
              </Link>
            ))}
          </div>
        </div>
      )}

      {artists.length === 0 && groups.length === 0 && (
        <p className="text-sm text-[var(--pos-text-muted)]">這個活動目前沒有繪師，請聯絡管理員建立。</p>
      )}

      {artists.length > 0 && (
        <div>
          {groups.length > 0 && <p className="mb-2 text-sm text-[var(--pos-text-muted)]">一般繪師</p>}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {artists.map((artist) => (
              <Link key={artist.id} href={`/pos/${eventId}/${artist.id}`}>
                <GlassCard className="flex h-24 flex-col items-center justify-center gap-1 text-center transition hover:scale-[1.02]">
                  <span className="text-lg font-semibold">{artist.name}</span>
                  <span className="text-xs text-[var(--pos-text-muted)]">{artist.artistCode}</span>
                </GlassCard>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
