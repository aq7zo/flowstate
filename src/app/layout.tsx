import type { Metadata } from "next";
import { DM_Sans, Fraunces, JetBrains_Mono } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";

import { AppHeader } from "@/components/app-header";

import { cn } from "@/lib/utils";

import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
  axes: ["opsz"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Flowstate",
  description: "A local-first day tracker and Pomodoro focus app",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={cn(dmSans.variable, fraunces.variable, jetbrainsMono.variable)}
    >
      <body>
        <AppHeader />
        <main className="mx-auto max-w-[1160px] px-5 pb-20 pt-8 md:px-10">
          {children}
        </main>
        <Toaster />
      </body>
    </html>
  );
}
