import { getInstockOrdersForPrint, type InstockPrintOrder } from "@/lib/data/print";
import { PrintButton } from "@/components/admin/PrintButton";

function chunkIntoPages(orders: InstockPrintOrder[], perPage: number): InstockPrintOrder[][] {
  const pages: InstockPrintOrder[][] = [];
  for (let i = 0; i < orders.length; i += perPage) {
    pages.push(orders.slice(i, i + perPage));
  }
  return pages;
}

// 現貨訂單列印：現貨沒有出貨訂單合併流程，直接列印平台訂單本身的商品明細，
// 支援批量列印（?order=id1,id2,...），仍維持跟出貨單一樣的 A4 四分之一版面。
export default async function AdminInstockPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order } = await searchParams;
  const orderIds = (order ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const orders = await getInstockOrdersForPrint(orderIds);
  const pages = chunkIntoPages(orders, 4);

  return (
    <div className="min-h-screen bg-zinc-100">
      <div className="sticky top-0 z-10 flex items-center justify-between bg-white p-4 shadow print:hidden">
        <p className="text-sm text-zinc-500">
          共 {orders.length} 筆現貨訂單，{pages.length} 張 A4（每張 4 份出貨單）
        </p>
        <PrintButton />
      </div>

      {orders.length === 0 ? (
        <p className="p-8 text-center text-zinc-500">找不到可列印的訂單</p>
      ) : (
        pages.map((pageOrders, pageIndex) => (
          <div key={pageIndex} className="print-page mx-auto grid grid-cols-2 grid-rows-2 bg-white">
            {pageOrders.map((o) => (
              <div
                key={o.id}
                className="label flex flex-col gap-2 border border-dashed border-zinc-400 p-4"
              >
                <p className="font-mono text-xl font-extrabold text-red-600">{o.orderNumber}</p>
                <p className="text-lg font-bold text-zinc-900">買家：{o.customerName ?? "-"}</p>
                {o.marketplaceOrderNumber && (
                  <p className="text-base font-semibold text-pink-700">
                    賣貨便訂單編號：{o.marketplaceOrderNumber}
                  </p>
                )}

                <div className="mt-1 flex flex-col gap-2">
                  {o.items.map((item, idx) => (
                    <div key={idx} className="border-t border-zinc-200 pt-2 text-base">
                      {(item.teacherCode || item.teacherName) && (
                        <p className="text-blue-600">
                          {item.teacherCode ? `Teacher ID：${item.teacherCode}　` : ""}
                          老師：<span className="font-semibold">{item.teacherName ?? "-"}</span>
                        </p>
                      )}
                      <p className="font-bold text-zinc-900">
                        {item.productName} × {item.quantity}
                      </p>
                    </div>
                  ))}
                </div>

                <p className="mt-auto text-right text-2xl font-extrabold text-purple-800">
                  總件數：{o.items.reduce((sum, i) => sum + i.quantity, 0)}
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
