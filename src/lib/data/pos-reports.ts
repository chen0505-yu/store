import { getPosOrders, type PosOrderFilter } from "@/lib/data/pos-orders";

// 銷售報表：來客數分析。單一收銀畫面一次只服務一位繪師，一張訂單即代表一位客人結一次帳，
// 所以「來客數」與「訂單數」在這套設計下數值相同，分開顯示是為了語意清楚（給繪師看「幾組客人跟你買」）。
export interface PosArtistReport {
  artistId: string;
  artistName: string;
  customerCount: number;
  orderCount: number;
  totalSalesAmount: number;
  totalQuantitySold: number;
}

export async function getPosArtistReports(filter: PosOrderFilter = {}): Promise<PosArtistReport[]> {
  const orders = await getPosOrders(filter);

  const grouped = new Map<string, PosArtistReport>();
  for (const order of orders) {
    const existing = grouped.get(order.artistId);
    const quantity = order.items.reduce((sum, item) => sum + item.quantity, 0);

    if (existing) {
      existing.orderCount += 1;
      existing.customerCount += 1;
      existing.totalSalesAmount += order.totalAmount;
      existing.totalQuantitySold += quantity;
    } else {
      grouped.set(order.artistId, {
        artistId: order.artistId,
        artistName: order.artistName,
        customerCount: 1,
        orderCount: 1,
        totalSalesAmount: order.totalAmount,
        totalQuantitySold: quantity,
      });
    }
  }

  return [...grouped.values()].sort((a, b) => b.totalSalesAmount - a.totalSalesAmount);
}
