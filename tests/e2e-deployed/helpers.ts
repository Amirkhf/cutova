import path from "node:path";
import type { Page, Request } from "@playwright/test";
import { expect } from "@playwright/test";

export function allowedHosts(baseURL: string): Set<string> {
  return new Set([new URL(baseURL).hostname, "models.cutova.app"]);
}

export function trackNetwork(page: Page, hosts: Set<string>) {
  const violations: string[] = [];
  page.on("request", (req: Request) => {
    const url = new URL(req.url());
    if (url.protocol === "blob:" || url.protocol === "data:") return; // objets locaux, jamais une requête réseau
    const hostname = url.hostname;
    if (!hosts.has(hostname)) {
      violations.push(`hôte externe: ${hostname} (${req.url()})`);
      return;
    }
    const body = req.postDataBuffer();
    if (body && body.length > 1024) violations.push(`corps de requête volumineux (${body.length} octets): ${req.url()}`);
  });
  return violations;
}

export async function runCutout(page: Page, image: string) {
  await page.setInputFiles('.upload-card input[type="file"]', image);
  const panel = page.locator(".result-panel");
  await expect(panel).toHaveAttribute("data-state", /done|error/, { timeout: 150_000 });
  const state = await panel.getAttribute("data-state");
  expect(state, `${path.basename(image)} : état final`).toBe("done");
  return {
    engine: await panel.getAttribute("data-engine"),
    elapsedMs: Number(await panel.getAttribute("data-elapsed-ms")),
  };
}
