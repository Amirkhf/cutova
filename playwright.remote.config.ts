import { defineConfig, devices } from "@playwright/test";
import { chromiumExecutablePath } from "./playwright.config.ts";

/**
 * Mode "modèles sur stockage externe" (production : R2), simulé en local : le site est construit avec
 * VITE_MODEL_BASE_URL et servi sur :4175, le "faux R2" (scripts/model-mirror.mjs) sur une AUTRE
 * origine (127.0.0.1:4180) avec CORS. Vérifie CSP, COEP, CORS et la disposition des fichiers.
 * Lancer : npm run test:e2e:remote (reconstruit dist/ en mode externe ; relancer `npm run build` après).
 */
export const MIRROR = "http://127.0.0.1:4180";

export default defineConfig({
  testDir: "./tests/e2e-remote",
  reporter: "dot",
  use: { baseURL: "http://localhost:4175" },
  webServer: [
    { command: "node scripts/model-mirror.mjs serve --port 4180", port: 4180, reuseExistingServer: false, timeout: 30_000 },
    {
      // `env` (et non un préfixe de commande) : la CSP du serveur preview doit, elle aussi, autoriser MIRROR.
      command: "npm run build && npx vite preview --port 4175 --strictPort",
      env: { VITE_MODEL_BASE_URL: MIRROR },
      url: "http://localhost:4175",
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath: chromiumExecutablePath } } }],
});
