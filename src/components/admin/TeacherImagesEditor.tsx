"use client";

import { useState, useTransition } from "react";
import { updateTeacherImages } from "@/lib/actions/teachers";
import { MultiImageUploader } from "./MultiImageUploader";

// 老師賣場封面圖是老師層級（不是每個細項各自的圖片），預購／現貨賣場共用同一組圖片，
// 從其中一邊編輯儲存後，另一邊的賣場也會同步看到。
export function TeacherImagesEditor({ teacherId, images }: { teacherId: string; images: string[] }) {
  const [urls, setUrls] = useState<string[]>(images);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    startTransition(async () => {
      const result = await updateTeacherImages(teacherId, urls);
      setMessage(result.message);
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-purple-50/60 p-3">
      <p className="text-xs font-semibold text-purple-600">
        老師賣場封面圖（第一張是前台卡片封面，沒有圖片時顯示預設狸貓圖）
      </p>
      <MultiImageUploader value={urls} onChange={setUrls} folder="teachers" />
      <button
        onClick={handleSave}
        disabled={isPending}
        className="w-fit rounded-full bg-purple-500 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
      >
        {isPending ? "儲存中..." : "儲存封面圖"}
      </button>
      {message && <p className="text-xs text-purple-600">{message}</p>}
    </div>
  );
}
