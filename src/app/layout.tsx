import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  // The template gives document pages "«title» · Ajaia Docs" — which is what the
  // browser tab, the print header, and a saved PDF's default filename all show.
  title: { default: "Ajaia Docs", template: "%s · Ajaia Docs" },
  description: "A lightweight collaborative document editor.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/**
 * Runs before first paint so the page never flashes the wrong theme. Reads the
 * stored choice, falls back to the OS preference, and stamps `data-theme` on
 * <html> — which is what globals.css keys every token off.
 */
const themeInit = `(function(){try{var t=localStorage.getItem("ajaia-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: data-theme is set client-side before hydration,
    // so the server-rendered attribute intentionally differs.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
