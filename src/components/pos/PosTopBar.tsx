import Link from "next/link";
import { PosUserMenu } from "@/components/pos/PosUserMenu";

export function PosTopBar({
  staffName,
  title,
  backHref,
  backLabel,
  extra,
}: {
  staffName: string;
  title: string;
  backHref?: string;
  backLabel?: string;
  extra?: React.ReactNode;
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
      <div className="flex items-center gap-3">
        {extra}
        <PosUserMenu displayName={staffName} />
      </div>
    </div>
  );
}
