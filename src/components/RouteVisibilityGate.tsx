"use client";

import { usePathname } from "next/navigation";

// 讓 Server Component（例如 Header）可以依目前路徑決定要不要渲染。Server Component
// 的輸出可以直接當作 children 傳進來，這裡只負責用 usePathname() 判斷要不要顯示。
export function RouteVisibilityGate({
  hideOnPrefix,
  children,
}: {
  hideOnPrefix: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  if (pathname.startsWith(hideOnPrefix)) return null;
  return <>{children}</>;
}
