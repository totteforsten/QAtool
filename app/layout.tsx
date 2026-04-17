import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QAtool — WordPress SEO & Responsive Audits",
  description:
    "Scan any site for SEO and responsive-design issues. Built for WordPress, Elementor, and Breakdance."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-white/10">
          <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-md bg-gradient-to-br from-indigo-500 to-cyan-400" />
              <span className="font-semibold tracking-tight">QAtool</span>
              <span className="text-xs text-white/40 ml-2">SEO · Responsive · WordPress</span>
            </div>
            <a
              href="https://github.com/totteforsten/qatool"
              className="text-sm text-white/60 hover:text-white"
              target="_blank"
              rel="noreferrer"
            >
              GitHub
            </a>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
        <footer className="mx-auto max-w-5xl px-6 py-10 text-xs text-white/40">
          Crawls sitemap.xml + fetches raw HTML; no headless browser. Use the WordPress plugin for inline patches.
        </footer>
      </body>
    </html>
  );
}
