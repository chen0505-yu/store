"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { PreorderTeacherSummary } from "@/lib/data/teacher-shop";
import { EmptyState } from "@/components/EmptyState";

// 預購專區依老師分組瀏覽：每張卡片是一位老師的賣場，點進去就是「老師賣場頁」，
// 賣場底下的品項/細項集中在同一頁，不用每個商品各自獨立成一頁分散瀏覽。
export function TeacherBrowseList({ teachers }: { teachers: PreorderTeacherSummary[] }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return teachers;
    return teachers.filter(
      (t) => t.teacherName.toLowerCase().includes(q) || t.searchText.includes(q)
    );
  }, [teachers, search]);

  return (
    <div className="flex flex-col gap-4">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="搜尋老師名稱／品項／細項／Tag"
        className="rounded-full border border-purple-200 px-4 py-2 text-sm"
      />

      {filtered.length === 0 ? (
        <EmptyState text="找不到符合的老師賣場" />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((teacher) => (
            <Link
              key={teacher.teacherId}
              href={`/preorder/teacher/${teacher.teacherId}`}
              className="flex flex-col overflow-hidden rounded-3xl bg-white shadow-[0_4px_20px_rgba(216,148,214,0.18)] transition hover:-translate-y-1 hover:shadow-[0_8px_28px_rgba(216,148,214,0.28)]"
            >
              <div className="relative aspect-square w-full overflow-hidden bg-gradient-to-br from-pink-100 to-purple-100">
                {teacher.coverImage ? (
                  <Image
                    src={teacher.coverImage}
                    alt={teacher.teacherName}
                    fill
                    sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-4xl">🦝</div>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-4">
                <p className="font-semibold text-zinc-800">{teacher.teacherName}</p>
                <p className="text-xs text-zinc-400">{teacher.groupCount} 項商品</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
