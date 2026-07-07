"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { uploadImage } from "@/lib/actions/upload";
import { MAX_IMAGE_SIZE_BYTES, MAX_IMAGE_SIZE_MESSAGE } from "@/lib/upload-constants";

export function MultiImageUploader({
  value,
  onChange,
  folder,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
  folder: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  // 一次選取多張圖片時，每張圖片各自非同步上傳完成的時間點不同；
  // 用 ref 記住「目前最新」的 value，結果回來時才不會用到舊的 value 覆蓋掉別張圖片剛寫入的結果。
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  function handleFiles(files: FileList) {
    setMessage(null);
    const validFiles: File[] = [];
    let hasOversized = false;
    for (const file of Array.from(files)) {
      if (file.size > MAX_IMAGE_SIZE_BYTES) {
        hasOversized = true;
        continue;
      }
      validFiles.push(file);
    }
    if (hasOversized) setMessage(MAX_IMAGE_SIZE_MESSAGE);
    if (validFiles.length === 0) return;

    startTransition(async () => {
      const results = await Promise.all(
        validFiles.map((file) => {
          const formData = new FormData();
          formData.append("file", file);
          return uploadImage(formData, folder);
        })
      );

      const uploadedUrls = results
        .filter((r) => r.success && r.url)
        .map((r) => r.url as string);
      const failed = results.find((r) => !r.success);

      if (uploadedUrls.length > 0) {
        onChange([...valueRef.current, ...uploadedUrls]);
      }
      if (failed) {
        setMessage(failed.message);
      }
    });
  }

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function moveTo(from: number, to: number) {
    if (from === to) return;
    const next = [...value];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-zinc-500">
        商品圖片（可上傳多張、拖曳排序，第一張為列表主圖）
      </label>
      <div className="flex flex-wrap gap-2">
        {value.map((url, index) => (
          <div
            key={`${url}-${index}`}
            draggable
            onDragStart={() => setDragIndex(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIndex !== null) moveTo(dragIndex, index);
              setDragIndex(null);
            }}
            className="relative h-20 w-20 cursor-grab"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="h-20 w-20 rounded-xl object-cover" />
            {index === 0 && (
              <span className="absolute left-1 top-1 rounded-full bg-purple-500/90 px-1.5 py-0.5 text-[10px] text-white">
                主圖
              </span>
            )}
            <button
              type="button"
              onClick={() => removeAt(index)}
              className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white"
            >
              ×
            </button>
          </div>
        ))}

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed text-xs ${
            isDragging ? "border-purple-400 bg-purple-50" : "border-purple-200"
          }`}
        >
          <span className="text-2xl text-purple-300">+</span>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      </div>
      {isPending && <p className="text-xs text-purple-500">上傳中...</p>}
      {message && <p className="text-xs text-red-500">{message}</p>}
    </div>
  );
}
