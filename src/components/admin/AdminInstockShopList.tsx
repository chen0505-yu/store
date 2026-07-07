"use client";

import { useMemo, useState } from "react";
import type { AdminInstockShop } from "@/lib/data/admin-instock-shops";
import type { Tag } from "@/lib/data/tags";
import { AdminInstockGroupRow } from "./AdminInstockGroupRow";
import { TeacherImagesEditor } from "./TeacherImagesEditor";
import { Collapsible } from "./Collapsible";
import { Pagination } from "./Pagination";

const PAGE_SIZE = 20;

export function AdminInstockShopList({ shops, allTags }: { shops: AdminInstockShop[]; allTags: Tag[] }) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(shops.length / PAGE_SIZE));
  const pageShops = useMemo(
    () => shops.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [shops, page]
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-8">
        {pageShops.map((shop) => (
          <Collapsible
            key={shop.teacherId}
            summary={
              <div className="flex flex-wrap items-center gap-3">
                {shop.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={shop.avatarUrl}
                    alt={shop.teacherName}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-pink-50 text-lg">
                    🦝
                  </div>
                )}
                <div>
                  <h2 className="text-base font-bold text-pink-700">
                    {shop.teacherName}（{shop.teacherCode}）
                  </h2>
                  <p className="text-xs text-zinc-400">{shop.groups.length} 個品項</p>
                </div>
              </div>
            }
          >
            <TeacherImagesEditor teacherId={shop.teacherId} images={shop.images} />
            <div className="flex flex-col gap-3">
              {shop.groups.map((group) => (
                <AdminInstockGroupRow key={group.id} group={group} allTags={allTags} />
              ))}
            </div>
          </Collapsible>
        ))}
      </div>
      <Pagination page={page} pageCount={pageCount} onPageChange={setPage} />
    </div>
  );
}
