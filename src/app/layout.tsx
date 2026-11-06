import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "زيمارا للفوترة الإلكترونية", template: "%s · زيمارا" },
  description: "فوترة إلكترونية متوافقة مع المرحلة الثانية من هيئة الزكاة والضريبة والجمارك. زيمارا — التقنية بذوق أوضح.",
  icons: { icon: "/brand/favicon-32.png", apple: "/brand/apple-touch-icon.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#23003F" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+Arabic:wght@400;500;600&family=Readex+Pro:wght@500;600;700&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
