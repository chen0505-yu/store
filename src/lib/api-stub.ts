import { NextResponse } from "next/server";

// 給未來串接賣場平台預留的 API 路由用：Phase 1 只先保留路徑與回應格式，
// 尚未實作真正的資料存取邏輯（見規格第 13 項）。
export function notImplementedStub(resourceName: string) {
  return NextResponse.json(
    {
      success: false,
      message: `/${resourceName} 尚未實作，這是為未來賣場平台串接預留的 API 路徑`,
    },
    { status: 501 }
  );
}
