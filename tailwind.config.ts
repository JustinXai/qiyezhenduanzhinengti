import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./src/report/presentation/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Noto Sans SC",
          "PingFang SC",
          "Microsoft YaHei",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
        mono: [
          "JetBrains Mono",
          "Fira Code",
          "Cascadia Code",
          "ui-monospace",
          "monospace",
        ],
      },
      colors: {
        brand: {
          50:  "#ecfdf5",
          100: "#d1fae5",
          200: "#a7f3d0",
          300: "#6ee7b7",
          400: "#34d399",
          500: "#10b981",
          600: "#059669",
          700: "#047857",
          800: "#065f46",
          900: "#064e3b",
        },
        surface: {
          DEFAULT: "#ffffff",
          alt:    "#f5f5f5",
          raised: "#fafafa",
        },
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "1rem" }],
      },
      spacing: {
        18: "4.5rem",
        22: "5.5rem",
      },
      borderRadius: {
        DEFAULT: "0.375rem",
      },
      boxShadow: {
        card:   "0 0 0 1px #e5e5e5, 0 2px 8px -1px rgb(0 0 0 / 0.05)",
        input:  "0 1px 2px 0 rgb(0 0 0 / 0.05) inset",
        raised: "0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)",
      },
      transitionDuration: {
        fast: "150ms",
        DEFAULT: "200ms",
      },
      transitionTimingFunction: {
        "ease-out-expo": "cubic-bezier(0.19, 1, 0.22, 1)",
      },
      letterSpacing: {
        tighter: "-0.025em",
      },
      maxWidth: {
        report: "42rem",
      },
      animation: {
        "fade-in":    "fadeIn 200ms ease-out",
        "slide-up":  "slideUp 250ms cubic-bezier(0.19, 1, 0.22, 1)",
        "pulse-subtle": "pulseSubtle 2s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%":   { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseSubtle: {
          "0%, 100%": { opacity: "1" },
          "50%":      { opacity: "0.85" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
