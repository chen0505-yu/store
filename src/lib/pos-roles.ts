// 純粹的角色/權限判斷函式，不依賴 next/headers 或任何 server-only 模組，
// 所以 Client Component（例如 PosStaffAdmin.tsx）可以直接 import 這裡，
// 不會把 next/headers 一起打包進瀏覽器端程式碼。
// src/lib/pos-auth.ts（server-only，含 getCurrentStaff）重新 export 這裡的內容，
// 給 Server Component / Server Action 用；兩邊共用同一份邏輯，不重複寫。

export type PosStaffRole = "super_admin" | "sub_admin" | "staff";

export function canManageAllData(role: PosStaffRole): boolean {
  return role === "super_admin";
}

export function canAccessPosAdmin(role: PosStaffRole): boolean {
  return role === "super_admin" || role === "sub_admin";
}

// 員工帳號管理是「對象敏感」的權限：super_admin 可以管理任何人（含其他 super_admin、
// 也含自己）；sub_admin（副管理員）可以管理 sub_admin/staff 帳號，但完全不能動
// super_admin 帳號（不能新增、停用/啟用、重設密碼、刪除）；staff 兩者都不行
// （staff 連 /pos/admin/staff 頁面都進不去，見 canAccessPosAdmin）。
export function canManageStaffTarget(actorRole: PosStaffRole, targetRole: PosStaffRole): boolean {
  if (actorRole === "super_admin") return true;
  if (actorRole === "sub_admin") return targetRole !== "super_admin";
  return false;
}
