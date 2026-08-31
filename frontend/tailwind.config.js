/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        casevault: {
          sidebar: "#152028",
          sidebarHover: "#1D2B35",
          sidebarActive: "rgba(255, 255, 255, 0.1)",
          sidebarBorder: "#212E38",
          bg: "#FAF8F5",
          card: "#FFFFFF",
          border: "#E7E3DA",
          muted: "#889096",
          amber: {
            DEFAULT: "#EAA037",
            hover: "#DE942A",
            light: "#FEF7EA",
            border: "#FCD34D",
          },
        },
        // Classification level badge colors
        classification: {
          unclassified: { bg: "#dcfce7", text: "#166534", border: "#86efac" },
          restricted:   { bg: "#fef9c3", text: "#854d0e", border: "#fde047" },
          confidential: { bg: "#ffedd5", text: "#9a3412", border: "#fdba74" },
          secret:       { bg: "#fee2e2", text: "#991b1b", border: "#fca5a5" },
        },
        // Audit result colors
        audit: {
          success: "#16a34a",
          failure: "#ca8a04",
          denied:  "#dc2626",
          error:   "#dc2626",
        },
        // Custody action accent
        custody: {
          verified:   "#16a34a",
          mismatch:   "#dc2626",
          unverified: "#9ca3af",
        },
      },
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "'Inter'", "system-ui", "-apple-system", "sans-serif"],
        serif: ["'Newsreader'", "'Instrument Serif'", "Georgia", "serif"],
        mono: ["'JetBrains Mono'", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
