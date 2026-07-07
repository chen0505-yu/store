"use client";

export function Pagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 py-2">
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="rounded-full bg-purple-50 px-3 py-1 text-xs font-medium text-purple-600 disabled:opacity-40"
      >
        上一頁
      </button>
      <span className="text-xs text-zinc-500">
        第 {page} / {pageCount} 頁
      </span>
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= pageCount}
        className="rounded-full bg-purple-50 px-3 py-1 text-xs font-medium text-purple-600 disabled:opacity-40"
      >
        下一頁
      </button>
    </div>
  );
}
