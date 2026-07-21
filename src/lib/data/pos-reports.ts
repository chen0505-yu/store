import { getPosOrders, type PosOrderFilter } from "@/lib/data/pos-orders";

// 銷售報表：來客數分析。單一收銀畫面過去一次只服務一位繪師，一張訂單即代表一位客人結一次帳，
// 「來客數」與「訂單數」數值相同；共用攤位上線後一張訂單可能同時包含多位 Artist 的商品，
// 所以改成依 pos_order_items.artist_id 分組——每張訂單裡「這位 Artist 有沒有商品」才算他
// 被消費一次，訂單數/來客數統計的是「這位 Artist 出現在幾張不同訂單裡」，銷售金額只加總
// 屬於他自己的商品小計（不是整張共用訂單的總金額），避免把同攤位另一位老師的業績算給他。
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
    // 同一張訂單裡，先把品項依真正所屬的 Artist 分開加總，一位 Artist 在同一張訂單裡
    // 買了多樣商品也只算一次訂單/來客數。
    const perArtist = new Map<string, { artistName: string; quantity: number; amount: number }>();
    for (const item of order.items) {
      const artistId = item.artistId ?? order.artistId;
      const artistName = item.artistName ?? order.artistName;
      const entry = perArtist.get(artistId) ?? { artistName, quantity: 0, amount: 0 };
      entry.quantity += item.quantity;
      entry.amount += item.subtotal;
      perArtist.set(artistId, entry);
    }

    for (const [artistId, { artistName, quantity, amount }] of perArtist) {
      if (filter.artistId && artistId !== filter.artistId) continue;

      const existing = grouped.get(artistId);
      if (existing) {
        existing.orderCount += 1;
        existing.customerCount += 1;
        existing.totalSalesAmount += amount;
        existing.totalQuantitySold += quantity;
      } else {
        grouped.set(artistId, {
          artistId,
          artistName,
          customerCount: 1,
          orderCount: 1,
          totalSalesAmount: amount,
          totalQuantitySold: quantity,
        });
      }
    }
  }

  return [...grouped.values()].sort((a, b) => b.totalSalesAmount - a.totalSalesAmount);
}
