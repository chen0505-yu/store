import { getCurrentMember } from "@/lib/auth";
import { InstockCartView } from "@/components/InstockCartView";

export default async function InstockCartPage() {
  const member = await getCurrentMember();

  return (
    <InstockCartView isLoggedIn={Boolean(member)} isBlacklisted={member?.isBlacklisted ?? false} />
  );
}
