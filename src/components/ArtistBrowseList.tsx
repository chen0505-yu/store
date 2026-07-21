"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { ArtistTeacherSummary } from "@/lib/data/artist-storefront";
import { EmptyState } from "@/components/EmptyState";

// 繪師預購專區依繪師分組瀏覽：跟 TeacherBrowseList 結構相同，但連結指向 /artist/teacher/*，
// 資料來源也是獨立的 artist_product_groups，跟葴葴預購（product_groups）完全分開。
export function ArtistBrowseList({ teachers }: { teachers: ArtistTeacherSummary[] }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return teachers;
    return teachers.filter((t) => t.teacherName.toLowerCase().includes(q) || t.searchText.includes(q));
  }, [teachers, search]);

  return (
    <div className="flex flex-col gap-4">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="搜尋繪師名稱／品項／細項"
        className="rounded-full border border-purple-200 px-4 py-2 text-sm"
      />

      {filtered.length === 0 ? (
        <EmptyState text="找不到符合的繪師賣場" />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((teacher) => (
            <Link
              key={teacher.teacherId}
              href={`/artist/teacher/${teacher.teacherId}`}
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
