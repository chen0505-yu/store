import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
    // 圖片檔名是上傳時產生的 UUID，同一個網址的內容永遠不會變，可以放心長期快取
    // （預設只有 60 秒，對這種「網址=內容」的圖片來說太短，等於沒快取）。
    minimumCacheTTL: 31536000,
  },
};

export default nextConfig;
