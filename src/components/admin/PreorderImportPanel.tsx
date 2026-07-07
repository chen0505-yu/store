"use client";

import { useRef, useState, useTransition } from "react";
import {
  previewPreorderExcel,
  confirmPreorderImport,
  type PreorderImportPreview,
  type PreorderImportCommitResult,
} from "@/lib/actions/import-preorder";

export function PreorderImportPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreorderImportPreview | null>(null);
  const [commitResult, setCommitResult] = useState<PreorderImportCommitResult | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFileName(e.target.files?.[0]?.name ?? null);
    setPreview(null);
    setCommitResult(null);
  }

  function handlePreview() {
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    startTransition(async () => {
      const result = await previewPreorderExcel(formData);
      setPreview(result);
      setCommitResult(null);
    });
  }

  function handleConfirm() {
    if (!preview || preview.groups.length === 0) return;
    startTransition(async () => {
      const result = await confirmPreorderImport(preview.groups);
      setCommitResult(result);
      if (result.success) {
        setPreview(null);
        setFileName(null);
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  }

  return (
    <div className="flex flex-col gap-4 rounded-3xl bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-bold text-purple-700">預購商品 Excel</h2>
        <p className="mt-1 text-xs text-zinc-500">
          結構為「老師 → 品項 → 細項」，預購時間套用在老師層級。
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <a
          href="/api/admin/preorder-template"
          className="rounded-full bg-purple-50 px-4 py-2 text-sm font-medium text-purple-600"
        >
          下載預購 Excel 範本
        </a>
        <a
          href="/api/admin/preorder-export"
          className="rounded-full bg-purple-50 px-4 py-2 text-sm font-medium text-purple-600"
        >
          匯出預購商品 Excel
        </a>
      </div>

      <div className="flex flex-col gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileChange}
          className="text-sm"
        />
        <button
          type="button"
          onClick={handlePreview}
          disabled={isPending || !fileName}
          className="self-start rounded-full bg-purple-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {isPending ? "處理中..." : "預覽匯入"}
        </button>
      </div>

      {preview && (
        <div className="flex flex-col gap-3 rounded-2xl bg-purple-50 p-4 text-sm">
          <p className="text-purple-700">{preview.message}</p>
          {preview.groups.length > 0 && (
            <div className="grid grid-cols-2 gap-2 text-xs text-zinc-600 sm:grid-cols-3">
              <p>老師：新增 {preview.teachersToCreate}／更新 {preview.teachersToUpdate}</p>
              <p>品項：新增 {preview.groupsToCreate}／更新 {preview.groupsToUpdate}</p>
              <p>細項：新增 {preview.variantsToCreate}／沿用 {preview.variantsToUpdate}</p>
            </div>
          )}
          {preview.errors.length > 0 && (
            <ul className="flex flex-col gap-1 text-xs text-red-500">
              {preview.errors.map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
            </ul>
          )}
          {preview.groups.length > 0 && (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isPending}
              className="self-start rounded-full bg-gradient-to-r from-pink-400 to-purple-400 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isPending ? "匯入中..." : "確認匯入"}
            </button>
          )}
        </div>
      )}

      {commitResult && (
        <div
          className={`rounded-2xl p-4 text-sm ${commitResult.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}
        >
          {commitResult.message}
        </div>
      )}
    </div>
  );
}
