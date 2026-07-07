import { getAllPaymentSettings } from "@/lib/data/payment-settings";
import { PaymentSettingsManager } from "@/components/admin/PaymentSettingsManager";

export default async function AdminPaymentSettingsPage() {
  const accounts = await getAllPaymentSettings();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-purple-700">匯款帳戶設定</h1>
        <p className="mt-1 text-sm text-zinc-500">
          目前只支援一組啟用帳戶，客戶下單完成頁與會員中心的匯款資訊都會顯示啟用中的這組帳戶。
        </p>
      </div>
      <PaymentSettingsManager accounts={accounts} />
    </div>
  );
}
