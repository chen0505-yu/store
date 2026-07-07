"use client";

import { useMemo, useState } from "react";
import type { AdminMember } from "@/lib/data/members";
import { MemberRow } from "./MemberRow";

export function MemberAdminList({ members }: { members: AdminMember[] }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) => m.phone.toLowerCase().includes(q) || m.fbName.toLowerCase().includes(q)
    );
  }, [members, search]);

  return (
    <div className="flex flex-col gap-4">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="搜尋手機號碼或 FB 名字"
        className="rounded-full border border-purple-200 px-4 py-2 text-sm"
      />
      <div className="flex flex-col gap-3">
        {filtered.map((member) => (
          <MemberRow key={member.id} member={member} />
        ))}
      </div>
    </div>
  );
}
