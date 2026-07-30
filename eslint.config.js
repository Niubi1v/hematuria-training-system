const { FlatCompat } = require("@eslint/eslintrc");

const compat = new FlatCompat({ baseDirectory: __dirname, resolvePluginsRelativeTo: __dirname });

module.exports = [
  {
    ignores: [
      ".next/**",
      ".desktop-cache/**",
      "desktop-runtime/**",
      "out/**",
      "node_modules/**",
      "src-tauri/gen/**",
      "src-tauri/resources/**",
      "src-tauri/target/**",
      "work/**",
      "outputs/**",
      "next-env.d.ts"
    ]
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@next/next/no-html-link-for-pages": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-explicit-any": "off"
    }
  }
];
