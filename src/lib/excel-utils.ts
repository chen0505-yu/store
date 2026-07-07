import ExcelJS from "exceljs";

export function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "text" in value) return String((value as { text: unknown }).text ?? "");
  if (typeof value === "object" && "result" in value) return String((value as { result: unknown }).result ?? "");
  return String(value).trim();
}

export function cellNumber(value: ExcelJS.CellValue): number | null {
  if (value === null || value === undefined || value === "") return null;
  const text = cellText(value);
  if (!text) return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

// 支援 Excel 原生日期格式（儲存格被格式化為日期時，ExcelJS 會給 Date 物件），
// 也支援使用者直接輸入的文字，例如「2026/07/01 00:00」或「2026-07-01 00:00」。
// 空白代表未指定（呼叫端自行決定預設值，例如預購開始留空 = 即日起）。
export function cellDate(value: ExcelJS.CellValue): { ok: true; iso: string | null } | { ok: false } {
  if (value === null || value === undefined || value === "") return { ok: true, iso: null };
  if (value instanceof Date) return { ok: true, iso: value.toISOString() };

  const text = cellText(value).trim();
  if (!text) return { ok: true, iso: null };

  const match = text.match(
    /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2}))?$/
  );
  if (!match) return { ok: false };

  const [, year, month, day, hour, minute] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    hour ? Number(hour) : 0,
    minute ? Number(minute) : 0
  );
  if (Number.isNaN(date.getTime())) return { ok: false };
  return { ok: true, iso: date.toISOString() };
}

export function parseTagsCell(value: ExcelJS.CellValue): string[] {
  return cellText(value)
    .split(/[,、]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function formatDateForExcel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
