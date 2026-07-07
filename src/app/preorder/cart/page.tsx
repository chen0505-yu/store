import { getCurrentMember } from "@/lib/auth";
import { getActivePaymentSettings } from "@/lib/data/payment-settings";
import { PreorderCartView } from "@/components/PreorderCartView";

export default async function PreorderCartPage() {
  const [member, paymentSettings] = await Promise.all([
    getCurrentMember(),
    getActivePaymentSettings(),
  ]);

  return (
    <PreorderCartView
      isLoggedIn={Boolean(member)}
      isBlacklisted={member?.isBlacklisted ?? false}
      paymentSettings={paymentSettings}
    />
  );
}
