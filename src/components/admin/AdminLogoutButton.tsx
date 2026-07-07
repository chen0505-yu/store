"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { logoutAdmin } from "@/lib/actions/admin-auth";

export function AdminLogoutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleLogout() {
    startTransition(async () => {
      await logoutAdmin();
      router.push("/admin/login");
      router.refresh();
    });
  }

  return (
    <button
      onClick={handleLogout}
      disabled={isPending}
      className="rounded-full bg-purple-100 px-4 py-1.5 text-xs font-semibold text-purple-700 disabled:opacity-50"
    >
      {isPending ? "登出中..." : "登出"}
    </button>
  );
}
