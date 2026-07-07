import { getPosOrders, type PosOrderFilter } from "@/lib/data/pos-orders";

// 商品銷售統計：現場來不及盤點庫存時，直接把「售出總數量」給繪師核對用，
// 所以聚合時刻意用「名稱＋單價」當群組鍵，而不是 group_id/variant_id
// （商品即使後來被刪除，訂單裡的名稱/單價快照仍然要能統計得出來）。
export interface PosProductGroupStat {
  artistId: string;
  artistName: string;
  groupName: string;
  unitPrice: number;
  totalQuantity: number;
  subtotal: number;
}

export async function getPosProductGroupStats(filter: PosOrderFilter = {}): Promise<PosProductGroupStat[]> {
  const orders = await getPosOrders(filter);

  const grouped = new Map<string, PosProductGroupStat>();
  for (const order of orders) {
    for (const item of order.items) {
      const key = `${order.artistId}::${item.groupName}::${item.unitPrice}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.totalQuantity += item.quantity;
        existing.subtotal += item.subtotal;
      } else {
        grouped.set(key, {
          artistId: order.artistId,
          artistName: order.artistName,
          groupName: item.groupName,
          unitPrice: item.unitPrice,
          totalQuantity: item.quantity,
          subtotal: item.subtotal,
        });
      }
    }
  }

  return [...grouped.values()].sort((a, b) => a.artistName.localeCompare(b.artistName, "zh-Hant"));
}
