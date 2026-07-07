import { notFound, redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { AdminSetupForm } from "@/components/admin/AdminSetupForm";

// 只在開發環境提供這個頁面，正式環境一律 404，避免變成後門。
export default async function AdminSetupPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { count } = await supabase.from("admin_users").select("id", { count: "exact", head: true });
    if (count && count > 0) redirect("/admin/login");
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-4">
      <AdminSetupForm />
    </div>
  );
}
