"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  previewPosProductExcel,
  confirmPosProductImport,
  type PosProductImportPreview,
  type PosProductImportCommitResult,
} from "@/lib/actions/pos-import-products";
import { GlassCard } from "@/components/pos/GlassCard";
import { GlowButton } from "@/components/pos/GlowButton";

export function PosProductImportPanel() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<PosProductImportPreview | null>(null);
  const [commitResult, setCommitResult] = useState<PosProductImportCommitResult | null>(null);
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
      const result = await previewPosProductExcel(formData);
      setPreview(result);
      setCommitResult(null);
    });
  }

  function handleConfirm() {
    if (!preview || preview.rows.length === 0) return;
    startTransition(async () => {
      const result = await confirmPosProductImport(preview.rows);
      setCommitResult(result);
      if (result.success) {
        setPreview(null);
        setFileName(null);
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      }
    });
  }

  return (
    <GlassCard className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: "var(--pos-gold)" }}>
          Excel 批量建立商品
        </h2>
        <p className="mt-1 text-xs text-[var(--pos-text-muted)]">
          用 Artist 名稱比對「目前活動」底下的繪師（請先到「繪師管理」建立好），商品名稱重複的話會更新單價/庫存/備註。
          圖片與細項記錄請匯入後自己到後台補。
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <a href="/api/pos/products-template" className="pos-input px-4 py-2 text-sm">
          下載範本
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input ref={inputRef} type="file" accept=".xlsx,.xls" onChange={handleFileChange} className="text-sm" />
        <GlowButton type="button" onClick={handlePreview} disabled={isPending || !fileName} className="px-4 py-2">
          {isPending ? "處理中..." : "預覽匯入"}
        </GlowButton>
      </div>

      {preview && (
        <div className="pos-input flex flex-col gap-2 p-3 text-sm">
          <p style={{ color: "var(--pos-gold)" }}>{preview.message}</p>
          {preview.rows.length > 0 && (
            <>
              <p className="text-xs text-[var(--pos-text-muted)]">
                新增 {preview.toCreate} 筆／更新 {preview.toUpdate} 筆，確認無誤後再按下方「確認匯入」
              </p>
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[var(--pos-text-muted)]">
                      <th className="py-1 pr-2">狀態</th>
                      <th className="py-1 pr-2">Artist</th>
                      <th className="py-1 pr-2">商品名稱</th>
                      <th className="py-1 pr-2">單價</th>
                      <th className="py-1 pr-2">庫存</th>
                      <th className="py-1">備註</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row, idx) => (
                      <tr key={idx} className="border-t border-[var(--pos-glass-border)]">
                        <td className="py-1 pr-2" style={{ color: row.isNew ? "var(--pos-gold)" : undefined }}>
                          {row.isNew ? "新增" : "更新"}
                        </td>
                        <td className="py-1 pr-2">{row.artistName}</td>
                        <td className="py-1 pr-2">{row.name}</td>
                        <td className="py-1 pr-2">{row.price}</td>
                        <td className="py-1 pr-2">{row.stock}</td>
                        <td className="py-1">{row.note ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {preview.errors.length > 0 && (
            <ul className="flex flex-col gap-1 text-xs text-red-400">
              {preview.errors.map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
            </ul>
          )}
          {preview.rows.length > 0 && (
            <GlowButton type="button" onClick={handleConfirm} disabled={isPending} className="self-start px-4 py-2">
              {isPending ? "匯入中..." : "確認匯入"}
            </GlowButton>
          )}
        </div>
      )}

      {commitResult && (
        <p className={`text-sm ${commitResult.success ? "" : "text-red-400"}`} style={commitResult.success ? { color: "var(--pos-gold)" } : undefined}>
          {commitResult.message}
        </p>
      )}
    </GlassCard>
  );
}
