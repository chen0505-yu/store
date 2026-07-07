import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { CartBar } from "@/components/CartBar";
import { RouteVisibilityGate } from "@/components/RouteVisibilityGate";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LITAN Platform",
  description: "中文同人商品預購與現貨販售平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-Hant"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-[var(--background)] text-[var(--foreground)]">
        <RouteVisibilityGate hideOnPrefix="/pos">
          <Header />
        </RouteVisibilityGate>
        <main className="flex flex-1 flex-col">{children}</main>
        <CartBar />
      </body>
    </html>
  );
}
