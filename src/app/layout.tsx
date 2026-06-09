import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Project Document Library",
  description: "NAS-friendly engineering document version library with PDF preview and role-based security."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
