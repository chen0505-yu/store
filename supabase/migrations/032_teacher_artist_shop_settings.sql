-- 平台調整：繪師預購專區——每位繪師（透過 admin_users.teacher_id 連結）可以自己管理
-- 商店的匯款規則與收款資訊，跟葴葴預購共用同一個全站 payment_settings 帳戶不同。
-- 這些欄位只有 is_artist_shop = true 的 teachers row 會用到；葴葴自己的老師 row 全部留空，
-- 繼續使用既有的 payment_settings 全站帳戶顯示邏輯，不受影響。
alter table teachers add column if not exists is_artist_shop boolean not null default false;
alter table teachers add column if not exists remittance_starts_at timestamptz;
alter table teachers add column if not exists remittance_ends_at timestamptz;
alter table teachers add column if not exists bank_name text;
alter table teachers add column if not exists bank_code text;
alter table teachers add column if not exists account_name text;
alter table teachers add column if not exists account_number text;
alter table teachers add column if not exists remittance_note text;
alter table teachers add column if not exists marketplace_note text; -- 賣貨便說明或連結

-- 保留未來串接第三方支付／固定虛擬帳號的擴充欄位，本次不實作、不顯示在任何表單。
alter table teachers add column if not exists payment_provider text;
alter table teachers add column if not exists virtual_account_number text;

create index if not exists teachers_is_artist_shop_idx on teachers(is_artist_shop);
