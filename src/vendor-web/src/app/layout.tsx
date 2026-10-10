import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/shell/app-shell";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  axes: [],
});

export const metadata: Metadata = {
  title: "Reditoe Vendor",
  description: "Run your restaurant — orders, menu, payments and reviews.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full`} suppressHydrationWarning>
      <body className="h-full antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
          <Toaster position="top-right" />
        </Providers>
      </body>
    </html>
  );
}
