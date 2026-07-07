// <input type="datetime-local"> 需要 "YYYY-MM-DDTHH:mm" 格式的本地時間字串，
// 這裡統一處理 ISO 字串與該格式之間的轉換，避免時區換算散落在各個表單元件裡。
export function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInputValue(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}
