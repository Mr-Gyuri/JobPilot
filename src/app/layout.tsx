import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { Header } from "@/components/layout/Header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "JobPilot", template: "%s · JobPilot" },
  description: "Private, local-first job hunting assistant",
};

// Runs before first paint so a dark-mode preference never flashes light.
const THEME_SNIPPET = `(function(){try{var t=localStorage.getItem("jp_theme");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/*
          suppressHydrationWarning because browser extensions (ad and popup
          blockers in particular) rewrite inline scripts in <head> before React
          loads, replacing the body with a src pointing at the extension. React
          then reports a mismatch for markup it should not be reconciling
          anyway — this snippet is deliberately never re-rendered.
        */}
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: THEME_SNIPPET }} />
      </head>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <Header />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">{children}</main>
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
