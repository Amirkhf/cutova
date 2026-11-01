import { defineConfig, devices } from "@playwright/test";

/**
 * Chromium alternatif (optionnel) : `PLAYWRIGHT_CHROMIUM_PATH=/chemin/vers/chrome`. Sert quand le
 * navigateur de la version figée de Playwright ne peut pas être téléchargé (ex. bac à sable sans
 * accès à cdn.playwright.dev). Sans la variable : navigateur standard de Playwright.
 */
export const chromiumExecutablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

const qa = (name: string, use: Record<string, unknown>) => ({
  name: `qa-${name}`,
  testMatch: /qa\.spec\.ts/,
  use: { ...use, launchOptions: { executablePath: chromiumExecutablePath } },
});

/**
 * Projets de recette. Firefox et WebKit s'ajoutent avec `QA_ALL_BROWSERS=1` (navigateurs installés
 * par `npx playwright install firefox webkit` ; impossible dans le bac à sable de développement, où
 * cdn.playwright.dev est bloqué — voir docs/QA.md).
 */
const QA_PROJECTS = [
  qa("desktop-light", { ...devices["Desktop Chrome"], colorScheme: "light" }),
  qa("desktop-dark", { ...devices["Desktop Chrome"], colorScheme: "dark" }),
  qa("iphone", { ...devices["iPhone 13"], browserName: "chromium", defaultBrowserType: "chromium" }),
  qa("android-360", { viewport: { width: 360, height: 780 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: devices["Pixel 5"].userAgent }),
  ...(process.env.QA_ALL_BROWSERS
    ? [
        { name: "qa-firefox", testMatch: /qa\.spec\.ts/, use: { ...devices["Desktop Firefox"] } },
        { name: "qa-webkit", testMatch: /qa\.spec\.ts/, use: { ...devices["Desktop Safari"] } },
      ]
    : []),
];

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  reporter: "dot",
  use: {
    baseURL: "http://localhost:4173",
  },
  webServer: [
    {
      command: "npm run build && npm run preview -- --port 4173",
      url: "http://localhost:4173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // Serveur de dev (tests/e2e/dev-server.spec.ts : rendu identique au build, CSP de dev).
      command: "npx vite --port 5174 --strictPort",
      url: "http://localhost:5174",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
  projects: [
    // Tests fonctionnels (Chromium ordinateur).
    {
      name: "chromium",
      testIgnore: /qa\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], launchOptions: { executablePath: chromiumExecutablePath } },
    },
    // Recette (tests/e2e/qa.spec.ts) : ordinateur clair/sombre, iPhone et Android 360 px émulés.
    ...QA_PROJECTS,
  ],});
