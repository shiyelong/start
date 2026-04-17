import type { Metadata, Viewport } from "next";
import "./globals.css";
import MusicPlayerProvider from "@/components/player/MusicPlayerProvider";
import MusicPlayer from "@/components/player/MusicPlayer";
import AgeGateWrapper from "@/components/AgeGateWrapper";
import AppDownloadBanner from "@/components/ui/AppDownloadBanner";
import { ToastProvider } from "@/components/ui/Toast";
import BackToTop from "@/components/ui/BackToTop";

export const metadata: Metadata = {
  title: "星聚 — 视频·游戏·漫画·社区·AI",
  description: "视频、游戏、漫画、社区、聊天、AI 一站式平台",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/logo.svg", type: "image/svg+xml" },
    ],
    apple: "/logo.svg",
  },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "星聚" },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "format-detection": "telephone=no",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f0f0f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="icon" href="/logo.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/logo.svg" />
        <link rel="apple-touch-startup-image" href="/logo.svg" />
      </head>
      <body className="bg-[#0f0f0f] text-white min-h-screen antialiased overscroll-none">
        <ToastProvider>
          <MusicPlayerProvider>
            <AgeGateWrapper>
              {children}
            </AgeGateWrapper>
            <MusicPlayer />
            <AppDownloadBanner />
            <BackToTop />
          </MusicPlayerProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
