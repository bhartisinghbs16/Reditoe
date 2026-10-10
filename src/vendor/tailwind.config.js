/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // Reditoe red — sampled from the reference screens (#E10B0F on the
        // primary CTAs, #E62224 on the wordmark and link text).
        brand: {
          50: "#fff1f1",
          100: "#ffe1e1",
          200: "#ffc7c8",
          300: "#ff9b9d",
          400: "#f9585c",
          500: "#ee2126",
          600: "#e10b0f",
          700: "#be080c",
          900: "#7c0508",
        },
        // The second family the reference uses for Payments, Offers, Pickup
        // and Settings: #460DDC buttons over a #1D0A76 → #2B1585 header.
        indigo: {
          50: "#f3effe",
          100: "#e7e0fd",
          200: "#cfc2fb",
          300: "#a78bf8",
          400: "#7a4cf0",
          500: "#5a22e6",
          600: "#460ddc",
          700: "#3708b0",
          800: "#2b1585",
          900: "#1d0a76",
        },
        ink: {
          DEFAULT: "#111827",
          soft: "#374151",
          muted: "#6b7280",
          faint: "#9ca3af",
        },
        surface: {
          DEFAULT: "#ffffff",
          sunken: "#f6f7f9",
          raised: "#fbfbfd",
        },
        line: { DEFAULT: "#ecedf2", strong: "#dfe3e8" },
        ok: { DEFAULT: "#16a34a", soft: "#e7f7ee", ink: "#0f7a38" },
        warn: { DEFAULT: "#ea8c00", soft: "#fff3e2", ink: "#b45309" },
        bad: { DEFAULT: "#e10b0f", soft: "#fdecec", ink: "#b91c1c" },
        info: { DEFAULT: "#2563eb", soft: "#e8f1fe", ink: "#1d4ed8" },
        violet: { DEFAULT: "#6d28d9", soft: "#f1ecfe", ink: "#5b21b6" },
        veg: "#16a34a",
        nonveg: "#dc2626",
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
