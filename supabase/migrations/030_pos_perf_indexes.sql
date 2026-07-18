-- 效能診斷後補上缺少的索引。pos_artists.event_id 之前沒有索引：選繪師頁／商品管理
-- 篩選器／Excel 匯入比對繪師，都是「依 event_id 撈這場活動底下所有繪師」，活動與
-- 繪師數量隨著辦越多場成長，及早補上避免之後變成全表掃描。
--
-- 另外幫 pos_product_groups 補一個 (artist_id, sort_order) 複合索引：POS 收銀畫面
-- 唯一的商品查詢（getSellableProductGroupsByArtist → getProductGroupsByArtist）就是
-- 「WHERE artist_id = ? ORDER BY sort_order」，複合索引可以讓這個全站最高頻的查詢
-- 直接依索引順序讀出，不用另外排序。
--
-- 請在 Supabase SQL Editor 執行本檔案（承接 001~029）。

create index if not exists pos_artists_event_id_idx on pos_artists(event_id);
create index if not exists pos_product_groups_artist_sort_idx on pos_product_groups(artist_id, sort_order);
