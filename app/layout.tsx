import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "企业诊断智能体",
  description: "企业 AI 可见度诊断 - GEO 优化承接",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
