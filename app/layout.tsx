import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Outfit (SIL OFL 1.1). Variable weight 100–900; see app/fonts/OFL.txt.
const sans = localFont({
  src: "./fonts/Outfit-Variable.ttf",
  display: "swap",
  variable: "--font-sans",
  weight: "100 900",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: "PayLink Circles: split bills and run ajo with NIM or USDT",
  description: "Group bill-splits and rotating savings circles inside Nimiq Pay. Everyone pays their share in NIM or USDT, confirmed on chain.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#e9eaec",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={sans.variable}>
      <body>{children}</body>
    </html>
  );
}
