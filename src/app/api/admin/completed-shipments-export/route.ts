import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { getShipments } from "@/lib/data/shipments";
import { formatDateForExcel } from "@/lib/excel-utils";
import { PAYMENT_STATUS_LABEL } from "@/lib/product-status";

// 已完成訂單 Excel 匯出：訂單／買家／商品／金額／匯款／取貨／賣貨便編號／備註／完成時間，
// 依 ?ids= 逗號分隔的 shipment id 清單匯出，只會匯出真的是 completed 狀態的出貨訂單。
export async function GET(request: NextRequest) {
  const idsParam = request.nextUrl.searchParams.get("ids") ?? "";
  const ids = idsParam.split(",").map((id) => id.trim()).filter(Boolean);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("已完成訂單");

  sheet.columns = [
    { header: "出貨訂單編號", key: "shipmentNumber", width: 16 },
    { header: "類型", key: "type", width: 10 },
    { header: "賣家／繪師", key: "sellerName", width: 16 },
    { header: "買家", key: "customerName", width: 14 },
    { header: "平台訂單編號", key: "orderNumbers", width: 20 },
    { header: "商品明細", key: "items", width: 40 },
    { header: "金額", key: "totalAmount", width: 10 },
    { header: "匯款狀態", key: "paymentStatus", width: 12 },
    { header: "取貨方式", key: "pickupMethod", width: 14 },
    { header: "賣貨便訂單編號", key: "marketplaceOrderNumber", width: 18 },
    { header: "買家備註", key: "buyerNote", width: 24 },
    { header: "完成時間", key: "completedAt", width: 18 },
    { header: "完成者", key: "completedBy", width: 14 },
  ];

  if (ids.length > 0) {
    const all = await getShipments();
    const selected = all.filter((s) => ids.includes(s.id) && s.status === "completed");

    for (const s of selected) {
      const paymentStatuses = Array.from(
        new Set(s.orders.map((o) => (o.paymentStatus ? PAYMENT_STATUS_LABEL[o.paymentStatus] : "-")))
      );
      const sellerName = s.shipmentType === "artist" ? s.items[0]?.teacherName ?? "-" : "葴葴";
      const completedByRoleLabel =
        s.completedByRole === "member" ? "買家" : s.completedByRole === "artist" ? "繪師" : "後台";

      sheet.addRow({
        shipmentNumber: s.shipmentNumber,
        type: s.shipmentType === "artist" ? "繪師預購" : "葴葴預購",
        sellerName,
        customerName: s.customerName ?? "-",
        orderNumbers: s.orderNumbers.join("、"),
        items: s.items.map((i) => `${i.productGroupName ?? i.productName}${i.variantName ? ` - ${i.variantName}` : ""} x${i.quantity}`).join("；"),
        totalAmount: s.totalAmount,
        paymentStatus: paymentStatuses.join("、"),
        pickupMethod: s.pickupMethod === "event_pickup" ? `面交（${s.eventPickupDisplayName ?? "-"}）` : "賣貨便",
        marketplaceOrderNumber: s.marketplaceOrderNumber ?? "",
        buyerNote: s.buyerNote ?? "",
        completedAt: formatDateForExcel(s.completedAt),
        completedBy: s.completedByLabel ? `${completedByRoleLabel} ${s.completedByLabel}` : completedByRoleLabel,
      });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="litan-completed-shipments-export.xlsx"',
    },
  });
}
