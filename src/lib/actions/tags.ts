"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export interface ActionResult {
  success: boolean;
  message: string;
}

export async function createTag(name: string): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };
  if (!name.trim()) return { success: false, message: "請輸入 Tag 名稱" };

  const { error } = await supabase.from("product_tags").insert({ name: name.trim() });
  if (error) {
    if (error.code === "23505") {
      return { success: false, message: "這個 Tag 已經存在" };
    }
    return { success: false, message: error.message };
  }

  revalidatePath("/admin/tags");
  revalidatePath("/admin/preorder-products");
  revalidatePath("/admin/instock-products");
  return { success: true, message: "已新增 Tag" };
}

export async function renameTag(id: string, name: string): Promise<ActionResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };
  if (!name.trim()) return { success: false, message: "請輸入 Tag 名稱" };

  const { error } = await supabase.from("product_tags").update({ name: name.trim() }).eq("id", id);
  if (error) return { success: false, message: error.message };

  revalidatePath("/admin/tags");
  return { success: true, message: "已更新 Tag" };
}

export interface DeleteTagResult extends ActionResult {
  inUse?: boolean;
}

// Tag 名稱直接快照存在 products.tags（text[]），不是關聯表，所以刪除 Tag 時
// 要另外把這個名稱從所有商品的 tags 陣列裡移除，否則商品會留著指向不存在 Tag 的殘留字串。
// confirmed=false 時，如果有商品正在使用，先回報 inUse 讓前端顯示提示、二次確認後再帶 confirmed=true 真正刪除。
export async function deleteTag(id: string, confirmed = false): Promise<DeleteTagResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };

  const { data: tag } = await supabase.from("product_tags").select("name").eq("id", id).maybeSingle();
  if (!tag) return { success: false, message: "找不到這個 Tag" };

  const { data: usingProducts } = await supabase
    .from("products")
    .select("id, tags")
    .contains("tags", [tag.name]);

  const products = usingProducts ?? [];
  if (products.length > 0 && !confirmed) {
    return {
      success: false,
      inUse: true,
      message: "目前有商品正在使用此 Tag，刪除後將從商品中移除此 Tag。",
    };
  }

  if (products.length > 0) {
    await Promise.all(
      products.map((p) =>
        supabase
          .from("products")
          .update({ tags: (p.tags ?? []).filter((t: string) => t !== tag.name) })
          .eq("id", p.id)
      )
    );
  }

  const { error } = await supabase.from("product_tags").delete().eq("id", id);
  if (error) return { success: false, message: error.message };

  revalidatePath("/admin/tags");
  revalidatePath("/admin/preorder-products");
  revalidatePath("/admin/instock-products");
  return { success: true, message: "已刪除 Tag" };
}
