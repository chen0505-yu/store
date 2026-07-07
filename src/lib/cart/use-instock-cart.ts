import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// 商品架構改為 老師 → 品項（instock_product_groups） → 細項（instock_product_variants）後，
// 現貨購物車以「細項」為最小購買單位，variantId 全域唯一（uuid），可以直接當作合併鍵。
// 跟預購購物車（use-preorder-cart.ts）完全分開的 store，資料形狀也不同，互不影響。
export interface InstockCartItem {
  variantId: string;
  variantName: string;
  groupId: string;
  groupName: string;
  teacherId: string;
  teacherName: string;
  unitPrice: number;
  imageUrl: string | null;
  stockQuantity: number;
  quantity: number;
}

interface InstockCartState {
  items: InstockCartItem[];
  addItem: (item: InstockCartItem) => void;
  removeItem: (variantId: string) => void;
  updateQuantity: (variantId: string, quantity: number) => void;
  clear: () => void;
}

export const useInstockCart = create<InstockCartState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item) => {
        const items = get().items;
        const existing = items.find((i) => i.variantId === item.variantId);
        if (existing) {
          set({
            items: items.map((i) =>
              i.variantId === item.variantId ? { ...i, quantity: i.quantity + item.quantity } : i
            ),
          });
        } else {
          set({ items: [...items, item] });
        }
      },
      removeItem: (variantId) =>
        set({ items: get().items.filter((i) => i.variantId !== variantId) }),
      updateQuantity: (variantId, quantity) => {
        if (quantity <= 0) {
          set({ items: get().items.filter((i) => i.variantId !== variantId) });
          return;
        }
        set({
          items: get().items.map((i) => (i.variantId === variantId ? { ...i, quantity } : i)),
        });
      },
      clear: () => set({ items: [] }),
    }),
    {
      // 舊版購物車（以 productId 為單位）跟新的細項結構不相容，改用新的 key，
      // 避免舊格式的 localStorage 資料被讀進來造成畫面出錯。
      name: "litan-instock-cart-v2",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
