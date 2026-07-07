// 只負責作為 /admin 底下所有路由（含 /admin/login）的共用進入點，不做登入驗證
// （/admin/login 也在這層底下，不能在這裡導向登入頁）。登入驗證交給 (protected) route group
// 的 layout，兩者路徑不受影響（route group 不會產生 URL 片段）。
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
