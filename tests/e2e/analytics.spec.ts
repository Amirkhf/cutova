import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { FIELDS_BY_TYPE, type EventType } from "../../src/core/analytics/schema.ts";

/**
 * Mesure d'utilisation anonyme : chaque envoi vers /api/event ne contient QUE les champs autorisés pour
 * son type, jamais d'octet d'image ni de nom de fichier ; aucun envoi si Do Not Track / GPC ; aucune
 * requête externe.
 */
const ROOT = path.resolve(import.meta.dirname, "../..");
test.setTimeout(300_000);

/**
 * Playwright n'expose pas le corps d'un sendBeacon (Blob) : on enveloppe navigator.sendBeacon dans la
 * page pour relire EXACTEMENT ce qui part, et on compte aussi les vraies requêtes réseau.
 */
async function captureEvents(page: Page) {
  const requests: string[] = [];
  const external: string[] = [];
  await page.addInitScript(() => {
    const original = navigator.sendBeacon.bind(navigator);
    (window as unknown as { __beacons: { url: string; body: string }[] }).__beacons = [];
    navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => {
      if (data instanceof Blob) void data.text().then((body) => (window as unknown as { __beacons: { url: string; body: string }[] }).__beacons.push({ url: String(url), body }));
      return original(url, data);
    };
  });
  page.on("request", (req) => {
    const url = new URL(req.url());
    // blob: / data: = ressources locales (ex. le fichier téléchargé), jamais réseau.
    if (url.protocol !== "blob:" && url.protocol !== "data:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") external.push(req.url());
    if (url.pathname === "/api/event") requests.push(req.method());
  });
  const raw = async () => page.evaluate(() => (window as unknown as { __beacons: { url: string; body: string }[] }).__beacons.map((b) => b.body));
  const events = async () => (await raw()).map((b) => JSON.parse(b) as Record<string, string>);
  return { requests, external, raw, events };
}

test("parcours : événements anonymes, champs autorisés seulement, aucune image envoyée", async ({ page }) => {
  const cap = await captureEvents(page);
  await page.goto("/");
  await page.setInputFiles('.upload-card input[type="file"]', path.join(ROOT, "tests/images/fur-12162.jpg"));
  await expect(page.locator(".result-panel")).toHaveAttribute("data-state", "done", { timeout: 280_000 });
  await page.getByRole("tab", { name: "Background" }).click();
  await page.getByRole("radio", { name: "Color" }).check();
  await page.getByRole("button", { name: "Download options" }).click();
  await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download", exact: true }).click()]);
  await expect.poll(async () => (await cap.events()).map((e) => e.type).sort()).toEqual(["cutout_done", "download", "page_view", "tool_used"]);
  const events = await cap.events();
  expect(cap.requests.length).toBe(4); // chaque événement est bien parti, en POST, vers la même origine

  for (const event of events) {
    const allowed = ["type", ...FIELDS_BY_TYPE[event.type as EventType]];
    expect(Object.keys(event).filter((k) => !allowed.includes(k)), JSON.stringify(event)).toEqual([]);
  }
  expect(events.find((e) => e.type === "page_view")).toEqual({ type: "page_view", page: "/", lang: "en" });
  expect(events.find((e) => e.type === "cutout_done")).toMatchObject({ engine: "wasm", model: "ormbg", size: "1-4mp" });
  expect(events.find((e) => e.type === "tool_used")).toEqual({ type: "tool_used", tool: "background", lang: "en" });
  // Aucun octet d'image, aucun nom de fichier : chaque envoi est minuscule et ne mentionne pas la photo.
  for (const body of await cap.raw()) {
    expect(body.length).toBeLessThan(200);
    expect(body).not.toContain("fur-12162");
    expect(body).not.toMatch(/data:|base64|blob:/);
  }
  expect(cap.external).toEqual([]);
});

for (const [name, script] of [
  ["Global Privacy Control", () => Object.defineProperty(Navigator.prototype, "globalPrivacyControl", { get: () => true })],
  ["Do Not Track", () => Object.defineProperty(Navigator.prototype, "doNotTrack", { get: () => "1" })],
] as const) {
  test(`${name} activé : aucun envoi`, async ({ page }) => {
    await page.addInitScript(script);
    const cap = await captureEvents(page);
    await page.goto("/");
    await page.waitForTimeout(300);
    expect(await cap.raw()).toEqual([]);
    await page.goto("/remove-bg-alternative/");
    await page.waitForTimeout(300);
    expect(await cap.raw()).toEqual([]);
    expect(cap.requests).toEqual([]);
  });
}

test("pages statiques : page_view avec le chemin et la langue, rien d'autre", async ({ page }) => {
  const cap = await captureEvents(page);
  await page.goto("/fr/tutoriels/creer-png-transparent/");
  await expect.poll(async () => (await cap.events()).length).toBe(1);
  expect((await cap.events())[0]).toEqual({ type: "page_view", page: "/fr/tutoriels/creer-png-transparent/", lang: "fr" });
});

test("_routes.json : seules les routes /api/* exécutent des fonctions", async () => {
  const routes = JSON.parse(await readFile(path.join(ROOT, "dist/_routes.json"), "utf8"));
  expect(routes).toEqual({ version: 1, include: ["/api/*"], exclude: [] });
});
