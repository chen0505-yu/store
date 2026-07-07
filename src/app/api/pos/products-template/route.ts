import ExcelJS from "exceljs";
import { NextResponse } from "next/server";

// POS 商品 Excel 範本：一次建立多個商品主項用。用 Artist 名稱比對（不用記代碼），
// 只會對到「目前活動」底下的繪師，所以要先到「繪師管理」把繪師建好。
// 圖片不透過 Excel 匯入，之後管理者自己到後台補（見 src/components/pos/admin/PosProductImportPanel.tsx）。
export async function GET() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("POS商品");

  sheet.columns = [
    { header: "Artist", key: "artistName", width: 14 },
    { header: "商品名稱", key: "name", width: 18 },
    { header: "單價", key: "price", width: 10 },
    { header: "庫存", key: "stock", width: 10 },
    { header: "備註", key: "note", width: 20 },
  ];

  sheet.addRow({ artistName: "Sunday", name: "小卡", price: 100, stock: 23, note: "" });
  sheet.addRow({ artistName: "Sunday", name: "壓克力吊飾", price: 350, stock: 10, note: "每人限購2" });

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="pos-products-template.xlsx"',
    },
  });
}
