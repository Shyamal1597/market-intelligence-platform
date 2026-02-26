import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { TickerStrip } from "@/components/layout/TickerStrip";

export const metadata: Metadata = {
  title: "Sunidhi Research Intelligence",
  description: "Internal research platform for Sunidhi Capital",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-base text-primary antialiased">
        <Sidebar />
        {/* Main area: offset by sidebar width (64px collapsed) */}
        <div className="ml-16 flex flex-col min-h-screen">
          <TopBar />
          <TickerStrip />
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
