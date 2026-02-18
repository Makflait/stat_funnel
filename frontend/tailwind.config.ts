import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}", "./lib/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#09070f",
        panel: "#130f22",
        border: "#2b2343",
        primary: "#8f5cff",
        primarySoft: "#b79cff",
        text: "#ece9ff",
        muted: "#9f96c9",
        positive: "#21c67a",
        warning: "#ff9f43"
      },
      boxShadow: { glow: "0 0 40px rgba(143, 92, 255, 0.32)" },
      keyframes: {
        floatPulse: {
          "0%, 100%": { transform: "translateY(0px)", opacity: "0.5" },
          "50%": { transform: "translateY(-16px)", opacity: "0.85" }
        },
        fadeSlide: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" }
        }
      },
      animation: {
        floatPulse: "floatPulse 7s ease-in-out infinite",
        fadeSlide: "fadeSlide 400ms ease-out"
      }
    }
  },
  plugins: []
};

export default config;
