"use client";

import { useTheme, FONT_SIZE_PX, type FontSize, type ThemeMode, type CustomColors } from "@/lib/theme";
import { X, Sun, Moon, Palette, ALargeSmall, Check, RotateCcw, Monitor } from "lucide-react";

// -- Option definitions ---------------------------------------------------------
const FONT_OPTIONS: { key: FontSize; symbol: string; label: string }[] = [
  { key: "sm", symbol: "A", label: "Compact" },
  { key: "md", symbol: "A", label: "Default" },
  { key: "lg", symbol: "A", label: "Spacious" },
];

const THEME_OPTIONS: {
  key: ThemeMode;
  label: string;
  icon: React.FC<{ className?: string }>;
  previewColors: string[];
}[] = [
    {
      key: "dark",
      label: "Dark",
      icon: Moon,
      previewColors: ["#0C0E14", "#13151E", "#F5820D", "#00C9A7"],
    },
    {
      key: "light",
      label: "Light",
      icon: Sun,
      previewColors: ["#F4F1EB", "#FFFFFF", "#C95D08", "#007A5E"],
    },
    {
      key: "system",
      label: "System",
      icon: Monitor,
      previewColors: ["#8B9BB4", "#13151E", "#F5820D"],
    },
    {
      key: "custom",
      label: "Custom",
      icon: Palette,
      previewColors: [],   // filled dynamically from custom state
    },
  ];

const CUSTOM_FIELDS: { key: keyof CustomColors; label: string; hint: string }[] = [
  { key: "accent", label: "Accent", hint: "Actions / highlights" },
  { key: "positive", label: "Positive", hint: "Gains / up indicators" },
  { key: "danger", label: "Danger", hint: "Losses / down indicators" },
  { key: "background", label: "Background", hint: "Page base colour" },
];

// -- Component -----------------------------------------------------------------
export function SettingsPanel() {
  const {
    settingsOpen, setSettingsOpen,
    mode, setMode,
    fontSize, setFontSize,
    custom, setCustomColors,
  } = useTheme();

  return (
    <>
      {/* Backdrop */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
          onClick={() => setSettingsOpen(false)}
        />
      )}

      {/* Slide-out panel */}
      <aside
        className={[
          "fixed top-0 right-0 z-50 h-full w-[280px] flex flex-col",
          "transition-transform duration-300 ease-in-out",
          "border-l border-[var(--color-border)] shadow-[−24px_0_80px_rgba(0,0,0,0.7)]",
          settingsOpen ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
        style={{ backgroundColor: "var(--color-surface)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0 border-b"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div className="flex items-center gap-2">
            <ALargeSmall className="w-3.5 h-3.5 opacity-60" style={{ color: "var(--color-amber)" }} />
            <span
              className="font-mono text-[10px] tracking-[0.2em] uppercase"
              style={{ color: "var(--color-amber)", opacity: 0.7 }}
            >
              Display Settings
            </span>
          </div>
          <button
            onClick={() => setSettingsOpen(false)}
            className="w-7 h-7 flex items-center justify-center rounded-md transition-colors"
            style={{ color: "var(--color-muted)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "var(--color-primary)";
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "var(--color-muted)";
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-8">

          {/* -- Font Size --------------------------------------- */}
          <section>
            <p
              className="font-mono text-[10px] tracking-widest uppercase mb-3"
              style={{ color: "var(--color-amber)", opacity: 0.6 }}
            >
              Font Size
            </p>
            <div className="grid grid-cols-3 gap-2">
              {FONT_OPTIONS.map((opt, i) => {
                const active = fontSize === opt.key;
                // Scale the preview "A" proportionally
                const sizes = ["11px", "14px", "17px"];
                return (
                  <button
                    key={opt.key}
                    onClick={() => setFontSize(opt.key)}
                    className="relative flex flex-col items-center gap-2 py-3.5 rounded-lg border transition-all duration-150"
                    style={{
                      background: active ? "rgba(245,130,13,0.12)" : "transparent",
                      borderColor: active ? "rgba(245,130,13,0.35)" : "var(--color-border)",
                      color: active ? "var(--color-amber)" : "var(--color-muted)",
                    }}
                  >
                    {active && (
                      <span className="absolute top-1.5 right-1.5">
                        <Check className="w-2.5 h-2.5" style={{ color: "var(--color-amber)" }} />
                      </span>
                    )}
                    <span
                      className="font-sans font-bold leading-none"
                      style={{ fontSize: sizes[i] }}
                    >
                      A
                    </span>
                    <span className="font-mono text-[9px] tracking-wide opacity-75">
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Divider */}
          <div className="h-px" style={{ background: "var(--color-border)" }} />

          {/* -- Theme ------------------------------------------- */}
          <section>
            <p
              className="font-mono text-[10px] tracking-widest uppercase mb-3"
              style={{ color: "var(--color-amber)", opacity: 0.6 }}
            >
              Colour Theme
            </p>
            <div className="grid grid-cols-3 gap-2">
              {THEME_OPTIONS.map(({ key, label, icon: Icon, previewColors }) => {
                const active = mode === key;
                const swatches = key === "custom"
                  ? [custom.background, custom.accent, custom.positive, custom.danger]
                  : previewColors;
                return (
                  <button
                    key={key}
                    onClick={() => setMode(key)}
                    className="flex flex-col items-center gap-2.5 py-4 rounded-lg border transition-all duration-150"
                    style={{
                      background: active ? "rgba(245,130,13,0.12)" : "transparent",
                      borderColor: active ? "rgba(245,130,13,0.35)" : "var(--color-border)",
                      color: active ? "var(--color-amber)" : "var(--color-muted)",
                    }}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="font-mono text-[9px] tracking-wide">{label}</span>
                    {/* Mini palette preview */}
                    <div className="flex gap-0.5">
                      {swatches.map((c, ci) => (
                        <span
                          key={ci}
                          className="w-3 h-1.5 rounded-full"
                          style={{
                            background: c,
                            outline: "1px solid rgba(255,255,255,0.08)",
                            outlineOffset: "0px",
                          }}
                        />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* -- Custom Colours (only when mode === "custom") ----- */}
          {mode === "custom" && (
            <>
              <div className="h-px" style={{ background: "var(--color-border)" }} />
              <section>
                <p
                  className="font-mono text-[10px] tracking-widest uppercase mb-4"
                  style={{ color: "var(--color-amber)", opacity: 0.6 }}
                >
                  Custom Colours
                </p>
                <div className="space-y-4">
                  {CUSTOM_FIELDS.map(({ key, label, hint }) => (
                    <div key={key} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p
                          className="font-sans text-sm font-medium leading-tight"
                          style={{ color: "var(--color-primary)" }}
                        >
                          {label}
                        </p>
                        <p
                          className="font-mono text-[10px] mt-0.5 truncate"
                          style={{ color: "var(--color-muted)" }}
                        >
                          {hint}
                        </p>
                      </div>
                      {/* Colour swatch + native picker */}
                      <label className="relative shrink-0 cursor-pointer group">
                        <div
                          className="w-10 h-10 rounded-lg border-2 transition-all duration-150 shadow-md"
                          style={{
                            background: custom[key],
                            borderColor: "var(--color-border-strong)",
                          }}
                        />
                        {/* Hex label below swatch */}
                        <span
                          className="block text-center font-mono text-[8px] mt-1 tracking-wide"
                          style={{ color: "var(--color-muted)" }}
                        >
                          {custom[key].toUpperCase()}
                        </span>
                        <input
                          type="color"
                          value={custom[key]}
                          onChange={(e) => setCustomColors({ [key]: e.target.value })}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          title={`Pick ${label} colour`}
                        />
                      </label>
                    </div>
                  ))}
                </div>

                {/* Reset to dark defaults */}
                <button
                  onClick={() => setCustomColors({
                    accent: "#F5820D",
                    positive: "#00C9A7",
                    danger: "#E84040",
                    background: "#0C0E14",
                  })}
                  className="mt-6 w-full flex items-center justify-center gap-2 py-2 rounded-lg border text-xs font-mono transition-all duration-150"
                  style={{
                    borderColor: "var(--color-border)",
                    color: "var(--color-muted)",
                  }}
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset to defaults
                </button>
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-3 border-t shrink-0"
          style={{ borderColor: "var(--color-border)" }}
        >
          <p
            className="font-mono text-[9px] text-center tracking-wide"
            style={{ color: "var(--color-muted)", opacity: 0.5 }}
          >
            Preferences saved to browser · no account required
          </p>
        </div>
      </aside>
    </>
  );
}
