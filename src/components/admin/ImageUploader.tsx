"use client";

import { useRef, useState, useTransition } from "react";
import { uploadImage } from "@/lib/actions/upload";
import { MAX_IMAGE_SIZE_BYTES, MAX_IMAGE_SIZE_MESSAGE } from "@/lib/upload-constants";

export function ImageUploader({
  value,
  onChange,
  folder,
  label,
}: {
  value: string;
  onChange: (url: string) => void;
  folder: string;
  label: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleFile(file: File) {
    setMessage(null);
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setMessage(MAX_IMAGE_SIZE_MESSAGE);
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    startTransition(async () => {
      const result = await uploadImage(formData, folder);
      if (result.success && result.url) {
        onChange(result.url);
      } else {
        setMessage(result.message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-zinc-500">{label}</label>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) handleFile(file);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-4 text-center text-xs transition ${
          isDragging ? "border-purple-400 bg-purple-50" : "border-purple-200 bg-white"
        }`}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="預覽圖片" className="h-20 w-20 rounded-xl object-cover" />
        ) : (
          <span className="text-zinc-400">拖曳圖片到這裡，或點擊選擇檔案</span>
        )}
        {isPending && <span className="text-purple-500">上傳中...</span>}
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
          className="self-start text-xs text-zinc-400 underline hover:text-red-500"
        >
          移除圖片
        </button>
      )}
      {message && <p className="text-xs text-red-500">{message}</p>}
    </div>
  );
}
