import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "企业诊断智能体",
  description: "输入企业官网与客户常问问题,生成一份基于公开证据的企业诊断报告。",
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
