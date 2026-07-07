import type { AnnouncementCategory } from "@/lib/types";

// 公告分類固定只有這四種。
export const ANNOUNCEMENT_CATEGORY_ORDER: AnnouncementCategory[] = [
  "news",
  "shipping",
  "event",
  "important",
];

export const ANNOUNCEMENT_CATEGORY_LABEL: Record<AnnouncementCategory, string> = {
  news: "最新消息",
  shipping: "出貨公告",
  event: "活動公告",
  important: "重要公告",
};
