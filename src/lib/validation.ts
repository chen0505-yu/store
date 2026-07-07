// FB 個人頁面連結至少需要是 facebook.com 或 www.facebook.com 的網址。
// 客戶端與伺服器端（Server Action 再驗證一次，避免繞過前端）共用同一套規則。
export function isFacebookProfileUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return false;
  }

  const host = url.hostname.toLowerCase();
  return host === "facebook.com" || host === "www.facebook.com";
}
