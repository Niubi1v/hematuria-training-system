import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        clinic: {
          ink: "rgb(var(--color-ink) / <alpha-value>)",
          muted: "rgb(var(--color-muted) / <alpha-value>)",
          blue: "rgb(var(--color-primary) / <alpha-value>)",
          teal: "rgb(var(--color-accent) / <alpha-value>)",
          green: "rgb(var(--color-success) / <alpha-value>)",
          line: "rgb(var(--color-line) / <alpha-value>)",
          paper: "rgb(var(--color-page) / <alpha-value>)"
        }
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
        raised: "var(--shadow-raised)"
      },
      borderRadius: {
        clinic: "var(--radius-card)"
      }
    }
  },
  plugins: []
};

export default config;
