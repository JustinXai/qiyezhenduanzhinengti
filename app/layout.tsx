import type { Metadata } from "next";
import { Noto_Sans_SC } from "next/font/google";
import "./globals.css";

const notoSansSc = Noto_Sans_SC({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-noto-sans-sc",
  display: "swap",
  preload: true,
});

export const metadata: Metadata = {
  title: {
    default: "企业诊断智能体",
    template: "%s | 企业诊断智能体",
  },
  description: "基于 GEO 优化的企业 AI 可见度诊断 — 快速定位问题，承接 AI 流量红利",
  keywords: ["企业诊断", "AI可见度", "GEO优化", "AI搜索引擎优化", "企业数字化"],
  authors: [{ name: "企业诊断智能体" }],
  openGraph: {
    type: "website",
    locale: "zh_CN",
    siteName: "企业诊断智能体",
    title: "企业诊断智能体",
    description: "基于 GEO 优化的企业 AI 可见度诊断",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className={notoSansSc.variable}>
      <body className="font-sans antialiased bg-neutral-50 text-neutral-900">
        {children}
      </body>
    </html>
  );
}
