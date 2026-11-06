import { defineConfig, devices } from "@playwright/test";
import { chromiumExecutablePath } from "./playwright.config.ts";

/**
 * Fumée contre un déploiement déjà en ligne (Cloudflare Pages + R2) : pas de `webServer`, le site
 * existe déjà à `DEPLOYED_URL`. Lancer : DEPLOYED_URL=https://cutova.pages.dev npx playwright test
 * -c playwright.deployed.config.ts
 */
export default defineConfig({
  testDir: "./tests/e2e-deployed",
  reporter: "dot",
  timeout: 180_000,
  use: { baseURL: process.env.DEPLOYED_URL || "https://cutova.pages.dev" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath: chromiumExecutablePath } } }],
});
