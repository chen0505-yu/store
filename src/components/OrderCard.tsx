import type { Order } from "@/lib/types";
import {
  PAYMENT_STATUS_LABEL,
  SUPPLEMENT_PAYMENT_METHOD_LABEL,
  SUPPLEMENT_STATUS_LABEL,
} from "@/lib/product-status";
import { PaymentSubmitForm } from "@/components/PaymentSubmitForm";
import { OrderMessages } from "@/components/OrderMessages";
import { PaymentAccountInfo } from "@/components/PaymentAccountInfo";
import { ProgressStepper } from "@/components/ProgressStepper";
import {
  PRODUCT_PROGRESS_STEPS,
  PREORDER_ORDER_PROGRESS_STEPS,
  getOrderItemProgressIndex,
} from "@/lib/progress";
import type { PaymentSettingsView } from "@/lib/data/payment-settings";

const STATUS_LABEL: Record<string, string> = {
  pending_payment: "待匯款",
  pending_shipment: "待出貨",
  paid: "已付款",
  shipped: "已出貨",
  completed: "已完成",
};

// 已取消／不需要的補款不顯示為「需補款」，只有待補款、已補款才算進提醒金額。
// 補款/二補金額只是提醒客戶還要補多少，不會加進訂單總金額（訂單總金額 = 商品總金額，固定不變）。
function activeSupplementTotal(order: Order): number {
  return (order.supplements ?? [])
    .filter((s) => s.status !== "cancelled" && s.status !== "not_needed")
    .reduce((sum, s) => sum + s.amount, 0);
}

export function OrderCard({
  order,
  paymentSettings,
}: {
  order: Order;
  paymentSettings?: PaymentSettingsView | null;
}) {
  // 預購訂單的 order.status 建立後就固定是 pending_payment，直到出貨完成才會變 completed，
  // 不會跟著 paymentStatus 更新——同時顯示兩者會讓已匯款的訂單還掛著「待匯款」，誤導客人，
  // 所以預購訂單這裡只看 paymentStatus，不重複顯示這個已經過時的「待匯款」。
  const showOrderStatusBadge = !(order.orderType === "preorder" && order.status === "pending_payment");
  const supplementTotal = activeSupplementTotal(order);
  const remittedAmount = order.payment?.actualAmount ?? null;
  const underpaidAmount =
    order.payment?.underpaidAmount !== null && order.payment?.underpaidAmount !== undefined
      ? order.payment.underpaidAmount
      : null;
  // 訂單尚未匯款或匯款還在等後台確認時，顯示匯款帳戶資訊，避免客人不知道要匯去哪裡。
  const showPaymentAccount =
    order.paymentStatus === "not_remitted" || order.paymentStatus === "pending_confirmation";

  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-sm font-semibold text-purple-600">
          {order.orderNumber}
        </span>
        <div className="flex items-center gap-2">
          {order.paymentStatus && (
            <span className="rounded-full bg-pink-50 px-3 py-1 text-xs font-medium text-pink-500">
              {PAYMENT_STATUS_LABEL[order.paymentStatus]}
            </span>
          )}
          {showOrderStatusBadge && (
            <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-medium text-purple-500">
              {STATUS_LABEL[order.status] ?? order.status}
            </span>
          )}
        </div>
      </div>

      {order.pickupMethod && (
        <p className="mt-2 text-xs text-purple-500">
          取貨方式：
          {order.pickupMethod === "event_pickup"
            ? `活動現場取貨（${order.eventPickupDisplayName ?? "-"}）`
            : "賣貨便配送"}
        </p>
      )}

      {order.orderType === "preorder" && order.preorderProgressIndex !== undefined && (
        <div className="mt-3 rounded-2xl bg-purple-50/50 p-3">
          <ProgressStepper
            steps={PREORDER_ORDER_PROGRESS_STEPS}
            currentIndex={order.preorderProgressIndex}
            size="sm"
          />
        </div>
      )}

      <ul className="mt-3 flex flex-col gap-2 text-sm text-zinc-600">
        {order.items.map((item, idx) => {
          const displayName =
            item.productGroupName && item.variantName
              ? `${item.productGroupName} - ${item.variantName}`
              : item.productName;
          return (
            <li key={idx} className="flex flex-col gap-1.5 border-t border-purple-50 pt-2 first:border-t-0 first:pt-0">
              <div className="flex items-center justify-between gap-2">
                <span>
                  {displayName}
                  {item.teacherName ? `（${item.teacherName}）` : ""}
                  <span className="ml-1 text-xs text-zinc-400">
                    單價 NT$ {item.price} × {item.quantity}
                  </span>
                </span>
                <span>小計 NT$ {item.subtotal}</span>
              </div>
              {item.arrivalStatus !== undefined && item.arrivalStatus !== null && (
                <ProgressStepper
                  steps={PRODUCT_PROGRESS_STEPS}
                  currentIndex={getOrderItemProgressIndex(item.arrivalStatus ?? null, item.merged ?? false)}
                  size="sm"
                />
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex flex-col gap-1 border-t border-purple-50 pt-2 text-right text-sm text-zinc-600">
        <div className="flex items-center justify-between">
          <span>商品總金額</span>
          <span>NT$ {order.totalAmount}</span>
        </div>
        {remittedAmount !== null && (
          <div className="flex items-center justify-between">
            <span>已匯款</span>
            <span>NT$ {remittedAmount}</span>
          </div>
        )}
        {underpaidAmount !== null && underpaidAmount > 0 && (
          <div className="flex items-center justify-between text-pink-600">
            <span>少匯款</span>
            <span>NT$ {underpaidAmount}</span>
          </div>
        )}
        {supplementTotal > 0 && (
          <div className="flex items-center justify-between text-pink-600">
            <span>需補款</span>
            <span>NT$ {supplementTotal}</span>
          </div>
        )}
        <div className="flex items-center justify-between font-semibold text-zinc-800">
          <span>訂單總金額</span>
          <span>NT$ {order.totalAmount}</span>
        </div>
      </div>

      {order.supplements && order.supplements.length > 0 && (
        <div className="mt-3 flex flex-col gap-2 rounded-2xl bg-pink-50/60 p-3">
          <p className="text-xs font-semibold text-pink-600">補款</p>
          {order.supplements.map((s, idx) => (
            <div key={idx} className="text-xs text-zinc-600">
              <div className="flex items-center justify-between">
                <span>金額 NT$ {s.amount}</span>
                <span className="flex items-center gap-1">
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-zinc-500">
                    {SUPPLEMENT_PAYMENT_METHOD_LABEL[s.paymentMethod]}
                  </span>
                  <span className="rounded-full bg-pink-100 px-2 py-0.5 text-pink-600">
                    {SUPPLEMENT_STATUS_LABEL[s.status]}
                  </span>
                </span>
              </div>
              {s.reason && <p className="mt-1 text-zinc-500">原因：{s.reason}</p>}
            </div>
          ))}
        </div>
      )}

      {order.bonusSelections && order.bonusSelections.length > 0 && (
        <div className="mt-3 flex flex-col gap-1 rounded-2xl bg-purple-50/60 p-3">
          <p className="text-xs font-semibold text-purple-600">保底/贈品選擇</p>
          {order.bonusSelections.map((b, idx) => (
            <p key={idx} className="text-xs text-zinc-600">
              {b.conditionProductName} → {b.bonusProductName} × {b.quantity}
            </p>
          ))}
        </div>
      )}

      {showPaymentAccount && paymentSettings && (
        <div className="mt-3">
          <PaymentAccountInfo paymentSettings={paymentSettings} />
        </div>
      )}

      <PaymentSubmitForm orderId={order.id} existingPayment={order.payment ?? null} />
      <OrderMessages orderId={order.id} messages={order.messages} role="customer" />
    </div>
  );
}
