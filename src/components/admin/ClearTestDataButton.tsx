"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearTestData } from "@/lib/actions/dev-tools";

// 這個元件只會被 app/admin/page.tsx 在 NODE_ENV === "development" 時渲染，
// 正式部署（next build && next start / production）不會出現在畫面上。
export function ClearTestDataButton() {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    if (
      !window.confirm(
        "確定要清空所有測試資料嗎？此動作無法復原。\n\n將會清除：訂單、商品、老師、公告、留言、匯款、補款、出貨訂單、商品圖片紀錄。\n不會清除：會員帳號、Tag、系統設定。"
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await clearTestData();
      setMessage(result.message);
      if (result.success) router.refresh();
    });
  }

  return (
    <div className="rounded-3xl border-2 border-dashed border-red-300 bg-red-50 p-4">
      <p className="mb-2 text-xs font-semibold text-red-500">
        此按鈕僅在開發環境顯示，正式部署環境不會出現。
      </p>
      <button
        onClick={handleClick}
        disabled={isPending}
        className="rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {isPending ? "清空中..." : "清空測試資料（Development Only）"}
      </button>
      {message && <p className="mt-2 text-xs text-red-600">{message}</p>}
    </div>
  );
}
