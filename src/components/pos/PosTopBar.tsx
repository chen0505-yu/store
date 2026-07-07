import Link from "next/link";
import { logoutStaff } from "@/lib/actions/pos-auth";

async function handleLogout() {
  "use server";
  await logoutStaff();
}

export function PosTopBar({
  staffName,
  title,
  backHref,
  backLabel,
}: {
  staffName: string;
  title: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <div>
        {backHref && (
          <Link href={backHref} className="text-xs text-[var(--pos-text-muted)] hover:text-[var(--pos-gold)]">
            ← {backLabel ?? "返回"}
          </Link>
        )}
        <h1 className="text-2xl font-bold" style={{ color: "var(--pos-gold)" }}>
          {title}
        </h1>
      </div>
      <div className="flex items-center gap-3 text-sm text-[var(--pos-text-muted)]">
        <span>{staffName}</span>
        <form action={handleLogout}>
          <button type="submit" className="hover:text-[var(--pos-gold)]">
            登出
          </button>
        </form>
      </div>
    </div>
  );
}
