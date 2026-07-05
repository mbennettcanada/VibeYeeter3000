import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { getCurrentUser } from "@/lib/user";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "VibeYeeter3000",
  description: "Internal PaaS control plane",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const user = getCurrentUser();

  return (
    <html lang="en">
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <Sidebar user={user} />
        <div className="min-h-screen bg-slate-50 pt-14 md:pl-60 md:pt-0">
          <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 md:px-8 md:py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
