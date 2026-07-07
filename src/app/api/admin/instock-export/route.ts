import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// 匯出目前所有現貨品項／細項，一列對應一個細項（instock_product_variant），
// 方便帶回範本格式修改後重新匯入（可以用來批量更新價格／庫存／Tags）。
export async function GET() {
  const supabase = getSupabaseServerClient();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("現貨商品");

  sheet.columns = [
    { header: "老師名稱", key: "teacherName", width: 18 },
    { header: "老師編號", key: "teacherCode", width: 12 },
    { header: "品項", key: "groupName", width: 16 },
    { header: "價格", key: "price", width: 10 },
    { header: "庫存", key: "stock", width: 10 },
    { header: "Tags", key: "tags", width: 20 },
    { header: "細項", key: "variantName", width: 16 },
  ];

  if (supabase) {
    const [{ data: teachers }, { data: groups }, { data: variants }] = await Promise.all([
      supabase.from("teachers").select("id, teacher_code, name, sort_order").order("sort_order", { ascending: true }),
      supabase
        .from("instock_product_groups")
        .select("id, teacher_id, name, price, tags, sort_order")
        .eq("is_archived", false)
        .order("sort_order", { ascending: true }),
      supabase
        .from("instock_product_variants")
        .select("id, instock_product_group_id, name, stock_quantity, sort_order")
        .order("sort_order", { ascending: true }),
    ]);

    const teacherMap = new Map((teachers ?? []).map((t) => [t.id, t]));
    const variantsByGroup = new Map<string, typeof variants>();
    for (const v of variants ?? []) {
      const list = variantsByGroup.get(v.instock_product_group_id) ?? [];
      list.push(v);
      variantsByGroup.set(v.instock_product_group_id, list);
    }

    for (const group of groups ?? []) {
      const teacher = teacherMap.get(group.teacher_id);
      if (!teacher) continue;
      const groupVariants = variantsByGroup.get(group.id) ?? [];
      for (const variant of groupVariants) {
        sheet.addRow({
          teacherName: teacher.name,
          teacherCode: teacher.teacher_code,
          groupName: group.name,
          price: Number(group.price),
          stock: variant.stock_quantity,
          tags: (group.tags ?? []).join("、"),
          variantName: variant.name,
        });
      }
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="litan-instock-export.xlsx"',
    },
  });
}
