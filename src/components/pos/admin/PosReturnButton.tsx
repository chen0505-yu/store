"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PosOrder } from "@/lib/pos-types";
import { GlassCard } from "@/components/pos/GlassCard";
import { PosReturnOrderPanel } from "@/components/pos/PosReturnOrderPanel";

export function PosReturnButton({ order }: { order: PosOrder }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const anyReturnable = order.items.some((item) => item.quantity - item.returnedQuantity > 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        disabled={!anyReturnable}
        className="pos-input px-3 py-1.5 text-xs disabled:opacity-30"
      >
        退貨
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <GlassCard className="w-full max-w-lg">
            <PosReturnOrderPanel order={order} onClose={() => setIsOpen(false)} onSuccess={() => router.refresh()} />
          </GlassCard>
        </div>
      )}
    </>
  );
}
