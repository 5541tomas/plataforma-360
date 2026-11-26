import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Plataforma 360",
  description: "Objetivos, finanças pessoais e do negócio, e CRM — tudo ligado.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "360", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};
export const viewport: Viewport = { themeColor: "#F5F5F7", width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT" className={inter.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
