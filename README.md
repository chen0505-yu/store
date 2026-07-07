# LITAN Platform

同人活動預購／現貨商城，含後台管理、出貨流程、匯款對帳、Excel 批量上架。使用 Next.js 16（App Router）+ Supabase。

## 技術棧

- Next.js 16 (App Router, Server Actions, Turbopack)
- React 19 + TypeScript
- Tailwind CSS v4
- Supabase（PostgreSQL + Storage），所有資料存取都在伺服器端以 Service Role Key 進行

## 本機開發

```bash
npm install
cp .env.local.example .env.local   # 填入 Supabase 專案設定
npm run dev
```

開發環境下開啟 `http://localhost:3000/admin/setup` 可以建立第一個管理員帳號（見下方「建立第一個管理員」）。

## 環境變數

複製 `.env.local.example` 為 `.env.local`（本機）或設定在 Vercel Project Settings（正式環境），見檔案內註解說明。

| 變數 | 說明 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 專案 URL（Project Settings > API） |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key，擁有完整資料庫權限，絕對不能外流或加上 `NEXT_PUBLIC_` 前綴 |

## 資料庫設定

### 全新 Supabase 專案

直接在 Supabase SQL Editor 執行 `supabase/schema.sql`，會建立目前完整的資料表結構（含預購/現貨商品、訂單、出貨、匯款、二補、活動取貨、後台登入、匯款帳戶設定、POS 現場收銀等所有模組）。

### 既有專案套用增量變更

依編號順序在 SQL Editor 執行 `supabase/migrations/*.sql`（`002` 開始，中間的編號間隔是正常的，不影響套用結果，只要照檔名數字順序執行即可）。`supabase/schema.sql` 隨時反映套用所有 migration 後的最終狀態，可以用來核對目前資料庫是否有缺漏的表或欄位。

### 建立第一個管理員

1. 套用資料庫變更後，在**開發環境**（`npm run dev`，`NODE_ENV=development`）開啟 `/admin/setup`。
2. 填入帳號、顯示名稱、密碼（至少 8 碼）建立管理員。此頁面只有在完全沒有管理員帳號時可用，建立成功後會自動失效並導向 `/admin/login`。
3. 正式環境（`NODE_ENV=production`）這個頁面一律回傳 404，不能用來建立帳號；如需在正式環境新增管理員，請用已登入的管理員帳號操作，或直接在 Supabase 用 SQL 對 `admin_users` insert 一筆（密碼要先用 bcrypt 雜湊，不可存明碼）。

### Storage

`supabase/schema.sql` 會自動建立 `litan-images` public bucket（老師頭像、商品圖片上傳用）。上傳一律透過後台 Server Action 以 Service Role Key 寫入，前台讀取則直接使用 bucket 的公開網址。

## 部署（Vercel）

1. 在 Vercel 建立新專案，指向此 repo，Framework Preset 選 Next.js（預設即可）。
2. 在 Project Settings > Environment Variables 設定 `NEXT_PUBLIC_SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`（Production 與 Preview 都要設定）。
3. 部署完成後，先在 Supabase 上完成上方「資料庫設定」步驟，再開發環境建立第一個管理員帳號並用該帳號登入正式站台的 `/admin/login` 確認可以登入（管理員帳號建立於資料庫，不受 Vercel 部署環境影響）。
4. 到 `/admin/payment-settings` 設定正式匯款帳戶並啟用。

## 正式站與測試站分流

專案用兩個 Git branch 對應兩個環境，彼此使用**各自獨立的 Supabase 專案**，測試不會動到正式資料：

| Branch | Vercel 環境 | Supabase 專案 | 用途 |
| --- | --- | --- | --- |
| `main` | Production（正式網址） | 正式 Supabase 專案 | 給客人正式使用 |
| `develop` | Preview（Vercel 自動產生的預覽網址） | 另一組測試用 Supabase 專案 | 驗收新功能，不影響正式資料 |

### Vercel 設定

1. Project Settings > Git：確認 **Production Branch** 設為 `main`。
2. Project Settings > Environment Variables：`NEXT_PUBLIC_SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 這兩個變數，Environment 欄位分開設定兩組值：
   - 勾選 **Production** 的那組 → 填正式 Supabase 專案的值
   - 勾選 **Preview** 的那組 → 填測試 Supabase 專案的值（`develop` branch 的每次 push 都會部署成 Preview，自動套用這組）
3. 測試 Supabase 專案跟正式專案一樣，要先執行 `supabase/schema.sql`（或依序執行 migrations）、並用 `/admin/setup` 建立測試站自己的管理員帳號 — 兩邊資料庫完全獨立，帳號、商品、訂單都不會互相影響。

### 新增功能時的驗收流程

1. 從 `develop` 建立新的 feature branch（或直接在 `develop` 上開發，看團隊習慣）進行開發。
2. Push 上去後，Vercel 會自動產生一個 Preview 網址，連到測試 Supabase 專案，可以完整測試不影響正式站。
3. 確認測試站功能正常、沒有破壞既有功能後，把改動 merge 進 `develop`（如果是用獨立 feature branch 開發的話）。
4. 驗收沒問題後，把 `develop` merge 進 `main`，push 後 Vercel 會自動部署到 Production 正式網址。
5. 如果正式環境需要新的 migration，記得也要在**正式 Supabase 專案**的 SQL Editor 執行一次（測試站跟正式站的資料庫是分開的，各自要套用 migration）。

## 功能模組

- 預購／現貨商品管理（老師 → 品項 → 細項架構，各自獨立的商品/庫存/訂單流程）
- 預購保留匯款流程；現貨使用賣貨便，不需匯款
- 活動現場取貨（面交）與賣貨便完全分流：結帳、出貨訂單、列印皆強制檢查
- 出貨訂單合併、二補（到貨後追加補款）、批量列印（A4 四分之一）
- Excel 批量上架／匯出
- 後台管理員登入（`admin`/`artist` 角色，`artist` 角色目前僅預留）
- 會員（買家）登入、下單、匯款資料提交、出貨訂單查詢
- 商品品項總數統計（依老師分卡片，僅計入已確認/補款完成的有效訂單）
- 同人活動現場 POS 收銀（`/pos`，與網路商城完全獨立的員工/商品/訂單體系）

## 風險與待辦提醒

- **POS 模組有寫死在 migration 裡的預設帳密**（`supabase/migrations/021_pos_core.sql` 的 `admin` / `LitanPos2026!`）。正式上線前務必登入 `/pos/admin/staff` 立刻更改密碼或改用其他帳號。
- 開發用的「清空測試資料」按鈕（`/admin` Dashboard）與 `/admin/setup` 建立管理員頁面都只在 `NODE_ENV=development` 時可用，正式環境（`next build && next start` 或 Vercel Production 部署）會自動隱藏/回傳 404。
