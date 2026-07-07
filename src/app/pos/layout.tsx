import { Inter, Noto_Sans_TC } from "next/font/google";
import "./pos-theme.css";

// 中文吃 Noto Sans TC、英文數字吃 Inter：CSS font-family 清單裡 Inter 排前面，
// 瀏覽器會針對每個字元找第一個涵蓋該字元的字型，剛好達成「英數 Inter、中文 Noto Sans TC」。
const inter = Inter({ variable: "--font-pos-inter", subsets: ["latin"] });
const notoSansTC = Noto_Sans_TC({
  variable: "--font-pos-noto",
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
});

// 只負責套用星空主題，不做登入驗證（/pos/login 也在這層底下，不能在這裡導向登入頁）。
// 登入驗證交給 (protected) route group 的 layout，兩者路徑不受影響（route group 不會產生 URL 片段）。
export default function PosLayout({ children }: { children: React.ReactNode }) {
  return <div className={`pos-theme ${inter.variable} ${notoSansTC.variable}`}>{children}</div>;
}
