import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

// 預購 Excel 範本：老師 → 品項（product_groups）→ 細項（product_variants），
// 預購時間套用在老師層級，同一個老師的每一列都要填一樣的預購開始／截止時間。
export async function GET() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("預購商品");

  sheet.columns = [
    { header: "老師名稱", key: "teacherName", width: 18 },
    { header: "預購開始", key: "preorderStartsAt", width: 18 },
    { header: "預購截止", key: "preorderEndsAt", width: 18 },
    { header: "品項", key: "groupName", width: 16 },
    { header: "價格", key: "price", width: 10 },
    { header: "Tags", key: "tags", width: 20 },
    { header: "細項", key: "variantName", width: 16 },
  ];

  sheet.addRow({
    teacherName: "越南Hitsuzi",
    preorderStartsAt: "2026/07/01 00:00",
    preorderEndsAt: "2026/07/20 23:59",
    groupName: "小卡",
    price: 20,
    tags: "原神、崩鐵",
    variantName: "白厄",
  });
  sheet.addRow({
    teacherName: "越南Hitsuzi",
    preorderStartsAt: "2026/07/01 00:00",
    preorderEndsAt: "2026/07/20 23:59",
    groupName: "小卡",
    price: 20,
    tags: "原神、崩鐵",
    variantName: "昔漣",
  });
  sheet.addRow({
    teacherName: "越南Hitsuzi",
    preorderStartsAt: "2026/07/01 00:00",
    preorderEndsAt: "2026/07/20 23:59",
    groupName: "印刷品",
    price: 120,
    tags: "原神",
    variantName: "白厄",
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="litan-preorder-template.xlsx"',
    },
  });
}
