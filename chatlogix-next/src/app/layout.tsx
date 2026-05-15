import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ChatLogix - AI 助手",
  description: "智能对话应用",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
