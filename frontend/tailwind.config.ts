import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}", "./lib/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Deep dark slate with subtle teal tint — distinctive, not the usual purple
        bg: "#050d0d",
        panel: "#0a1515",
        border: "#0f2e2e",
        borderLight: "#1c4e4c",
        // Primary: electric teal
        primary: "#0d9488",
        primaryBright: "#14b8a6",
        primarySoft: "#2dd4bf",
        primaryGlow: "#99f6e4",
        // Accent: warm amber — contrasts well with teal
        accent: "#d97706",
        accentSoft: "#fbbf24",
        // Semantic
        success: "#22c55e",
        successSoft: "#4ade80",
        warning: "#f59e0b",
        warningSoft: "#fcd34d",
        danger: "#ef4444",
        dangerSoft: "#f87171",
        // Text
        text: "#edfcfa",
        textSoft: "#99f6e4",
        muted: "#5f9ea0",
        mutedDark: "#1e4a4a",
        positive: "#22c55e",
      },
      boxShadow: {
        glow: "0 0 40px rgba(13, 148, 136, 0.4)",
        glowSm: "0 0 18px rgba(13, 148, 136, 0.25)",
        glowLg: "0 0 80px rgba(13, 148, 136, 0.5)",
        glowAccent: "0 0 32px rgba(217, 119, 6, 0.3)",
        glowSuccess: "0 0 32px rgba(34, 197, 94, 0.3)",
        card: "0 4px 32px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.03)",
      },
      keyframes: {
        fadeSlide: {
          "0%": { transform: "translateY(14px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        scaleIn: {
          "0%": { transform: "scale(0.94)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-1000px 0" },
          "100%": { backgroundPosition: "1000px 0" },
        },
        pulseGlow: {
          "0%, 100%": { opacity: "0.5" },
          "50%": { opacity: "1" },
        },
        slideDown: {
          "0%": { transform: "translateY(-10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
      },
      animation: {
        fadeSlide: "fadeSlide 500ms ease-out forwards",
        scaleIn: "scaleIn 380ms ease-out forwards",
        shimmer: "shimmer 2s linear infinite",
        pulseGlow: "pulseGlow 2.5s ease-in-out infinite",
        slideDown: "slideDown 300ms ease-out forwards",
      },
    },
  },
  plugins: [],
};

export default config;
