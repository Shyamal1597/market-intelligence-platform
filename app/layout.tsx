import type { Metadata } from "next";
import "./globals.css";
import { ClientProviders } from "@/components/layout/ClientProviders";
import { OmniCore } from "@/components/layout/OmniCore";
import { InteractiveBackground } from "@/components/layout/InteractiveBackground";

export const metadata: Metadata = {
  title: "Project NEBULA | Research Intelligence",
  description: "Internal research intelligence platform for equity research teams",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300..700&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="text-primary antialiased selection:bg-teal selection:text-base">
        <InteractiveBackground />
        <ClientProviders>
          <div className="flex flex-col min-h-screen relative pb-24 z-10">
            {/* Global Top Header */}
            <header className="w-full max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-4 flex items-center justify-between">
              <div className="flex items-center gap-4 animate-[slideIn_0.4s_ease-out]">
                <div className="bg-white/90 p-2 rounded-xl backdrop-blur-md border border-white/20 shadow-lg shadow-amber/10">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/images/logo.png"
                    alt="Research"
                    className="h-8 w-auto object-contain"
                  />
                </div>
                <div className="flex flex-col">
                  <span className="font-display font-bold text-xl tracking-tight text-primary">
                    Project <span className="text-teal">NEBULA</span>
                  </span>
                  <span className="text-muted text-[10px] tracking-[0.2em] uppercase font-mono">
                    Neural Data Interface
                  </span>
                </div>
              </div>
            </header>

            <main className="flex-1 w-full max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
              {children}
            </main>
            <OmniCore />
          </div>
        </ClientProviders>
      </body>
    </html>
  );
}
