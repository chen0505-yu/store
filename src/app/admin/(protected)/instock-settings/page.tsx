import { getInstockSettings } from "@/lib/data/instock-settings";
import { InstockSettingsForm } from "@/components/admin/InstockSettingsForm";

export default async function AdminInstockSettingsPage() {
  const settings = await getInstockSettings();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-pink-600">現貨區設定</h1>
        <p className="mt-1 text-sm text-zinc-500">
          活動回來後可以先關閉現貨區，慢慢整理商品，整理完成再開放並設定期間限定的開放時間。
        </p>
      </div>
      <InstockSettingsForm settings={settings} />
    </div>
  );
}
