/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Sampled from the client's reference screens.
        brand: {
          50: "#fff1f2",
          100: "#ffe0e2",
          200: "#ffc7cb",
          300: "#ff9aa2",
          400: "#f8626f",
          500: "#ed3241",
          600: "#e8112d",
          700: "#c20d24",
          900: "#7d0917",
        },
        // Green carries veg, success, ADD and the Checkout button.
        leaf: {
          50: "#eefaf3",
          100: "#d6f2e2",
          400: "#34c97e",
          500: "#22a45d",
          600: "#0f8a45",
          700: "#0b7038",
          800: "#08602f",
        },
        sun: {
          50: "#fff8e6",
          100: "#fdf0cc",
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706",
          700: "#a75c07",
        },
        // Reditoe Plus is purple throughout the reference.
        plus: {
          50: "#f5f3ff",
          100: "#ede9fe",
          200: "#ddd6fe",
          400: "#a78bfa",
          500: "#8b5cf6",
          600: "#7c3aed",
          700: "#6d28d9",
        },
        sky: {
          50: "#eff5ff",
          100: "#dbe8fe",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
        },
        ink: {
          DEFAULT: "#1c1c1c",
          soft: "#4a4a4a",
          muted: "#6b7280",
          faint: "#9ca3af",
        },
        surface: {
          DEFAULT: "#ffffff",
          sunken: "#f7f7f8",
          warm: "#fff5f5",
        },
        line: { DEFAULT: "#ececec", strong: "#dcdcdc" },
        ok: { DEFAULT: "#0f8a45", soft: "#eefaf3", ink: "#0b7038" },
        warn: { DEFAULT: "#d97706", soft: "#fff8e6", ink: "#a75c07" },
        bad: { DEFAULT: "#e8112d", soft: "#fff1f2", ink: "#c20d24" },
        info: { DEFAULT: "#2563eb", soft: "#eff5ff", ink: "#1d4ed8" },
        veg: "#0f8a45",
        nonveg: "#e8112d",
      },
      borderRadius: {
        card: "14px",
        tile: "12px",
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
