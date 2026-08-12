// @ts-check
import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default defineConfig(
  { ignores: ["dist/**", "research/**"] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // Plain-JS browser-automation harness, outside the TS project graph. It runs
    // under Node but embeds page.evaluate callbacks that execute in the browser,
    // so both worlds' globals are in scope.
    files: ["scripts/**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        setTimeout: "readonly",
        URL: "readonly",
        window: "readonly",
        document: "readonly",
        Image: "readonly",
        HTMLCanvasElement: "readonly",
        fetch: "readonly",
        performance: "readonly",
        structuredClone: "readonly",
        requestAnimationFrame: "readonly",
        OfflineAudioContext: "readonly",
      },
    },
  },
  prettier,
);
