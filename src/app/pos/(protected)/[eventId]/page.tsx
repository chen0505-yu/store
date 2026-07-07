import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/pos-auth";
import { getPosEventById } from "@/lib/data/pos-events";
import { getActiveArtistsByEvent } from "@/lib/data/pos-artists";
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

  const artists = await getActiveArtistsByEvent(eventId);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <PosTopBar staffName={staff.displayName} title={`${formatEventLabel(event)}｜選擇繪師`} />

      {artists.length === 0 && (
        <p className="text-sm text-[var(--pos-text-muted)]">這個活動目前沒有繪師，請聯絡管理員建立。</p>
      )}

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
  );
}
