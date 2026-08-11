import { defineConfig } from "vitest/config";

// Served from https://vincent-p-essy.github.io/tropico2/ (a project page, not a
// user page), so every asset URL needs this prefix in production.
export default defineConfig({
  base: process.env.GITHUB_PAGES ? "/tropico2/" : "/",
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Several tests run game-years of simulation to prove the island is stable
    // over time; the default five seconds is not enough for that on purpose.
    testTimeout: 60_000,
  },
});
