import type { Metadata } from "next";
import "./globals.css";
import { ClientProviders } from "@/components/layout/ClientProviders";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";

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
      <head>
        {/* Google Fonts loaded via <link> to avoid Turbopack/PostCSS Windows NUL device bug */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=JetBrains+Mono:wght@400;500;600&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-base text-primary antialiased">
        {/* ClientProviders: ThemeProvider + SettingsPanel overlay */}
        <ClientProviders>
          <Sidebar />
          {/* Main area: offset by sidebar width (64px collapsed) */}
          <div className="ml-16 flex flex-col min-h-screen">
            <TopBar />
            <main className="flex-1 overflow-auto">
              {children}
            </main>
          </div>
        </ClientProviders>
      </body>
    </html>
  );
}
