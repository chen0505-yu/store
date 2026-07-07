import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

// 現貨 Excel 範本：老師 → 品項 → 細項，跟預購一樣的分層概念，但套用在現貨（products）表，
// 不需要預購時間，改成需要庫存；品項＋細項會合併成一個現貨商品，庫存記在細項這一列。
export async function GET() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("現貨商品");

  sheet.columns = [
    { header: "老師名稱", key: "teacherName", width: 18 },
    { header: "品項", key: "groupName", width: 16 },
    { header: "價格", key: "price", width: 10 },
    { header: "庫存", key: "stock", width: 10 },
    { header: "Tags", key: "tags", width: 20 },
    { header: "細項", key: "variantName", width: 16 },
  ];

  sheet.addRow({
    teacherName: "越南Hitsuzi",
    groupName: "小卡",
    price: 20,
    stock: 5,
    tags: "原神",
    variantName: "白厄",
  });
  sheet.addRow({
    teacherName: "越南Hitsuzi",
    groupName: "小卡",
    price: 20,
    stock: 3,
    tags: "原神",
    variantName: "昔漣",
  });
  sheet.addRow({
    teacherName: "越南Hitsuzi",
    groupName: "吊飾",
    price: 180,
    stock: 2,
    tags: "原神",
    variantName: "白厄",
  });

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="litan-instock-template.xlsx"',
    },
  });
}
