import { notImplementedStub } from "@/lib/api-stub";

// 統一的未來平台串接入口：活動、繪師、商品（含細項）、訂單、庫存、報表
// 之後串接另一個賣場平台時，可以從這裡整合，或導向對應的 /api/{resource} 路由。
export async function GET() {
  return notImplementedStub("api/platform");
}
