"use client";

import { useState, useTransition } from "react";
import type { OrderMessageView } from "@/lib/types";
import { postOrderMessage, postAdminReply, markOrderMessagesRead } from "@/lib/actions/order-messages";

function formatTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function OrderMessages({
  orderId,
  messages,
  role,
}: {
  orderId: string;
  messages: OrderMessageView[];
  role: "customer" | "admin";
}) {
  const [expanded, setExpanded] = useState(false);
  const [hasMarkedRead, setHasMarkedRead] = useState(false);
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // 讀者永遠是留言作者的另一方：客戶看的是 admin 留言的未讀數（customer_unread_count），
  // 後台看的是 customer 留言的未讀數（admin_unread_count）。
  const otherAuthor = role === "customer" ? "admin" : "customer";
  const unreadCount = messages.filter((m) => m.authorType === otherAuthor && !m.isRead).length;

  function handleToggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && unreadCount > 0 && !hasMarkedRead) {
      setHasMarkedRead(true);
      startTransition(async () => {
        await markOrderMessagesRead(orderId, role);
      });
    }
  }

  function handleSubmit() {
    startTransition(async () => {
      const result =
        role === "customer" ? await postOrderMessage(orderId, content) : await postAdminReply(orderId, content);
      if (result.success) {
        setContent("");
        setError(null);
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <div className="mt-3 rounded-2xl bg-zinc-50 p-3">
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center justify-between text-xs font-semibold text-zinc-500"
      >
        <span>留言{messages.length > 0 ? `（${messages.length}）` : ""}</span>
        <span className="flex items-center gap-2">
          {unreadCount > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-medium text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              {role === "customer" ? `新回覆 ${unreadCount}` : `新留言 ${unreadCount}`}
            </span>
          )}
          <span className="text-zinc-400">{expanded ? "收合 ▲" : "展開 ▼"}</span>
        </span>
      </button>

      {expanded && (
        <div className="mt-2 flex flex-col gap-2">
          {messages.length > 0 && (
            <div className="flex flex-col gap-2">
              {messages.map((m) => (
                <div key={m.id} className="rounded-xl bg-white p-2 text-xs shadow-sm">
                  <div className="flex items-center justify-between">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        m.authorType === "admin" ? "bg-purple-100 text-purple-600" : "bg-pink-100 text-pink-600"
                      }`}
                    >
                      {m.authorType === "admin" ? "後台" : "客戶"}
                    </span>
                    <span className="text-zinc-400">{formatTime(m.createdAt)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-zinc-700">{m.content}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={role === "customer" ? "輸入留言..." : "輸入回覆..."}
              className="flex-1 rounded-lg border border-zinc-200 px-2 py-1 text-xs"
            />
            <button
              onClick={handleSubmit}
              disabled={isPending || !content.trim()}
              className="rounded-full bg-zinc-700 px-3 py-1 text-xs text-white disabled:opacity-50"
            >
              {isPending ? "送出中..." : role === "customer" ? "留言" : "回覆"}
            </button>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      )}
    </div>
  );
}
