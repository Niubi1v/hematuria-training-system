import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        clinic: {
          ink: "#17202a",
          muted: "#59636f",
          blue: "#1d6f8f",
          teal: "#11806a",
          green: "#2f7d59",
          line: "#d9e2e8",
          paper: "#f7fafb"
        }
      },
      boxShadow: {
        soft: "0 14px 40px rgba(23, 32, 42, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
