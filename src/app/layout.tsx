import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NAS 文档版本库",
  description: "面向 NAS 部署的工程文档版本管理工具"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
