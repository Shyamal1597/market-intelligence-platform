import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        base: "#0C0E14",
        surface: "#13151E",
        border: "#1E2235",
        amber: "#E8A020",
        teal: "#00C9A7",
        danger: "#E84040",
        primary: "#F0EDE8",
        muted: "#6B7280",
      },
      fontFamily: {
        display: ["var(--font-cormorant)", "Georgia", "serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
        sans: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "slide-in": "slideIn 0.4s ease-out",
        "flash": "flash 0.8s ease-out",
      },
      keyframes: {
        slideIn: {
          "0%": { transform: "translateY(-16px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        flash: {
          "0%": { backgroundColor: "rgba(232, 160, 32, 0.3)" },
          "100%": { backgroundColor: "transparent" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
