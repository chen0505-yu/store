import { getPosOrders, type PosOrderFilter } from "@/lib/data/pos-orders";

// 商品銷售統計：現場來不及盤點庫存時，直接把「售出總數量」給繪師核對用，
// 所以聚合時刻意用「名稱＋單價」當群組鍵，而不是 group_id/variant_id
// （商品即使後來被刪除，訂單裡的名稱/單價快照仍然要能統計得出來）。
//
// 群組鍵一律用 item.artistId（商品明細真正所屬的 Artist），不是 order.artistId
// （那只是共用攤位訂單的代表 Artist 快照）——否則共用攤位訂單裡不同 Artist 的商品
// 會被誤算到同一個人頭上。只有明細 artist_id 對應不到（migration 039 前的舊資料、
// 商品/贈品規則已被刪除）時才 fallback 回 order 層級的 artistId/artistName。
export interface PosProductGroupStat {
  artistId: string;
  artistName: string;
  groupName: string;
  unitPrice: number;
  totalQuantity: number;
  subtotal: number;
}

export async function getPosProductGroupStats(filter: PosOrderFilter = {}): Promise<PosProductGroupStat[]> {
  // getPosOrders 依 artistId 篩選時回傳的是「這位 Artist 有商品在裡面」的完整訂單
  // （共用攤位訂單可能還混著其他 Artist 的商品），所以這裡分組完之後，若有指定
  // artistId，還要再篩掉不屬於這位 Artist 的分組，避免統計混進同攤位其他人的商品。
  const orders = await getPosOrders(filter);

  const grouped = new Map<string, PosProductGroupStat>();
  for (const order of orders) {
    for (const item of order.items) {
      const artistId = item.artistId ?? order.artistId;
      const artistName = item.artistName ?? order.artistName;
      const key = `${artistId}::${item.groupName}::${item.unitPrice}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.totalQuantity += item.quantity;
        existing.subtotal += item.subtotal;
      } else {
        grouped.set(key, {
          artistId,
          artistName,
          groupName: item.groupName,
          unitPrice: item.unitPrice,
          totalQuantity: item.quantity,
          subtotal: item.subtotal,
        });
      }
    }
  }

  const results = filter.artistId
    ? [...grouped.values()].filter((row) => row.artistId === filter.artistId)
    : [...grouped.values()];

  return results.sort((a, b) => a.artistName.localeCompare(b.artistName, "zh-Hant"));
}
