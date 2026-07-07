export type ProductType = "preorder" | "instock";
// 預購商品狀態：預購中 → 未到貨 → 已到台 → 整理中 → 已開賣貨便
export type ArrivalStatus = "preordering" | "not_arrived" | "arrived" | "packing" | "listed";
export type OrderType = "preorder" | "instock";
// 預購訂單的匯款/付款狀態，只用於預購，現貨恆為 null。
export type PreorderPaymentStatus =
  | "not_remitted"
  | "pending_confirmation"
  | "confirmed"
  | "underpaid"
  | "needs_supplement"
  | "cancelled";

// 補款狀態，只用於預購訂單，後台建立、客戶只能查看。
export type SupplementStatus = "pending" | "completed" | "not_needed" | "cancelled";

// 補款付款方式：有些補款會在貨到後透過賣貨便/貨到付款方式處理，不一定是匯款補款。
export type SupplementPaymentMethod = "remittance" | "cod";

// 訂單留言：客戶與後台都可以留言，數量不限。
export type OrderMessageAuthor = "customer" | "admin";

export type AnnouncementCategory = "news" | "shipping" | "event" | "important";

export interface Product {
  id: string;
  teacherId: string | null;
  teacherName: string | null;
  name: string;
  type: ProductType;
  price: number;
  imageUrl: string | null;
  arrivalStatus: ArrivalStatus | null; // 只用於預購
  stockQuantity: number | null; // 只用於現貨
  isSoldOut: boolean;
  tags: string[];
  preorderStartsAt: string | null; // 只用於預購，null 代表「即日起」無限制
  preorderEndsAt: string | null; // 只用於預購，null 代表沒有截止日
}

export interface OrderItemView {
  productName: string;
  teacherName: string | null;
  quantity: number;
  price: number; // 單價
  subtotal: number; // price * quantity，資料庫算好的欄位，顯示端不用自己重算
  productGroupName?: string | null; // 只用於預購（老師/品項/細項架構）：品項名稱，例如「小卡」
  variantName?: string | null; // 只用於預購：細項名稱，例如「白厄」
  arrivalStatus?: ArrivalStatus | null; // 只用於預購：該品項目前的狀態
  merged?: boolean; // 只用於預購：這筆訂單的這件商品是否已經合併出貨（商品進度第 4 階段判斷用）
}

export interface SupplementView {
  amount: number;
  reason: string | null;
  status: SupplementStatus;
  paymentMethod: SupplementPaymentMethod;
  note: string | null;
}

export interface PaymentView {
  remittanceDate: string | null;
  remittanceTime: string | null;
  accountLast5: string | null;
  screenshotUrl: string | null;
  actualAmount: number | null; // 客戶實際匯款金額
  underpaidAmount: number | null; // 少匯款金額 = 訂單總額 - actualAmount（由資料層即時計算，可能為負值代表溢繳）
}

export interface OrderMessageView {
  id: string;
  authorType: OrderMessageAuthor;
  content: string;
  createdAt: string;
  // 讀者永遠是留言作者的另一方：customer 留言 → 後台是否已讀；admin 留言 → 客戶是否已讀。
  isRead: boolean;
}

// 條件選品（例如盲抽買滿 5 抽選 1 張保底）客戶實際下單時選擇的保底/贈品項目。
export interface OrderBonusSelectionView {
  conditionProductName: string;
  bonusProductName: string;
  quantity: number;
}

export interface Order {
  id: string;
  orderNumber: string;
  orderType: OrderType;
  status: string;
  totalAmount: number;
  createdAt: string;
  items: OrderItemView[];
  marketplaceOrderNumber: string | null; // 只用於現貨：買家自行填入的賣貨便訂單編號
  paymentStatus?: PreorderPaymentStatus | null; // 只用於預購
  payment?: PaymentView | null; // 只用於預購：客戶已提交的匯款資料
  supplements?: SupplementView[]; // 只用於預購：後台建立的補款紀錄
  bonusSelections?: OrderBonusSelectionView[]; // 預購/現貨皆可能有：客戶選擇的盲抽/滿抽保底
  pickupMethod?: "shipment" | "event_pickup" | null; // 只用於預購：取貨方式
  eventPickupDisplayName?: string | null; // 只用於預購：選擇現場取貨時的活動場次快照
  messages: OrderMessageView[];
  preorderProgressIndex?: number; // 只用於預購：賣家預購訂單進度（見 src/lib/progress.ts）
}
