import type { Config } from "tailwindcss";

/**
 * Palette and typography tuned to match https://www.insectid.org/ (where
 * this dashboard is embedded). insectid.org uses:
 *   - Lato (light/regular/bold), Helvetica fallback
 *   - White surfaces with a very light gray panel tint
 *   - Strong blue accent #116dff for links / primary actions
 *   - Near-black body (#080808), mid-gray secondary (#5f6360)
 *   - No decorative ornaments
 *
 * We keep the existing semantic class names (forest/moss/bark/cream/ochre)
 * but remap their values so every chart and panel picks up the new theme
 * without per-component edits. The names are kept for legibility — what was
 * "forest" is now the brand blue, "cream" is the white/light-gray surface,
 * etc.
 */

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand blue (was "forest"). Anchored at 600 = #116dff.
        forest: {
          50: "#EEF4FF",
          100: "#D9E5FF",
          200: "#B3CBFF",
          300: "#7AA5FF",
          400: "#4783FA",
          500: "#2C7AFB",
          600: "#116dff",
          700: "#0A4FBE",
          800: "#0A3F95",
          900: "#0A2D6B",
        },
        // Mid-gray (was "moss"). Used for secondary text / labels.
        moss: {
          100: "#EEF1F2",
          200: "#D9DDDF",
          300: "#B7BDC0",
          400: "#8A9094",
          500: "#6F7478",
          600: "#5f6360",
          700: "#4A4F50",
          800: "#363A3B",
        },
        // Body text scale (was "bark").
        bark: {
          100: "#F2F2F2",
          200: "#D5D5D5",
          300: "#A5A5A5",
          400: "#6D6F6E",
          500: "#404342",
          600: "#1F2222",
          700: "#080808",
        },
        // Surfaces (was "cream"): white and very light gray tints.
        cream: {
          50: "#FFFFFF",
          100: "#F8F9FA",
          200: "#F1F3F5",
          300: "#E5E7EB",
        },
        // Secondary accent (was "ochre"). Repurpose to a bright cyan/teal
        // that complements the brand blue without screaming.
        ochre: {
          400: "#3FB6D8",
          500: "#1F95B8",
          600: "#0E7693",
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
        // Both font-sans and font-serif resolve to Lato so existing
        // `font-serif` classes on headings continue to render in the brand
        // typeface without needing component edits.
        sans: [
          "var(--font-lato)",
          "Lato",
          "Helvetica",
          "Arial",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        serif: [
          "var(--font-lato)",
          "Lato",
          "Helvetica",
          "Arial",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
      },
      backgroundImage: {
        // Plain white with a barely-perceptible top-down warm tint replaced
        // with a flat very-light-gray surface — matches insectid's clean
        // institutional feel.
        "field-paper":
          "linear-gradient(180deg, #FFFFFF 0%, #F8F9FA 100%)",
      },
      boxShadow: {
        // Slightly softer card shadow with a neutral cool cast.
        leaf: "0 1px 0 rgba(15, 23, 42, 0.04), 0 4px 16px -8px rgba(15, 23, 42, 0.10)",
      },
    },
  },
  plugins: [],
};

export default config;
