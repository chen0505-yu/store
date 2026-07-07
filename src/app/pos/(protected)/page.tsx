import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/pos-auth";
import { getActivePosEvents } from "@/lib/data/pos-events";
import { GlassCard } from "@/components/pos/GlassCard";
import { PosTopBar } from "@/components/pos/PosTopBar";

// 現場心智模型是「同時只有一個目前活動」，不需要選活動畫面：
// 剛好一個目前活動 → 直接進選繪師頁；沒有/超過一個（設定異常）才顯示防呆清單。
export default async function PosEntryPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/pos/login");

  const activeEvents = await getActivePosEvents();
  if (activeEvents.length === 1) {
    redirect(`/pos/${activeEvents[0].id}`);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <PosTopBar staffName={staff.displayName} title="選擇活動" />

      {activeEvents.length === 0 && (
        <p className="text-sm text-[var(--pos-text-muted)]">
          目前沒有設定「目前活動」，請聯絡管理員到後台「活動管理」設定。
        </p>
      )}
      {activeEvents.length > 1 && (
        <p className="mb-4 text-sm text-red-400">
          目前有多個活動同時啟用中，請聯絡管理員確認（正常情況下應該只有一個）。
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {activeEvents.map((event) => (
          <Link key={event.id} href={`/pos/${event.id}`}>
            <GlassCard className="flex h-28 flex-col items-center justify-center gap-1 text-center transition hover:scale-[1.02]">
              <span className="text-lg font-semibold">{event.name}</span>
              {event.dayLabel && <span className="text-xs text-[var(--pos-text-muted)]">{event.dayLabel}</span>}
            </GlassCard>
          </Link>
        ))}
      </div>
    </div>
  );
}
