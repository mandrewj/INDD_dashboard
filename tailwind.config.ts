import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Botanical / nature palette — used for ambient UI surfaces.
        // Inspired by old field-guide plates: cream paper, ink, foliage,
        // bark, moss, lichen, and dried specimens.
        forest: {
          50: "#F2F6F1",
          100: "#DDE8D9",
          200: "#B7CDB1",
          300: "#8AAE82",
          400: "#5F8E58",
          500: "#3F6F3A",
          600: "#2F5233",
          700: "#244126",
          800: "#1B331C",
          900: "#122212",
        },
        moss: {
          100: "#E5E9D2",
          200: "#C9D2A5",
          300: "#A7B47A",
          400: "#869256",
          500: "#6B7741",
          600: "#535D31",
          700: "#3F4724",
        },
        bark: {
          100: "#EFE7DC",
          200: "#D9C8B4",
          300: "#B89A7C",
          400: "#8E6E50",
          500: "#6B5237",
          600: "#4E3B27",
          700: "#34281B",
        },
        cream: {
          50: "#FBF8F1",
          100: "#F5EFE2",
          200: "#EBE2CE",
          300: "#DCCFB1",
        },
        ochre: {
          400: "#D9A441",
          500: "#B8842B",
          600: "#8E661F",
        },
        // Okabe-Ito (kept exactly for chart data encoding — colorblind-safe).
        ok: {
          black: "#000000",
          orange: "#E69F00",
          skyblue: "#56B4E9",
          green: "#009E73",
          yellow: "#F0E442",
          blue: "#0072B2",
          vermillion: "#D55E00",
          purple: "#CC79A7",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        serif: [
          "var(--font-fraunces)",
          "ui-serif",
          "Georgia",
          "Cambria",
          "Times New Roman",
          "serif",
        ],
      },
      backgroundImage: {
        // Subtle paper-like grain — the dashboard sits on a warm cream
        // surface with a hint of foxing.
        "field-paper":
          "radial-gradient(circle at 20% 10%, rgba(143,174,130,0.10), transparent 55%), radial-gradient(circle at 85% 85%, rgba(184,132,43,0.08), transparent 50%), linear-gradient(180deg, #FBF8F1 0%, #F5EFE2 100%)",
      },
      boxShadow: {
        leaf: "0 1px 0 rgba(36,65,38,0.06), 0 8px 24px -12px rgba(36,65,38,0.18)",
      },
    },
  },
  plugins: [],
};

export default config;
