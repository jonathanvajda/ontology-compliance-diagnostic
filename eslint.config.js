// eslint.config.js (ESLint v9 flat config)
import js from "@eslint/js";
import importPlugin from "eslint-plugin-import";

export default [
  js.configs.recommended,
  {
    ignores: [
      "docs/app/comunica-browser.js",
      "docs/app/n3.min.js",
      "docs/app/rdflib.min.js"
    ]
  },

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
  },
  {
    files: ["docs/app/**/*.js"],
    languageOptions: {
      globals: {
        Blob: "readonly",
        Document: "readonly",
        Element: "readonly",
        File: "readonly",
        HTMLButtonElement: "readonly",
        HTMLElement: "readonly",
        HTMLInputElement: "readonly",
        HTMLSelectElement: "readonly",
        HTMLTableRowElement: "readonly",
        URL: "readonly",
        console: "readonly",
        document: "readonly",
        localStorage: "readonly",
        window: "readonly"
      }
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
