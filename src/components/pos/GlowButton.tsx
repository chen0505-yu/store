import type { ButtonHTMLAttributes } from "react";

export function GlowButton({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`pos-glow-btn px-4 py-2 text-sm ${className}`} {...props} />;
}
