"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";

// ── Types ──────────────────────────────────────────────────────────────────────
export type FontSize = "sm" | "md" | "lg";
export type ThemeMode = "dark" | "light" | "system" | "custom";

export interface CustomColors {
  accent: string;   // amber-equivalent   — action / highlight
  positive: string;   // teal-equivalent    — gains / up
  danger: string;   // red-equivalent     — losses / down
  background: string;   // base bg colour
}

interface ThemeState {
  mode: ThemeMode;
  fontSize: FontSize;
  custom: CustomColors;
  settingsOpen: boolean;
}

interface ThemeContextValue {
  mode: ThemeMode;
  fontSize: FontSize;
  custom: CustomColors;
  settingsOpen: boolean;
  setMode: (m: ThemeMode) => void;
  setFontSize: (s: FontSize) => void;
  setCustomColors: (c: Partial<CustomColors>) => void;
  setSettingsOpen: (v: boolean) => void;
}

// ── Defaults ───────────────────────────────────────────────────────────────────
const DEFAULT_CUSTOM: CustomColors = {
  accent: "#F5820D",
  positive: "#00C9A7",
  danger: "#E84040",
  background: "#0C0E14",
};

const DEFAULTS: ThemeState = {
  mode: "dark",
  fontSize: "md",
  custom: DEFAULT_CUSTOM,
  settingsOpen: false,
};

// ── Font-size map (root px) ────────────────────────────────────────────────────
export const FONT_SIZE_PX: Record<FontSize, string> = {
  sm: "13px",
  md: "15px",
  lg: "17px",
};

// ── CSS variable token maps ────────────────────────────────────────────────────
export const DARK_TOKENS: Record<string, string> = {
  "--color-base": "#0C0E14",
  "--color-surface": "#13151E",
  "--color-surface-raised": "#161A28",
  "--color-border": "#1E2235",
  "--color-border-strong": "#272B40",
  "--color-primary": "#F0EDE8",
  "--color-muted": "#8890A4",
  "--color-amber": "#F5820D",
  "--color-teal": "#00C9A7",
  "--color-danger": "#E84040",
};

export const LIGHT_TOKENS: Record<string, string> = {
  "--color-base": "#F4F1EB",
  "--color-surface": "#FFFFFF",
  "--color-surface-raised": "#FAFAF7",
  "--color-border": "#E2DDD6",
  "--color-border-strong": "#CCC6BA",
  "--color-primary": "#1C1814",
  "--color-muted": "#6B6459",
  "--color-amber": "#C95D08",
  "--color-teal": "#007A5E",
  "--color-danger": "#B91C1C",
};

// ── Apply theme to DOM ─────────────────────────────────────────────────────────
function applyTheme(state: ThemeState) {
  const html = document.documentElement;

  // Root font size
  html.style.fontSize = FONT_SIZE_PX[state.fontSize];

  // Data attributes for CSS hooks
  html.setAttribute("data-theme", state.mode);
  html.setAttribute("data-font-size", state.fontSize);

  // Resolve token set
  let tokens: Record<string, string>;
  let resolvedMode = state.mode;

  if (state.mode === "system") {
    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    resolvedMode = isDark ? "dark" : "light";
    html.setAttribute("data-theme", resolvedMode); // pass down actual resolved mode for CSS
  }

  if (resolvedMode === "light") {
    tokens = LIGHT_TOKENS;
  } else if (state.mode === "custom") {
    tokens = {
      ...DARK_TOKENS,
      "--color-amber": state.custom.accent,
      "--color-teal": state.custom.positive,
      "--color-danger": state.custom.danger,
      "--color-base": state.custom.background,
    };
  } else {
    tokens = DARK_TOKENS;
  }

  Object.entries(tokens).forEach(([k, v]) => html.style.setProperty(k, v));
}

// ── Persistence ────────────────────────────────────────────────────────────────
const STORAGE_KEY = "mip-theme-v1";

type Persisted = Pick<ThemeState, "mode" | "fontSize" | "custom">;

function loadStored(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw) as Partial<Persisted>;
    return {
      mode: p.mode ?? DEFAULTS.mode,
      fontSize: p.fontSize ?? DEFAULTS.fontSize,
      custom: { ...DEFAULTS.custom, ...(p.custom ?? {}) },
    };
  } catch {
    return DEFAULTS;
  }
}

function saveStored(s: Persisted) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* noop */ }
}

// ── Provider ───────────────────────────────────────────────────────────────────
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ThemeState>(DEFAULTS);

  // Hydrate from localStorage on mount
  useEffect(() => {
    const stored = loadStored();
    const full: ThemeState = { ...stored, settingsOpen: false };
    setState(full);
    applyTheme(full);

    // Watch for system mode changes
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      setState((s) => {
        if (s.mode === "system") applyTheme(s);
        return s;
      });
    };
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  function patch(partial: Partial<Persisted>) {
    setState((prev) => {
      const next: ThemeState = { ...prev, ...partial };
      saveStored({ mode: next.mode, fontSize: next.fontSize, custom: next.custom });
      applyTheme(next);
      return next;
    });
  }

  return (
    <ThemeContext.Provider
      value={{
        mode: state.mode,
        fontSize: state.fontSize,
        custom: state.custom,
        settingsOpen: state.settingsOpen,
        setMode: (mode) => patch({ mode }),
        setFontSize: (fontSize) => patch({ fontSize }),
        setCustomColors: (c) => patch({ custom: { ...state.custom, ...c } }),
        setSettingsOpen: (v) =>
          setState((prev) => ({ ...prev, settingsOpen: v })),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
