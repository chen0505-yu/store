"use client";

import { useState } from "react";
import type { ReactNode } from "react";

// 通用收合卡片：預設只顯示摘要，展開後才渲染完整內容，避免商品/訂單很多時整頁一直往下滑。
export function Collapsible({
  summary,
  defaultExpanded = false,
  children,
}: {
  summary: ReactNode;
  defaultExpanded?: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div className="flex flex-col gap-3">
      {/* 用 div 而非 button 當外層容器：summary 內常常會放 OrderPaymentPanel／刪除等真正的按鈕，
          button 裡面不能再放 button（無效的 HTML），所以改用可點擊的 div 搭配獨立的收合按鈕。 */}
      <div
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-2xl bg-white px-4 py-3 text-left shadow-sm"
      >
        <div className="flex-1">{summary}</div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="shrink-0 text-xs font-medium text-purple-400"
        >
          {expanded ? "收合 ▲" : "展開 ▼"}
        </button>
      </div>
      {expanded && <div className="flex flex-col gap-3">{children}</div>}
    </div>
  );
}
