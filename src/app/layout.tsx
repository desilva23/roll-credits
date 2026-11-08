import type { Metadata } from "next";
import { Bodoni_Moda, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Self-hosted at build time, so the strict Content-Security-Policy needs no
// exception for a font CDN.
const display = Bodoni_Moda({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-display",
  display: "swap",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Roll Credits",
  description: "Find the people your code depends on, and pay them through PayPal.",
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
