import type { HTMLAttributes } from "react";

export function GlassCard({
  children,
  className = "",
  ...rest
}: HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`pos-glass p-4 ${className}`} {...rest}>
      {children}
    </div>
  );
}
