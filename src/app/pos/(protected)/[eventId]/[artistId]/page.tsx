import { notFound, redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/pos-auth";
import { getPosEventById } from "@/lib/data/pos-events";
import { getArtistById } from "@/lib/data/pos-artists";
import { getSellableProductGroupsByArtist } from "@/lib/data/pos-products";
import { getActiveFreebieRulesByArtist } from "@/lib/data/pos-freebies";
import { getPosOrders } from "@/lib/data/pos-orders";
import { formatEventLabel } from "@/lib/pos-types";
import { PosTopBar } from "@/components/pos/PosTopBar";
import { PosCashierView } from "@/components/pos/PosCashierView";
import { PosCashierReturnFlow } from "@/components/pos/PosCashierReturnFlow";

export default async function PosCashierPage({
  params,
}: {
  params: Promise<{ eventId: string; artistId: string }>;
}) {
  const { eventId, artistId } = await params;
  const staff = await getCurrentStaff();
  if (!staff) redirect("/pos/login");

  const [event, artist] = await Promise.all([getPosEventById(eventId), getArtistById(artistId)]);
  if (!event || !artist || artist.eventId !== eventId) notFound();

  const [groups, freebieRules, recentOrders] = await Promise.all([
    getSellableProductGroupsByArtist(artistId),
    getActiveFreebieRulesByArtist(artistId),
    getPosOrders({ eventId, artistId, limit: 20 }),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <PosTopBar
        staffName={staff.displayName}
        title={`${formatEventLabel(event)}｜${artist.name}`}
        backHref={`/pos/${eventId}`}
        backLabel="選擇繪師"
        extra={<PosCashierReturnFlow recentOrders={recentOrders} />}
      />
      <PosCashierView
        eventId={eventId}
        artistId={artistId}
        artistName={artist.name}
        groups={groups}
        freebieRules={freebieRules}
      />
    </div>
  );
}
