import { getCurrentAdmin, type CurrentAdmin } from "@/lib/admin-auth";

export interface ArtistContext {
  admin: CurrentAdmin;
  teacherId: string;
  isSuperAdminViewing: boolean;
}

// 解析目前登入身分實際要操作/檢視哪一間繪師商店：
// - role='artist'：永遠鎖定自己的 teacher_id，就算網址帶了 ?viewAs 也會被忽略
//   （防止越權查看其他繪師的資料——這是伺服器端強制執行，不是前端隱藏）。
// - role='super_admin'：需要網址帶 ?viewAs=<teacherId> 才會有結果，用來切換檢視特定繪師。
// 回傳 null 代表「未登入」或「super_admin 還沒選擇要看哪位繪師」，呼叫端各自決定要顯示什麼畫面。
export async function getArtistContext(viewAsTeacherId?: string): Promise<ArtistContext | null> {
  const admin = await getCurrentAdmin();
  if (!admin) return null;

  if (admin.role === "artist") {
    if (!admin.teacherId) return null;
    return { admin, teacherId: admin.teacherId, isSuperAdminViewing: false };
  }

  if (admin.role === "super_admin" && viewAsTeacherId) {
    return { admin, teacherId: viewAsTeacherId, isSuperAdminViewing: true };
  }

  return null;
}

// 給 server action 用：確認目前登入身分是否有權操作某一間繪師商店（依 teacherId 比對）。
// super_admin 永遠允許；artist 只有 teacherId 跟自己的 admin.teacherId 相同才允許。
// 這支函式回傳 null 代表沒有權限，呼叫端要直接回傳失敗訊息，不能讓動作繼續執行。
export async function requireArtistShopAccess(teacherId: string): Promise<CurrentAdmin | null> {
  const admin = await getCurrentAdmin();
  if (!admin) return null;
  if (admin.role === "super_admin") return admin;
  if (admin.role === "artist" && admin.teacherId === teacherId) return admin;
  return null;
}
