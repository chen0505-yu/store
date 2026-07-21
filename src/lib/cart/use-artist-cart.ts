import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// 繪師預購購物車：跟葴葴預購（use-preorder-cart.ts）結構相同，但購物車一次只能放一位
// 繪師的商品——使用者選擇「購物車一次只能放一位繪師的商品」，addItem 遇到不同 teacherId
// 時直接拒絕加入並回傳 false，UI 依此顯示提示訊息，不會清空購物車或自動覆蓋。
export interface ArtistCartItem {
  variantId: string;
  variantName: string;
  productGroupId: string;
  productGroupName: string;
  teacherId: string;
  teacherName: string;
  unitPrice: number;
  imageUrl: string | null;
  quantity: number;
}

interface ArtistCartState {
  items: ArtistCartItem[];
  addItem: (item: ArtistCartItem) => boolean;
  removeItem: (variantId: string) => void;
  updateQuantity: (variantId: string, quantity: number) => void;
  clear: () => void;
}

export const useArtistCart = create<ArtistCartState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item) => {
        const items = get().items;
        if (items.length > 0 && items[0].teacherId !== item.teacherId) {
          return false;
        }
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
        return true;
      },
      removeItem: (variantId) => set({ items: get().items.filter((i) => i.variantId !== variantId) }),
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
      name: "litan-artist-cart-v1",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
