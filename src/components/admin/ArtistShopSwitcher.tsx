"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { ArtistAccount } from "@/lib/data/artist-accounts";

// 只有 super_admin 會看到這個切換器：因為 layout.tsx 拿不到 searchParams，
// 所以用 client 端 useSearchParams 讀目前的 ?viewAs=，選擇後用 router.push
// 帶著同一個 pathname + 新的 viewAs 參數重新整理，讓各個 page.tsx 重新用
// getArtistContext(viewAsTeacherId) 解析出要看哪一位繪師。
export function ArtistShopSwitcher({ artists }: { artists: ArtistAccount[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentViewAs = searchParams.get("viewAs") ?? "";

  function handleChange(teacherId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (teacherId) {
      params.set("viewAs", teacherId);
    } else {
      params.delete("viewAs");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2 rounded-xl bg-purple-50 px-3 py-2 text-sm">
      <span className="font-semibold text-purple-700">切換檢視繪師：</span>
      <select
        value={currentViewAs}
        onChange={(e) => handleChange(e.target.value)}
        className="rounded-lg border border-purple-200 px-2 py-1 text-sm"
      >
        <option value="">請選擇繪師</option>
        {artists.map((a) => (
          <option key={a.teacherId} value={a.teacherId} disabled={!a.isActive}>
            {a.teacherName}（{a.username}）{a.isActive ? "" : " - 已停用"}
          </option>
        ))}
      </select>
    </div>
  );
}
