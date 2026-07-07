"use server";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { MAX_IMAGE_SIZE_BYTES, MAX_IMAGE_SIZE_MESSAGE } from "@/lib/upload-constants";

export interface UploadResult {
  success: boolean;
  message: string;
  url?: string;
}

const BUCKET = "litan-images";
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

// 老師頭像／商品圖片（未來投票圖片）一律透過這個 Server Action 直接上傳到
// Supabase Storage，Database 只保存回傳的公開網址，不再提供網址輸入框。
export async function uploadImage(formData: FormData, folder: string): Promise<UploadResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { success: false, message: "找不到要上傳的檔案" };
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { success: false, message: "只支援 PNG、JPEG、WEBP、GIF 圖片格式" };
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return { success: false, message: MAX_IMAGE_SIZE_MESSAGE };
  }

  const ext = file.name.split(".").pop() || "png";
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    return { success: false, message: error.message };
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { success: true, message: "上傳成功", url: data.publicUrl };
}
