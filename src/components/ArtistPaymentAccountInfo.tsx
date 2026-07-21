import type { ArtistOrderShopInfo } from "@/lib/data/artist-storefront";
import { getRemittancePhase } from "@/lib/product-availability";

// 繪師匯款規則三態顯示：未到開始時間「尚未開放匯款」、期間內顯示這位繪師自己的匯款資料，
// 超過截止時間「匯款期限已截止」（是否仍可補交由繪師/後台人工操作，這裡不做自動判斷）。
export function ArtistPaymentAccountInfo({ shopInfo }: { shopInfo: ArtistOrderShopInfo }) {
  const phase = getRemittancePhase(shopInfo);

  if (phase === "not_started") {
    return (
      <div className="rounded-2xl bg-purple-50 p-4 text-sm text-purple-700">
        <p className="font-semibold">{shopInfo.teacherName}：尚未開放匯款</p>
      </div>
    );
  }

  if (phase === "ended") {
    return (
      <div className="rounded-2xl bg-zinc-100 p-4 text-sm text-zinc-500">
        <p className="font-semibold">{shopInfo.teacherName}：匯款期限已截止</p>
        <p className="mt-1 text-xs">如需補交匯款，請透過訂單留言聯繫繪師或客服。</p>
      </div>
    );
  }

  if (!shopInfo.bankName || !shopInfo.accountName || !shopInfo.accountNumber) {
    return null;
  }

  return (
    <div className="rounded-2xl bg-purple-50 p-4 text-sm text-purple-700">
      <p className="font-semibold">{shopInfo.teacherName} 匯款資訊：</p>
      <p>銀行：{shopInfo.bankName}</p>
      {shopInfo.bankCode && <p>銀行代碼：{shopInfo.bankCode}</p>}
      <p>戶名：{shopInfo.accountName}</p>
      <p>帳號：{shopInfo.accountNumber}</p>
      {shopInfo.remittanceNote && <p>匯款備註：{shopInfo.remittanceNote}</p>}
      <p className="mt-2 text-xs text-purple-500">提醒：匯款完成後，請回到「我的訂單」填寫匯款資料並上傳截圖。</p>
    </div>
  );
}
