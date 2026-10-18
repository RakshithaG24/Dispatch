/** @type {import("tailwindcss").Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#f6f5f0",
        surface: "#ffffff",
        ink: "#1c1e21",
        muted: "#5d6269",
        line: "#dad8cf",
        accent: { DEFAULT: "#1f5c4a", dark: "#164538", tint: "#e4efe9" },
        danger: { DEFAULT: "#9f2d2d", tint: "#f6e4e2" },
        caution: { DEFAULT: "#7a5200", tint: "#f5ecd5" },
      },
      fontFamily: {
        sans: ["IBM Plex Sans", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "monospace"],
      },
      borderRadius: { DEFAULT: "4px", md: "6px" },
    },
  },
  plugins: [],
};
