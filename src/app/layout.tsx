import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";
import { themeInitScript } from "@/components/theme/theme-script";
import { PwaRegister } from "@/components/pwa/pwa-register";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * Finger Paint (Google Fonts, SIL OFL) — Paddy's wordmark face. Self-hosted
 * from src/app/fonts so builds and offline/PWA never depend on Google.
 */
const fingerPaint = localFont({
  src: "./fonts/FingerPaint-Regular.woff2",
  variable: "--font-finger-paint",
  weight: "400",
  display: "swap",
  fallback: ["ui-rounded", "Comic Sans MS", "system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: {
    default: "Paddy — Your personal AI companion",
    template: "%s · Paddy",
  },
  description:
    "Someone who remembers what matters to you. Everyday conversations, thoughtful guidance, and continuity that grows with you.",
  applicationName: "Paddy",
  // manifest + icon/apple-icon/favicon are linked automatically from
  // src/app/manifest.ts, icon.svg, apple-icon.png and favicon.ico.
  appleWebApp: {
    capable: true,
    title: "Paddy",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f5" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0a09" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fingerPaint.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ToastProvider>{children}</ToastProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
