import { getShipmentsForPrint, type PrintOrder } from "@/lib/data/print";
import { PrintButton } from "@/components/admin/PrintButton";

function chunkIntoPages(orders: PrintOrder[], perPage: number): PrintOrder[][] {
  const pages: PrintOrder[][] = [];
  for (let i = 0; i < orders.length; i += perPage) {
    pages.push(orders.slice(i, i + perPage));
  }
  return pages;
}

export default async function AdminPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ shipment?: string }>;
}) {
  const { shipment } = await searchParams;
  const shipmentIds = (shipment ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const orders = await getShipmentsForPrint(shipmentIds);
  const pages = chunkIntoPages(orders, 4);

  // 賣貨便與面交／活動取貨不可混在同一批列印：即使繞過後台勾選直接帶網址參數進來，這裡也要擋下。
  const pickupMethodsInBatch = new Set(orders.map((o) => o.pickupMethod ?? "shipment"));
  const isMixedPrintBatch = pickupMethodsInBatch.size > 1;

  return (
    <div className="min-h-screen bg-zinc-100">
      <div className="sticky top-0 z-10 flex items-center justify-between bg-white p-4 shadow print:hidden">
        <p className="text-sm text-zinc-500">
          共 {orders.length} 筆出貨訂單，{pages.length} 張 A4（每張 4 份出貨單）
        </p>
        <PrintButton />
      </div>

      {isMixedPrintBatch ? (
        <p className="p-8 text-center font-semibold text-red-500">
          賣貨便與面交／活動取貨商品不可混在同一批列印，請分開列印。
        </p>
      ) : orders.length === 0 ? (
        <p className="p-8 text-center text-zinc-500">找不到可列印的訂單</p>
      ) : (
        pages.map((pageOrders, pageIndex) => (
          <div key={pageIndex} className="print-page mx-auto grid grid-cols-2 grid-rows-2 bg-white">
            {pageOrders.map((order) => (
              <div
                key={order.id}
                className="label flex flex-col gap-2 border border-dashed border-zinc-400 p-4"
              >
                <p className="font-mono text-xl font-extrabold text-red-600">
                  {order.shipmentNumber}
                </p>
                <p className="font-mono text-base font-semibold text-red-500">
                  平台訂單：{order.orderNumbers.join("、")}
                </p>
                <p className="text-lg font-bold text-zinc-900">
                  買家：{order.customerName ?? "-"}
                </p>
                <p className="text-base font-semibold text-purple-700">
                  取貨方式：
                  {order.pickupMethod === "event_pickup"
                    ? `面交／活動取貨（${order.eventPickupDisplayName ?? "-"}）`
                    : "賣貨便"}
                </p>
                {order.marketplaceOrderNumber && (
                  <p className="text-base font-semibold text-pink-700">
                    賣貨便訂單編號：{order.marketplaceOrderNumber}
                  </p>
                )}

                <div className="mt-1 flex flex-col gap-2">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="border-t border-zinc-200 pt-2 text-base">
                      <p className="text-blue-600">
                        Teacher ID：{item.teacherCode ?? "-"}　老師：
                        <span className="font-semibold">{item.teacherName ?? "-"}</span>
                      </p>
                      <p className="font-bold text-zinc-900">
                        {item.productName} × {item.quantity}
                      </p>
                    </div>
                  ))}
                </div>

                {order.bonusSelections.length > 0 && (
                  <div className="mt-1 rounded-lg bg-purple-50 p-2">
                    <p className="text-sm font-bold text-purple-700">保底/贈品：</p>
                    {order.bonusSelections.map((b, idx) => (
                      <p key={idx} className="text-sm text-purple-700">
                        {b.conditionProductName} → {b.bonusProductName} × {b.quantity}
                      </p>
                    ))}
                  </div>
                )}

                <p className="mt-auto text-right text-2xl font-extrabold text-purple-800">
                  總件數：{order.items.reduce((sum, i) => sum + i.quantity, 0)}
                </p>
              </div>
            ))}
            {Array.from({ length: 4 - pageOrders.length }).map((_, idx) => (
              <div key={`empty-${idx}`} className="border border-dashed border-zinc-200" />
            ))}
          </div>
        ))
      )}

      <style>{`
        .print-page {
          width: 210mm;
          min-height: 297mm;
        }
        @media print {
          @page {
            size: A4;
            margin: 0;
          }
          .print-page {
            width: 210mm;
            height: 297mm;
            page-break-after: always;
          }
        }
      `}</style>
    </div>
  );
}
