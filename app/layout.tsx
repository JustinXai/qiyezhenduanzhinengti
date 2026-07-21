import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "企业GEO诊断报告",
  description: "基于公开信息与客户决策问题分析，帮助企业发现AI搜索时代的信息建设机会。",
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
