import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import path from "node:path";

const DEV = "http://localhost:5174";
const ROOT = path.resolve(import.meta.dirname, "../..");
const SHOTS = path.join(ROOT, "docs/review");

test("dev : tableau de bord avec données de démo, périodes, accessibilité, captures", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${DEV}/stats/`);
  await expect(page.locator(".stats-demo")).toBeVisible();
  await expect(page.locator(".stats-card")).toHaveCount(5);
  await expect(page.locator(".stats-chart")).toHaveCount(2);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  const days7 = await page.locator(".stats-details").first().locator("tbody tr").count();
  expect(days7).toBe(7);

  await page.getByRole("button", { name: "30 jours" }).click();
  await expect(page.getByRole("button", { name: "30 jours" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".stats-details").first().locator("tbody tr")).toHaveCount(30);
  expect(page.url()).toContain("period=30");

  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
  await page.screenshot({ path: path.join(SHOTS, "stats-desktop-light.png"), fullPage: true });

  await page.emulateMedia({ colorScheme: "dark" });
  const axeDark = await new AxeBuilder({ page }).analyze();
  expect(axeDark.violations.map((v) => v.id)).toEqual([]);
  await page.screenshot({ path: path.join(SHOTS, "stats-desktop-dark.png"), fullPage: true });

  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "Aujourd'hui" }).click();
  await expect(page.locator(".stats-details").first().locator("tbody tr")).toHaveCount(1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: path.join(SHOTS, "stats-mobile.png"), fullPage: true });
});

test("production (preview) : aucune donnée de démo, page noindex, hors sitemap et robots", async ({ page, request }) => {
  const api = await request.get("/api/stats?period=7");
  expect(api.headers()["x-cutova-demo"]).toBeUndefined();
  expect(await api.text()).not.toContain('"demo"');
  await page.goto("/stats/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator(".stats-status")).not.toBeEmpty();
  await expect(page.locator(".stats-card")).toHaveCount(0);
  const sitemap = await readFile(path.join(ROOT, "dist/sitemap.xml"), "utf8");
  expect(sitemap).not.toContain("/stats");
  const robots = await readFile(path.join(ROOT, "dist/robots.txt"), "utf8");
  expect(robots).toContain("Disallow: /stats/");
  const headers = await readFile(path.join(ROOT, "dist/_headers"), "utf8");
  expect(headers).toMatch(/\/stats\/\*\n\s+Cache-Control: no-store\n\s+X-Robots-Tag: noindex, nofollow/);
});
