import type { PaymentSettingsView } from "@/lib/data/payment-settings";

// 預購訂單一律要匯款（現貨才是賣貨便付款，不需要匯款），下單完成頁跟會員中心的
// 未付款/待確認訂單都要顯示這個帳戶資訊，避免客人不知道要匯去哪裡。
export function PaymentAccountInfo({ paymentSettings }: { paymentSettings: PaymentSettingsView | null }) {
  if (!paymentSettings) return null;

  return (
    <div className="rounded-2xl bg-purple-50 p-4 text-sm text-purple-700">
      <p className="font-semibold">匯款資訊：</p>
      <p>銀行：{paymentSettings.bankName}</p>
      {paymentSettings.bankCode && <p>銀行代碼：{paymentSettings.bankCode}</p>}
      <p>戶名：{paymentSettings.accountName}</p>
      <p>帳號：{paymentSettings.accountNumber}</p>
      {paymentSettings.remittanceNote && <p>匯款備註：{paymentSettings.remittanceNote}</p>}
      <p className="mt-2 text-xs text-purple-500">
        提醒：匯款完成後，請回到「我的訂單」填寫匯款資料並上傳截圖。
      </p>
    </div>
  );
}
