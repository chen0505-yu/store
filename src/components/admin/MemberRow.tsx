"use client";

import { useState, useTransition } from "react";
import type { AdminMember } from "@/lib/data/members";
import { addMemberToBlacklist } from "@/lib/actions/members";

export function MemberRow({ member }: { member: AdminMember }) {
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleBlacklist() {
    startTransition(async () => {
      await addMemberToBlacklist(member.id, reason);
      setEditing(false);
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-zinc-800">{member.fbName}</p>
          <p className="text-xs text-zinc-400">{member.phone}</p>
          {member.fbProfileUrl && (
            <a
              href={member.fbProfileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-purple-500 underline"
            >
              FB 個人頁面
            </a>
          )}
        </div>
        <div className="flex items-center gap-2">
          {member.isBlacklisted ? (
            <span className="rounded-full bg-red-50 px-3 py-1 text-xs text-red-500">
              黑名單{member.blacklistReason ? `：${member.blacklistReason}` : ""}
            </span>
          ) : editing ? (
            <div className="flex flex-col gap-2 rounded-xl bg-red-50 p-3">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="黑名單原因/備註"
                className="rounded-lg border border-red-200 px-2 py-1 text-xs"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleBlacklist}
                  disabled={isPending}
                  className="rounded-full bg-red-500 px-3 py-1 text-xs text-white disabled:opacity-50"
                >
                  確認加入黑名單
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-500"
                >
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="rounded-full bg-red-50 px-3 py-1 text-xs text-red-500"
            >
              加入黑名單
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
