import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roll Credits",
  description: "Find the people your code depends on, and pay them through PayPal.",
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
