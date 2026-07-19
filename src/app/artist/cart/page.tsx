import { getCurrentMember } from "@/lib/auth";
import { ArtistCartView } from "@/components/ArtistCartView";

export default async function ArtistCartPage() {
  const member = await getCurrentMember();

  return <ArtistCartView isLoggedIn={Boolean(member)} isBlacklisted={member?.isBlacklisted ?? false} />;
}
