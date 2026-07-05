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
        <div className="min-h-screen bg-slate-50 pl-60">
          <main className="mx-auto max-w-7xl px-8 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
