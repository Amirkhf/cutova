// Captures de contrôle du styleguide (dev uniquement) — 360px/1280px x clair/sombre.
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "@playwright/test";

const OUT_DIR = fileURLToPath(new URL("./screenshots/", import.meta.url));

const viewports = [
  { label: "360", width: 360, height: 800 },
  { label: "1280", width: 1280, height: 900 },
];
const schemes = ["light", "dark"];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const server = await createServer({ server: { port: 0 } });
  await server.listen();
  const port = server.config.server.port;

  const browser = await chromium.launch();
  try {
    for (const viewport of viewports) {
      for (const scheme of schemes) {
        const page = await browser.newPage({
          viewport: { width: viewport.width, height: viewport.height },
          colorScheme: scheme,
        });
        await page.goto(`http://localhost:${port}/styleguide.html`, { waitUntil: "networkidle" });
        const file = `${OUT_DIR}styleguide-${viewport.label}-${scheme}.png`;
        await page.screenshot({ path: file, fullPage: true });
        await page.close();
        console.log(`OK ${file}`);
      }
    }

    // Focus clavier (Tab) forcé sur le bouton principal, 360px, clair/sombre.
    for (const scheme of schemes) {
      const page = await browser.newPage({
        viewport: { width: 360, height: 800 },
        colorScheme: scheme,
      });
      await page.goto(`http://localhost:${port}/styleguide.html`, { waitUntil: "networkidle" });
      await page.keyboard.press("Tab");
      const file = `${OUT_DIR}styleguide-360-${scheme}-focus-primary.png`;
      await page.screenshot({ path: file, fullPage: true });
      await page.close();
      console.log(`OK ${file}`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
