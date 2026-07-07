"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { getPosSupabaseServerClient as getSupabaseServerClient } from "@/lib/supabase/pos-server";
import { getCurrentStaff, canAccessPosAdmin } from "@/lib/pos-auth";
import { cellText, cellNumber } from "@/lib/excel-utils";

// 一次建立/更新大量 POS 商品主項用。用 Artist 名稱比對（不用記代碼），只會對到「目前活動」
// 底下的繪師 —— 這剛好符合「每次活動前重新整理 POS 系統」的使用方式：Excel 匯入就是在
// 幫這次的目前活動建商品。圖片不透過 Excel 匯入，也不匯入細項（細項只是後台記錄用途）。
export interface PosProductImportRow {
  artistName: string;
  name: string;
  price: number;
  stock: number;
  note: string | null;
  // isNew 只在 preview 階段填入（給預覽表格顯示用），confirm 階段不需要、也不會用到這個值。
  isNew?: boolean;
}

export interface PosProductImportPreview {
  success: boolean;
  message: string;
  rows: PosProductImportRow[];
  toCreate: number;
  toUpdate: number;
  errors: string[];
}

function emptyPreview(message: string, errors: string[] = []): PosProductImportPreview {
  return { success: false, message, rows: [], toCreate: 0, toUpdate: 0, errors };
}

// 兩個 import action 共用：找出目前活動底下的繪師（id/name 對照表），
// 找不到目前活動就直接回傳錯誤訊息（呼叫端決定要不要繼續）。
async function getCurrentEventArtistMap(
  supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>
): Promise<{ map: Map<string, string[]>; error: string | null }> {
  const { data: activeEvents } = await supabase.from("pos_events").select("id").eq("is_active", true);

  if (!activeEvents || activeEvents.length === 0) {
    return { map: new Map(), error: "目前沒有設定「目前活動」，請先到「活動管理」設定" };
  }
  if (activeEvents.length > 1) {
    return { map: new Map(), error: "目前有多個活動同時啟用中，請聯絡管理員確認（正常情況下應該只有一個）" };
  }

  const { data: artists } = await supabase
    .from("pos_artists")
    .select("id, name")
    .eq("event_id", activeEvents[0].id);

  const map = new Map<string, string[]>(); // name -> [artistId, ...]（同名可能不只一個）
  for (const artist of artists ?? []) {
    const list = map.get(artist.name) ?? [];
    list.push(artist.id);
    map.set(artist.name, list);
  }
  return { map, error: null };
}

export async function previewPosProductExcel(formData: FormData): Promise<PosProductImportPreview> {
  const staff = await getCurrentStaff();
  if (!staff || !canAccessPosAdmin(staff.role)) return emptyPreview("沒有權限");

  const supabase = getSupabaseServerClient();
  if (!supabase) return emptyPreview("尚未設定 Supabase");

  const file = formData.get("file");
  if (!(file instanceof File)) return emptyPreview("請選擇 Excel 檔案");

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch {
    return emptyPreview("無法讀取 Excel 檔案，請確認格式正確");
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) return emptyPreview("Excel 裡沒有工作表");

  const headerRow = sheet.getRow(1);
  const columnIndex = new Map<string, number>();
  headerRow.eachCell((cell, colNumber) => columnIndex.set(cellText(cell.value), colNumber));
  const getCol = (name: string) => columnIndex.get(name);

  const artistNameCol = getCol("Artist");
  const nameCol = getCol("商品名稱");
  const priceCol = getCol("單價");
  const stockCol = getCol("庫存");
  const noteCol = getCol("備註");

  if (!artistNameCol || !nameCol) {
    return emptyPreview("Excel 缺少必要欄位（Artist／商品名稱），請使用範本");
  }

  const errors: string[] = [];
  const rows: PosProductImportRow[] = [];

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    if (row.cellCount === 0) continue;

    const artistName = cellText(row.getCell(artistNameCol).value).trim();
    const name = cellText(row.getCell(nameCol).value).trim();
    if (!artistName && !name) continue; // 整列空白直接跳過

    let hasError = false;
    if (!artistName) {
      errors.push(`第 ${rowNumber} 列：Artist 不可空白`);
      hasError = true;
    }
    if (!name) {
      errors.push(`第 ${rowNumber} 列：商品名稱不可空白`);
      hasError = true;
    }

    const price = priceCol ? cellNumber(row.getCell(priceCol).value) : null;
    if (price === null) {
      errors.push(`第 ${rowNumber} 列：單價不可空白`);
      hasError = true;
    } else if (price < 0) {
      errors.push(`第 ${rowNumber} 列：單價不可為負數`);
      hasError = true;
    }

    const stock = stockCol ? cellNumber(row.getCell(stockCol).value) : null;
    if (stock === null) {
      errors.push(`第 ${rowNumber} 列：庫存必須是數字`);
      hasError = true;
    } else if (stock < 0) {
      errors.push(`第 ${rowNumber} 列：庫存不可為負數`);
      hasError = true;
    } else if (!Number.isInteger(stock)) {
      errors.push(`第 ${rowNumber} 列：庫存必須是整數`);
      hasError = true;
    }

    if (hasError) continue;

    const note = noteCol ? cellText(row.getCell(noteCol).value).trim() : "";
    rows.push({ artistName, name, price: price!, stock: stock!, note: note || null });
  }

  if (rows.length === 0) {
    return emptyPreview("沒有可匯入的資料", errors);
  }

  const { map: artistIdsByName, error: eventError } = await getCurrentEventArtistMap(supabase);
  if (eventError) return emptyPreview(eventError);

  const validRows: PosProductImportRow[] = [];
  for (const r of rows) {
    const ids = artistIdsByName.get(r.artistName);
    if (!ids || ids.length === 0) {
      errors.push(`找不到繪師「${r.artistName}」，請確認名稱是否正確、且已經在目前活動底下建立`);
    } else if (ids.length > 1) {
      errors.push(`繪師「${r.artistName}」在目前活動中有重複名稱，請先改名區分後再匯入`);
    } else {
      validRows.push(r);
    }
  }

  if (validRows.length === 0) {
    return emptyPreview("沒有可匯入的資料", errors);
  }

  const artistIds = validRows.map((r) => artistIdsByName.get(r.artistName)![0]);
  const { data: existingGroups } = await supabase
    .from("pos_product_groups")
    .select("id, artist_id, name")
    .in("artist_id", Array.from(new Set(artistIds)));
  const existingKey = new Set((existingGroups ?? []).map((g) => `${g.artist_id}::${g.name}`));

  let toCreate = 0;
  let toUpdate = 0;
  for (const r of validRows) {
    const artistId = artistIdsByName.get(r.artistName)![0];
    r.isNew = !existingKey.has(`${artistId}::${r.name}`);
    if (r.isNew) toCreate++;
    else toUpdate++;
  }

  return {
    success: true,
    message: `解析完成：${validRows.length} 筆商品${errors.length > 0 ? `，${errors.length} 列有問題（將不會被匯入）` : ""}`,
    rows: validRows,
    toCreate,
    toUpdate,
    errors,
  };
}

export interface PosProductImportCommitResult {
  success: boolean;
  message: string;
}

// 正式寫入：依「繪師（目前活動底下，用名稱比對）+ 商品名稱」比對，找到就更新單價/庫存/備註，
// 找不到就新建。不會建立繪師，也不會動細項（Excel 不匯入細項）。
export async function confirmPosProductImport(rows: PosProductImportRow[]): Promise<PosProductImportCommitResult> {
  const staff = await getCurrentStaff();
  if (!staff || !canAccessPosAdmin(staff.role)) return { success: false, message: "沒有權限" };

  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };
  if (rows.length === 0) return { success: false, message: "沒有可匯入的資料" };

  const { map: artistIdsByName, error: eventError } = await getCurrentEventArtistMap(supabase);
  if (eventError) return { success: false, message: eventError };

  let created = 0;
  let updated = 0;
  const nextSortOrder = new Map<string, number>();

  for (const r of rows) {
    const ids = artistIdsByName.get(r.artistName);
    if (!ids || ids.length !== 1) continue; // 理論上不會發生，preview 階段已經過濾掉
    const artistId = ids[0];

    const { data: existing } = await supabase
      .from("pos_product_groups")
      .select("id")
      .eq("artist_id", artistId)
      .eq("name", r.name)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase
        .from("pos_product_groups")
        .update({ price: r.price, stock_quantity: r.stock, note: r.note })
        .eq("id", existing.id);
      if (error) return { success: false, message: `更新商品「${r.name}」失敗：${error.message}` };
      updated++;
    } else {
      if (!nextSortOrder.has(artistId)) {
        const { data: top } = await supabase
          .from("pos_product_groups")
          .select("sort_order")
          .eq("artist_id", artistId)
          .order("sort_order", { ascending: false })
          .limit(1)
          .maybeSingle();
        nextSortOrder.set(artistId, (top?.sort_order ?? -1) + 1);
      }
      const sortOrder = nextSortOrder.get(artistId)!;
      nextSortOrder.set(artistId, sortOrder + 1);

      const { error } = await supabase.from("pos_product_groups").insert({
        artist_id: artistId,
        name: r.name,
        price: r.price,
        stock_quantity: r.stock,
        note: r.note,
        sort_order: sortOrder,
      });
      if (error) return { success: false, message: `建立商品「${r.name}」失敗：${error.message}` };
      created++;
    }
  }

  revalidatePath("/pos/admin/products");
  revalidatePath("/pos", "layout");

  return { success: true, message: `匯入完成：新增 ${created} 筆／更新 ${updated} 筆` };
}
