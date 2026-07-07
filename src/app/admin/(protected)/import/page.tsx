import { PreorderImportPanel } from "@/components/admin/PreorderImportPanel";
import { InstockImportPanel } from "@/components/admin/InstockImportPanel";

export default function AdminImportPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-purple-700">Excel 批量上架</h1>
        <p className="mt-1 text-sm text-zinc-500">
          預購與現貨是兩套獨立的流程，Excel 欄位也分開。下載範本填好後上傳，會先顯示預覽，確認無誤後才會正式匯入；同一個老師／品項／細項再次匯入會更新既有資料，不會重複建立。
        </p>
      </div>
      <PreorderImportPanel />
      <InstockImportPanel />
    </div>
  );
}
