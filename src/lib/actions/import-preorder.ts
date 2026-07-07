"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getUniqueTeacherCode } from "@/lib/teacher-code";
import { cellText, cellNumber, cellDate, parseTagsCell } from "@/lib/excel-utils";

// 預購 Excel 一列 = 一個細項；同一個老師＋同一個品項的多列會被合併成一個 product_group，
// 品項底下的每一列細項會被彙整成 variantNames（依第一次出現的順序，並去除同名重複）。
// 價格／Tags／老師的預購時間都以該老師／品項「第一次出現的那一列」為準。
export interface PreorderGroupInput {
  teacherName: string;
  preorderStartsAt: string | null;
  preorderEndsAt: string | null;
  groupName: string;
  price: number;
  tags: string[];
  variantNames: string[];
}

export interface PreorderImportPreview {
  success: boolean;
  message: string;
  groups: PreorderGroupInput[];
  teachersToCreate: number;
  teachersToUpdate: number;
  groupsToCreate: number;
  groupsToUpdate: number;
  variantsToCreate: number;
  variantsToUpdate: number;
  errors: string[];
}

function emptyPreview(message: string, errors: string[] = []): PreorderImportPreview {
  return {
    success: false,
    message,
    groups: [],
    teachersToCreate: 0,
    teachersToUpdate: 0,
    groupsToCreate: 0,
    groupsToUpdate: 0,
    variantsToCreate: 0,
    variantsToUpdate: 0,
    errors,
  };
}

export async function previewPreorderExcel(formData: FormData): Promise<PreorderImportPreview> {
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

  const teacherNameCol = getCol("老師名稱");
  const startCol = getCol("預購開始");
  const endCol = getCol("預購截止");
  const groupCol = getCol("品項");
  const priceCol = getCol("價格");
  const tagsCol = getCol("Tags");
  const variantCol = getCol("細項");

  if (!teacherNameCol || !groupCol || !variantCol) {
    return emptyPreview("Excel 缺少必要欄位（老師名稱／品項／細項），請使用範本");
  }

  const errors: string[] = [];
  const groupMap = new Map<string, PreorderGroupInput>(); // key: 老師名稱::品項

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    if (row.cellCount === 0) continue;

    const teacherName = cellText(row.getCell(teacherNameCol).value).trim();
    const groupName = cellText(row.getCell(groupCol).value).trim();
    const variantName = cellText(row.getCell(variantCol).value).trim();
    if (!teacherName && !groupName && !variantName) continue; // 整列空白直接跳過

    let hasError = false;
    if (!teacherName) {
      errors.push(`第 ${rowNumber} 列：老師名稱不可空白`);
      hasError = true;
    }
    if (!groupName) {
      errors.push(`第 ${rowNumber} 列：品項不可空白`);
      hasError = true;
    }
    if (!variantName) {
      errors.push(`第 ${rowNumber} 列：細項不可空白`);
      hasError = true;
    }

    const price = priceCol ? cellNumber(row.getCell(priceCol).value) : null;
    if (price === null) {
      errors.push(`第 ${rowNumber} 列：價格不可空白`);
      hasError = true;
    } else if (price < 0) {
      errors.push(`第 ${rowNumber} 列：價格不可為負數`);
      hasError = true;
    }

    const startResult = startCol ? cellDate(row.getCell(startCol).value) : { ok: true as const, iso: null };
    if (!startResult.ok) {
      errors.push(`第 ${rowNumber} 列：預購開始時間格式錯誤，請用「YYYY/MM/DD HH:mm」`);
      hasError = true;
    }
    const endResult = endCol ? cellDate(row.getCell(endCol).value) : { ok: true as const, iso: null };
    if (!endResult.ok) {
      errors.push(`第 ${rowNumber} 列：預購截止時間格式錯誤，請用「YYYY/MM/DD HH:mm」`);
      hasError = true;
    }
    if (startResult.ok && endResult.ok && startResult.iso && endResult.iso && startResult.iso > endResult.iso) {
      errors.push(`第 ${rowNumber} 列：預購截止時間不可早於預購開始時間`);
      hasError = true;
    }

    if (hasError) continue;

    const tags = tagsCol ? parseTagsCell(row.getCell(tagsCol).value) : [];
    const key = `${teacherName}::${groupName}`;
    let group = groupMap.get(key);
    if (!group) {
      group = {
        teacherName,
        preorderStartsAt: startResult.ok ? startResult.iso : null,
        preorderEndsAt: endResult.ok ? endResult.iso : null,
        groupName,
        price: price!,
        tags,
        variantNames: [],
      };
      groupMap.set(key, group);
    }
    if (!group.variantNames.includes(variantName)) {
      group.variantNames.push(variantName);
    }
  }

  const groups = Array.from(groupMap.values());
  if (groups.length === 0) {
    return emptyPreview("沒有可匯入的資料", errors);
  }

  // 同一個老師只會有一組預購時間：以該老師第一個品項的值為準，套用到底下所有品項。
  const teacherWindowByName = new Map<string, { start: string | null; end: string | null }>();
  for (const g of groups) {
    if (!teacherWindowByName.has(g.teacherName)) {
      teacherWindowByName.set(g.teacherName, { start: g.preorderStartsAt, end: g.preorderEndsAt });
    }
    const window = teacherWindowByName.get(g.teacherName)!;
    g.preorderStartsAt = window.start;
    g.preorderEndsAt = window.end;
  }

  const teacherNames = Array.from(teacherWindowByName.keys());
  const { data: existingTeachers } = await supabase.from("teachers").select("id, name").in("name", teacherNames);
  const teacherIdByName = new Map((existingTeachers ?? []).map((t) => [t.name, t.id]));

  const existingTeacherIds = Array.from(teacherIdByName.values());
  const { data: existingGroups } =
    existingTeacherIds.length > 0
      ? await supabase
          .from("product_groups")
          .select("id, teacher_id, name")
          .in("teacher_id", existingTeacherIds)
          .eq("is_archived", false)
      : { data: [] };
  const existingGroupIdByKey = new Map(
    (existingGroups ?? []).map((g) => [`${g.teacher_id}::${g.name}`, g.id])
  );

  const existingGroupIds = (existingGroups ?? []).map((g) => g.id);
  const { data: existingVariants } =
    existingGroupIds.length > 0
      ? await supabase.from("product_variants").select("product_group_id, name").in("product_group_id", existingGroupIds)
      : { data: [] };
  const existingVariantKey = new Set((existingVariants ?? []).map((v) => `${v.product_group_id}::${v.name}`));

  let teachersToCreate = 0;
  let teachersToUpdate = 0;
  for (const name of teacherNames) {
    if (teacherIdByName.has(name)) teachersToUpdate++;
    else teachersToCreate++;
  }

  let groupsToCreate = 0;
  let groupsToUpdate = 0;
  let variantsToCreate = 0;
  let variantsToUpdate = 0;

  for (const g of groups) {
    const teacherId = teacherIdByName.get(g.teacherName);
    const groupId = teacherId ? existingGroupIdByKey.get(`${teacherId}::${g.groupName}`) : undefined;
    if (groupId) groupsToUpdate++;
    else groupsToCreate++;

    for (const variantName of g.variantNames) {
      if (groupId && existingVariantKey.has(`${groupId}::${variantName}`)) {
        variantsToUpdate++;
      } else {
        variantsToCreate++;
      }
    }
  }

  return {
    success: true,
    message: `解析完成：${teacherNames.length} 位老師、${groups.length} 個品項${errors.length > 0 ? `，${errors.length} 列有錯誤（將不會被匯入）` : ""}`,
    groups,
    teachersToCreate,
    teachersToUpdate,
    groupsToCreate,
    groupsToUpdate,
    variantsToCreate,
    variantsToUpdate,
    errors,
  };
}

export interface PreorderImportCommitResult {
  success: boolean;
  message: string;
}

// 正式寫入：老師找不到就新建（並套用預購時間），找到就更新預購時間；
// 品項依「老師＋品項名稱」比對，找到就更新價格／Tags，找不到就新建；
// 細項依「品項＋細項名稱」比對，找到就略過（沒有其他欄位可更新），找不到就新建。
export async function confirmPreorderImport(groups: PreorderGroupInput[]): Promise<PreorderImportCommitResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };
  if (groups.length === 0) return { success: false, message: "沒有可匯入的資料" };

  let createdTeachers = 0;
  let updatedTeachers = 0;
  let createdGroups = 0;
  let updatedGroups = 0;
  let createdVariants = 0;
  let updatedVariants = 0;

  const teacherIdByName = new Map<string, string>();
  const teacherWindowByName = new Map<string, { start: string | null; end: string | null }>();
  for (const g of groups) {
    if (!teacherWindowByName.has(g.teacherName)) {
      teacherWindowByName.set(g.teacherName, { start: g.preorderStartsAt, end: g.preorderEndsAt });
    }
  }

  for (const [name, window] of teacherWindowByName) {
    const { data: existing } = await supabase.from("teachers").select("id").eq("name", name).maybeSingle();

    if (existing) {
      await supabase
        .from("teachers")
        .update({ preorder_starts_at: window.start, preorder_ends_at: window.end })
        .eq("id", existing.id);
      teacherIdByName.set(name, existing.id);
      updatedTeachers++;
    } else {
      const { data: topTeacher } = await supabase
        .from("teachers")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const code = await getUniqueTeacherCode(supabase);
      const { data: newTeacher, error } = await supabase
        .from("teachers")
        .insert({
          teacher_code: code,
          name,
          sort_order: (topTeacher?.sort_order ?? 0) + 1,
          is_active: true,
          preorder_starts_at: window.start,
          preorder_ends_at: window.end,
        })
        .select("id")
        .single();
      if (error || !newTeacher) {
        return { success: false, message: `建立老師「${name}」失敗：${error?.message ?? "未知錯誤"}` };
      }
      teacherIdByName.set(name, newTeacher.id);
      createdTeachers++;
    }
  }

  const nextGroupSortOrder = new Map<string, number>();

  for (const g of groups) {
    const teacherId = teacherIdByName.get(g.teacherName);
    if (!teacherId) continue;

    const { data: existingGroup } = await supabase
      .from("product_groups")
      .select("id")
      .eq("teacher_id", teacherId)
      .eq("name", g.groupName)
      .eq("is_archived", false)
      .maybeSingle();

    let groupId: string;
    if (existingGroup) {
      groupId = existingGroup.id;
      await supabase
        .from("product_groups")
        .update({ price: g.price, tags: g.tags })
        .eq("id", groupId);
      updatedGroups++;
    } else {
      if (!nextGroupSortOrder.has(teacherId)) {
        const { data: topGroup } = await supabase
          .from("product_groups")
          .select("sort_order")
          .eq("teacher_id", teacherId)
          .order("sort_order", { ascending: false })
          .limit(1)
          .maybeSingle();
        nextGroupSortOrder.set(teacherId, (topGroup?.sort_order ?? -1) + 1);
      }
      const sortOrder = nextGroupSortOrder.get(teacherId)!;
      nextGroupSortOrder.set(teacherId, sortOrder + 1);

      const { data: newGroup, error } = await supabase
        .from("product_groups")
        .insert({
          teacher_id: teacherId,
          name: g.groupName,
          price: g.price,
          tags: g.tags,
          sort_order: sortOrder,
          arrival_status: "preordering",
        })
        .select("id")
        .single();
      if (error || !newGroup) {
        return { success: false, message: `建立品項「${g.groupName}」失敗：${error?.message ?? "未知錯誤"}` };
      }
      groupId = newGroup.id;
      createdGroups++;
    }

    const { data: existingVariants } = await supabase
      .from("product_variants")
      .select("name, sort_order")
      .eq("product_group_id", groupId);
    const existingVariantNames = new Set((existingVariants ?? []).map((v) => v.name));
    let nextVariantSortOrder =
      (existingVariants ?? []).reduce((max, v) => Math.max(max, v.sort_order), -1) + 1;

    const newVariantRows = g.variantNames
      .filter((name) => !existingVariantNames.has(name))
      .map((name) => ({ product_group_id: groupId, name, sort_order: nextVariantSortOrder++ }));

    if (newVariantRows.length > 0) {
      await supabase.from("product_variants").insert(newVariantRows);
      createdVariants += newVariantRows.length;
    }
    updatedVariants += g.variantNames.length - newVariantRows.length;
  }

  revalidatePath("/admin/preorder-products");
  revalidatePath("/admin/teachers");
  revalidatePath("/preorder");
  revalidatePath("/preorder/teacher", "layout");

  return {
    success: true,
    message: `匯入完成：老師新增 ${createdTeachers} / 更新 ${updatedTeachers}，品項新增 ${createdGroups} / 更新 ${updatedGroups}，細項新增 ${createdVariants} / 沿用 ${updatedVariants}`,
  };
}
