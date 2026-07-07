"use client";

import { useRef, useState, useTransition } from "react";
import { uploadImage } from "@/lib/actions/upload";
import { MAX_IMAGE_SIZE_BYTES, MAX_IMAGE_SIZE_MESSAGE } from "@/lib/upload-constants";

// 跟 src/components/admin/ImageUploader.tsx 邏輯相同（同一個 uploadImage action），
// 只是換上 POS 星空主題的樣式，維持「後台與 POS 前台同一套視覺」。
export function PosImageUploader({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function handleFile(file: File) {
    setMessage(null);
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setMessage(MAX_IMAGE_SIZE_MESSAGE);
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    startTransition(async () => {
      const result = await uploadImage(formData, "pos-products");
      if (result.success && result.url) {
        onChange(result.url);
      } else {
        setMessage(result.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-[var(--pos-text-muted)]">商品圖片</label>
      <div
        onClick={() => inputRef.current?.click()}
        className="pos-input flex cursor-pointer flex-col items-center justify-center gap-2 p-4 text-center text-xs"
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="預覽圖片" className="h-20 w-20 rounded-xl object-cover" />
        ) : (
          <span className="text-[var(--pos-text-muted)]">點擊選擇圖片</span>
        )}
        {isPending && <span style={{ color: "var(--pos-gold)" }}>上傳中...</span>}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
      </div>
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="self-start text-xs text-[var(--pos-text-muted)] underline hover:text-red-400"
        >
          移除圖片
        </button>
      )}
      {message && <p className="text-xs text-red-400">{message}</p>}
    </div>
  );
}
