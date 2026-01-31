// eslint.config.js (ESLint v9 flat config)
import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";

export default [
  js.configs.recommended,

  {
    files: ["**/*.{js,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module"
    },
    plugins: {
      import: importPlugin
    },
    rules: {
      // Catches duplicate function declarations in the same scope/file
      "no-redeclare": "error",

      // Extra hygiene (optional)
      "no-shadow": "warn",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }]
    }
  }
];
