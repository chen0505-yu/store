import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/pos-auth";
import { getAllPosEvents } from "@/lib/data/pos-events";
import { getPosOrders } from "@/lib/data/pos-orders";
import { GlassCard } from "@/components/pos/GlassCard";

export default async function PosAdminDashboardPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/pos/login");
  const [events, orders] = await Promise.all([getAllPosEvents(), getPosOrders()]);
  const activeEvents = events.filter((e) => e.isActive);
  const totalSales = orders.reduce((sum, o) => sum + o.totalAmount, 0);

  const stats = [
    { label: "進行中活動", value: activeEvents.length },
    { label: "累計訂單數", value: orders.length },
    { label: "累計銷售金額", value: `NT$ ${totalSales}` },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold" style={{ color: "var(--pos-gold)" }}>
        Dashboard
      </h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <GlassCard key={s.label} className="text-center">
            <p className="text-xs text-[var(--pos-text-muted)]">{s.label}</p>
            <p className="mt-2 text-2xl font-bold">{s.value}</p>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
