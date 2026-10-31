import { defineConfig, devices } from "@playwright/test";

/**
 * Chromium alternatif (optionnel) : `PLAYWRIGHT_CHROMIUM_PATH=/chemin/vers/chrome`. Sert quand le
 * navigateur de la version figée de Playwright ne peut pas être téléchargé (ex. bac à sable sans
 * accès à cdn.playwright.dev). Sans la variable : navigateur standard de Playwright.
 */
export const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "dot",
  use: {
    baseURL: "http://localhost:4173",
  },
  webServer: {
    command: "npm run build && npm run preview -- --port 4173",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: { executablePath: chromiumExecutablePath } },
    },
  ],
});
