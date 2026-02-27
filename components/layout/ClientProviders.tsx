"use client";

import { ReactNode } from "react";
import { ThemeProvider } from "@/lib/theme";
import { SettingsPanel } from "@/components/layout/SettingsPanel";

/**
 * Thin client boundary wrapper for the root layout.
 * layout.tsx is a server component, so ThemeProvider (client) lives here.
 * SettingsPanel is rendered at root level so it overlays everything.
 */
export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      {children}
      <SettingsPanel />
    </ThemeProvider>
  );
}
