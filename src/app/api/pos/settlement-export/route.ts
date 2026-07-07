import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentStaff, canAccessPosAdmin } from "@/lib/pos-auth";
import { getPosEventById } from "@/lib/data/pos-events";
import { getArtistById } from "@/lib/data/pos-artists";
import { getPosOrders, type PosOrderFilter } from "@/lib/data/pos-orders";
import { getPosProductGroupStats } from "@/lib/data/pos-stats";
import { getProductGroupsByEvent } from "@/lib/data/pos-products";
import { formatDateForExcel } from "@/lib/excel-utils";

// 活動結算匯出：每場活動結束後要交給繪師核對的三份資料，一次匯出成一個 Excel（三個工作表）：
// 訂單明細、繪師銷售數量、繪師剩餘庫存。日期篩選只影響訂單明細/銷售數量（歷史資料），
// 剩餘庫存永遠是「現在當下」的庫存快照，不受日期篩選影響。可以選單一繪師，也可以整場活動全部繪師。
export async function GET(request: NextRequest) {
  const staff = await getCurrentStaff();
  if (!staff || !canAccessPosAdmin(staff.role)) {
    return NextResponse.json({ message: "沒有權限" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("eventId");
  const artistId = searchParams.get("artistId") || undefined;
  const dateFrom = searchParams.get("dateFrom") || undefined;
  const dateTo = searchParams.get("dateTo") || undefined;

  if (!eventId) {
    return NextResponse.json({ message: "請選擇活動" }, { status: 400 });
  }

  const event = await getPosEventById(eventId);
  if (!event) {
    return NextResponse.json({ message: "找不到活動" }, { status: 404 });
  }

  const artist = artistId ? await getArtistById(artistId) : null;
  if (artistId && !artist) {
    return NextResponse.json({ message: "找不到繪師" }, { status: 404 });
  }

  const filter: PosOrderFilter = { eventId, artistId, dateFrom, dateTo };
  const [orders, groupStats, remainingGroupsAll] = await Promise.all([
    getPosOrders(filter),
    getPosProductGroupStats(filter),
    getProductGroupsByEvent(eventId),
  ]);
  const remainingGroups = artistId ? remainingGroupsAll.filter((g) => g.artistId === artistId) : remainingGroupsAll;

  const workbook = new ExcelJS.Workbook();

  const orderSheet = workbook.addWorksheet("訂單明細");
  orderSheet.columns = [
    { header: "訂單編號", key: "orderNumber", width: 14 },
    { header: "訂單時間", key: "createdAt", width: 18 },
    { header: "活動名稱", key: "eventName", width: 16 },
    { header: "繪師", key: "artistName", width: 14 },
    { header: "商品名稱", key: "productName", width: 18 },
    { header: "數量", key: "quantity", width: 8 },
    { header: "單價", key: "unitPrice", width: 10 },
    { header: "小計", key: "subtotal", width: 10 },
    { header: "訂單總金額", key: "totalAmount", width: 12 },
    { header: "收款金額", key: "receivedAmount", width: 12 },
    { header: "找零", key: "changeAmount", width: 10 },
    { header: "小幫手", key: "staffName", width: 12 },
  ];
  for (const order of orders) {
    for (const item of order.items) {
      orderSheet.addRow({
        orderNumber: order.orderNumber,
        createdAt: formatDateForExcel(order.createdAt),
        eventName: order.eventName,
        artistName: order.artistName,
        productName: item.variantName ? `${item.groupName} - ${item.variantName}` : item.groupName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
        totalAmount: order.totalAmount,
        receivedAmount: order.receivedAmount,
        changeAmount: order.changeAmount,
        staffName: order.staffName ?? "-",
      });
    }
  }

  const statsSheet = workbook.addWorksheet("繪師銷售數量");
  statsSheet.columns = [
    { header: "活動名稱", key: "eventName", width: 16 },
    { header: "繪師", key: "artistName", width: 14 },
    { header: "商品名稱", key: "groupName", width: 18 },
    { header: "單價", key: "unitPrice", width: 10 },
    { header: "售出數量", key: "totalQuantity", width: 10 },
    { header: "銷售小計", key: "subtotal", width: 12 },
  ];
  for (const row of groupStats) {
    statsSheet.addRow({
      eventName: event.name,
      artistName: row.artistName,
      groupName: row.groupName,
      unitPrice: row.unitPrice,
      totalQuantity: row.totalQuantity,
      subtotal: row.subtotal,
    });
  }

  const stockSheet = workbook.addWorksheet("繪師剩餘庫存");
  stockSheet.columns = [
    { header: "活動名稱", key: "eventName", width: 16 },
    { header: "繪師", key: "artistName", width: 14 },
    { header: "商品名稱", key: "groupName", width: 18 },
    { header: "單價", key: "price", width: 10 },
    { header: "剩餘庫存", key: "stockQuantity", width: 10 },
    { header: "庫存金額參考", key: "stockValue", width: 14 },
  ];
  for (const group of remainingGroups) {
    stockSheet.addRow({
      eventName: event.name,
      artistName: group.artistName,
      groupName: group.name,
      price: group.price,
      stockQuantity: group.stockQuantity,
      stockValue: group.price * group.stockQuantity,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  // 檔名格式：活動名稱-Day-活動結算.xlsx，選單一繪師的話中間再加繪師名稱。
  const nameParts = [event.name];
  if (event.dayLabel) nameParts.push(event.dayLabel);
  if (artist) nameParts.push(artist.name);
  nameParts.push("活動結算");
  const fileName = `${nameParts.join("-")}.xlsx`;

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      // 中文檔名要用 filename*=UTF-8'' 語法，另外附一個 ASCII fallback 給不支援的舊瀏覽器。
      "Content-Disposition": `attachment; filename="pos-settlement.xlsx"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    },
  });
}
