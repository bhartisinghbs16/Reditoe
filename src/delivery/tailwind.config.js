/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Reditoe red — sampled from the delivery-partner reference screens.
        // It carries the brand and the chrome: auth CTAs, the Scan button in
        // the tab bar, the active tab, "N mins ago", Reject.
        brand: {
          50: "#fef0f0",
          100: "#fddcdc",
          200: "#fbbcbc",
          300: "#f78d8d",
          400: "#f25050",
          500: "#ee2027",
          600: "#e10b0f",
          700: "#be080c",
          900: "#7c0508",
        },
        // Green is the reference's primary — every earnings banner, every
        // Accept, the Online pill, the Verified chip and all money figures.
        green: {
          50: "#e9f7ef",
          100: "#cfeedd",
          200: "#a7dfc0",
          300: "#6ec996",
          400: "#33ad6d",
          500: "#16a34a",
          600: "#0f8a3c",
          700: "#0b7a33",
          800: "#086128",
          900: "#054d1f",
        },
        ink: {
          DEFAULT: "#0f172a",
          soft: "#334155",
          muted: "#64748b",
          faint: "#94a3b8",
        },
        surface: {
          DEFAULT: "#ffffff",
          sunken: "#f4f6f8",
          raised: "#fafbfc",
        },
        line: { DEFAULT: "#e8ebf0", strong: "#d8dee6" },
        ok: { DEFAULT: "#16a34a", soft: "#e6f6ec", ink: "#0b7a33" },
        warn: { DEFAULT: "#f59e0b", soft: "#fff3e0", ink: "#b45309" },
        bad: { DEFAULT: "#e8322a", soft: "#feecec", ink: "#b91c1c" },
        info: { DEFAULT: "#2563eb", soft: "#e8f0fe", ink: "#1d4ed8" },
        violet: { DEFAULT: "#7c3aed", soft: "#f1ecfe", ink: "#5b21b6" },
        orange: { DEFAULT: "#f97316", soft: "#fff1e6", ink: "#c2410c" },
      },
      borderRadius: {
        card: "14px",
        tile: "12px",
        chip: "8px",
        pill: "999px",
      },
      fontSize: {
        micro: ["11px", "14px"],
        tiny: ["12px", "16px"],
      },
    },
  },
  plugins: [],
};
