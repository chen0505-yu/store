"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getUniqueTeacherCode } from "@/lib/teacher-code";
import { cellText, cellNumber, parseTagsCell } from "@/lib/excel-utils";

// 現貨改成跟預購一樣的「老師 → 品項（instock_product_groups） → 細項
// （instock_product_variants）」架構（不再寫入舊的扁平 products 表）。
// 同一個老師＋同一個品項的價格／Tags 以第一次出現的列為準，每一列細項對應一個
// instock_product_variant，庫存記在細項上。
export interface InstockVariantInput {
  variantName: string;
  stock: number;
}

export interface InstockGroupInput {
  teacherName: string;
  groupName: string;
  price: number;
  tags: string[];
  variants: InstockVariantInput[];
}

export interface InstockImportPreview {
  success: boolean;
  message: string;
  groups: InstockGroupInput[];
  teachersToCreate: number;
  teachersToUpdate: number;
  groupsToCreate: number;
  groupsToUpdate: number;
  variantsToCreate: number;
  variantsToUpdate: number;
  stockTotal: number;
  errors: string[];
}

function emptyPreview(message: string, errors: string[] = []): InstockImportPreview {
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
    stockTotal: 0,
    errors,
  };
}

export async function previewInstockExcel(formData: FormData): Promise<InstockImportPreview> {
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
  const groupCol = getCol("品項");
  const priceCol = getCol("價格");
  const stockCol = getCol("庫存");
  const tagsCol = getCol("Tags");
  const variantCol = getCol("細項");

  if (!teacherNameCol || !groupCol || !variantCol) {
    return emptyPreview("Excel 缺少必要欄位（老師名稱／品項／細項），請使用範本");
  }

  const errors: string[] = [];
  const groupMap = new Map<string, InstockGroupInput>(); // key: 老師名稱::品項

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

    const tags = tagsCol ? parseTagsCell(row.getCell(tagsCol).value) : [];
    const key = `${teacherName}::${groupName}`;
    let group = groupMap.get(key);
    if (!group) {
      group = { teacherName, groupName, price: price!, tags, variants: [] };
      groupMap.set(key, group);
    }
    const existingVariant = group.variants.find((v) => v.variantName === variantName);
    if (existingVariant) {
      existingVariant.stock = stock!; // 同一列重複出現時，以最後一次的庫存為準
    } else {
      group.variants.push({ variantName, stock: stock! });
    }
  }

  const groups = Array.from(groupMap.values());
  if (groups.length === 0) {
    return emptyPreview("沒有可匯入的資料", errors);
  }

  const teacherNames = Array.from(new Set(groups.map((g) => g.teacherName)));
  const { data: existingTeachers } = await supabase.from("teachers").select("id, name").in("name", teacherNames);
  const teacherIdByName = new Map((existingTeachers ?? []).map((t) => [t.name, t.id]));

  const existingTeacherIds = Array.from(teacherIdByName.values());
  const { data: existingGroups } =
    existingTeacherIds.length > 0
      ? await supabase
          .from("instock_product_groups")
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
      ? await supabase
          .from("instock_product_variants")
          .select("instock_product_group_id, name")
          .in("instock_product_group_id", existingGroupIds)
      : { data: [] };
  const existingVariantKey = new Set(
    (existingVariants ?? []).map((v) => `${v.instock_product_group_id}::${v.name}`)
  );

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
  let stockTotal = 0;

  for (const g of groups) {
    const teacherId = teacherIdByName.get(g.teacherName);
    const groupId = teacherId ? existingGroupIdByKey.get(`${teacherId}::${g.groupName}`) : undefined;
    if (groupId) groupsToUpdate++;
    else groupsToCreate++;

    for (const v of g.variants) {
      stockTotal += v.stock;
      if (groupId && existingVariantKey.has(`${groupId}::${v.variantName}`)) {
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
    stockTotal,
    errors,
  };
}

export interface InstockImportCommitResult {
  success: boolean;
  message: string;
}

// 正式寫入：老師找不到就新建，找到就直接沿用（現貨老師沒有額外欄位要更新）；
// 品項依「老師＋品項名稱」比對，找到就更新價格／Tags，找不到就新建；
// 細項依「品項＋細項名稱」比對，找到就更新庫存，找不到就新建。
export async function confirmInstockImport(groups: InstockGroupInput[]): Promise<InstockImportCommitResult> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { success: false, message: "尚未設定 Supabase" };
  if (groups.length === 0) return { success: false, message: "沒有可匯入的資料" };

  let createdTeachers = 0;
  let createdGroups = 0;
  let updatedGroups = 0;
  let createdVariants = 0;
  let updatedVariants = 0;

  const teacherIdByName = new Map<string, string>();
  const teacherNames = Array.from(new Set(groups.map((g) => g.teacherName)));

  for (const name of teacherNames) {
    const { data: existing } = await supabase.from("teachers").select("id").eq("name", name).maybeSingle();
    if (existing) {
      teacherIdByName.set(name, existing.id);
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
      .from("instock_product_groups")
      .select("id")
      .eq("teacher_id", teacherId)
      .eq("name", g.groupName)
      .eq("is_archived", false)
      .maybeSingle();

    let groupId: string;
    if (existingGroup) {
      groupId = existingGroup.id;
      await supabase
        .from("instock_product_groups")
        .update({ price: g.price, tags: g.tags })
        .eq("id", groupId);
      updatedGroups++;
    } else {
      if (!nextGroupSortOrder.has(teacherId)) {
        const { data: topGroup } = await supabase
          .from("instock_product_groups")
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
        .from("instock_product_groups")
        .insert({
          teacher_id: teacherId,
          name: g.groupName,
          price: g.price,
          tags: g.tags,
          sort_order: sortOrder,
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
      .from("instock_product_variants")
      .select("id, name, sort_order")
      .eq("instock_product_group_id", groupId);
    const existingVariantByName = new Map((existingVariants ?? []).map((v) => [v.name, v]));
    let nextVariantSortOrder =
      (existingVariants ?? []).reduce((max, v) => Math.max(max, v.sort_order), -1) + 1;

    for (const v of g.variants) {
      const existingVariant = existingVariantByName.get(v.variantName);
      if (existingVariant) {
        await supabase
          .from("instock_product_variants")
          .update({ stock_quantity: v.stock, is_sold_out: v.stock <= 0 })
          .eq("id", existingVariant.id);
        updatedVariants++;
      } else {
        await supabase.from("instock_product_variants").insert({
          instock_product_group_id: groupId,
          name: v.variantName,
          stock_quantity: v.stock,
          is_sold_out: v.stock <= 0,
          sort_order: nextVariantSortOrder++,
        });
        createdVariants++;
      }
    }
  }

  revalidatePath("/admin/instock-products");
  revalidatePath("/admin/teachers");
  revalidatePath("/instock");
  revalidatePath("/instock/teacher", "layout");

  return {
    success: true,
    message: `匯入完成：老師新增 ${createdTeachers} 位，品項新增 ${createdGroups} / 更新 ${updatedGroups}，細項新增 ${createdVariants} / 更新 ${updatedVariants}`,
  };
}
