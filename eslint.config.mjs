import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 獨立的一次性 Node 腳本（例如整合測試腳本），不是 app 原始碼，不套用 Next.js 的
    // React/TypeScript lint 規則（例如 require() 寫法在這裡是刻意的，避免依賴額外工具鏈）。
    "scripts/**",
  ]),
]);

export default eslintConfig;
