import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}", "./lib/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#07050e",
        panel: "#0f0c1d",
        border: "#241d3f",
        borderLight: "#3d3060",
        primary: "#7c3aed",
        primaryBright: "#8b5cf6",
        primarySoft: "#a78bfa",
        primaryGlow: "#c4b5fd",
        accent: "#06b6d4",
        accentSoft: "#67e8f9",
        success: "#10b981",
        successSoft: "#34d399",
        warning: "#f59e0b",
        warningSoft: "#fbbf24",
        danger: "#ef4444",
        dangerSoft: "#f87171",
        text: "#f1eeff",
        textSoft: "#c4b5fd",
        muted: "#8b82c4",
        mutedDark: "#4a4378",
        positive: "#10b981",
      },
      boxShadow: {
        glow: "0 0 40px rgba(124, 58, 237, 0.38)",
        glowSm: "0 0 20px rgba(124, 58, 237, 0.22)",
        glowLg: "0 0 80px rgba(124, 58, 237, 0.48)",
        glowAccent: "0 0 32px rgba(6, 182, 212, 0.3)",
        glowSuccess: "0 0 32px rgba(16, 185, 129, 0.3)",
        card: "0 4px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)",
      },
      keyframes: {
        floatPulse: {
          "0%, 100%": { transform: "translateY(0px) scale(1)", opacity: "0.4" },
          "50%": { transform: "translateY(-20px) scale(1.05)", opacity: "0.7" },
        },
        floatPulseAlt: {
          "0%, 100%": { transform: "translateY(-8px) scale(1)", opacity: "0.28" },
          "50%": { transform: "translateY(-32px) scale(1.08)", opacity: "0.6" },
        },
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
        funnelIn: {
          "0%": { transform: "scaleX(0.4) translateY(6px)", opacity: "0" },
          "100%": { transform: "scaleX(1) translateY(0)", opacity: "1" },
        },
      },
      animation: {
        floatPulse: "floatPulse 8s ease-in-out infinite",
        floatPulseAlt: "floatPulseAlt 11s ease-in-out infinite",
        floatPulseSlow: "floatPulse 14s ease-in-out infinite",
        fadeSlide: "fadeSlide 500ms ease-out forwards",
        scaleIn: "scaleIn 400ms ease-out forwards",
        shimmer: "shimmer 2s linear infinite",
        pulseGlow: "pulseGlow 2.5s ease-in-out infinite",
        slideDown: "slideDown 300ms ease-out forwards",
        funnelIn: "funnelIn 700ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
      },
    },
  },
  plugins: [],
};

export default config;
