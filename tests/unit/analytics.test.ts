import { describe, expect, it } from "vitest";
import { pageOf, sizeBucket, timeBucket, validateEvent, FIELDS_BY_TYPE, EVENT_TYPES } from "../../src/core/analytics/schema.ts";
import { privacyOptOut } from "../../src/core/analytics/analytics.ts";
import { dayOf, handleEvent, UPSERT_SQL } from "../../edge/event.ts";
import { RateLimiter } from "../../edge/ratelimit.ts";
import type { D1Database } from "../../edge/types.ts";

/** Fausse base D1 : rejoue l'upsert agrégé en mémoire. */
function fakeDb() {
  const rows = new Map<string, number>();
  const db: D1Database = {
    prepare(sql: string) {
      expect(sql).toBe(UPSERT_SQL);
      let values: unknown[] = [];
      const stmt = {
        bind: (...v: unknown[]) => ((values = v), stmt),
        run: async () => {
          const key = JSON.stringify(values);
          rows.set(key, (rows.get(key) ?? 0) + 1);
          return {};
        },
        all: async () => ({ results: [] }),
      };
      return stmt;
    },
  };
  return { db, rows };
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://cutova.test/api/event", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "Content-Type": "application/json", ...headers } });

describe("schéma (liste blanche)", () => {
  it("accepte un événement complet et autorisé", () => {
    expect(validateEvent({ type: "cutout_done", lang: "fr", engine: "wasm", model: "ormbg", time: "2-5s", size: "1-4mp" })).toEqual({
      type: "cutout_done", lang: "fr", engine: "wasm", model: "ormbg", time: "2-5s", size: "1-4mp",
    });
    expect(validateEvent({ type: "page_view", page: "/fr/tutoriels/creer-png-transparent/", lang: "fr" })).not.toBeNull();
  });

  it.each([
    ["type inconnu", { type: "login" }],
    ["champ inconnu", { type: "download", format: "png", fileName: "moi.jpg" }],
    ["champ non autorisé pour ce type", { type: "page_view", page: "/", engine: "wasm" }],
    ["valeur hors liste", { type: "download", format: "gif" }],
    ["valeur non textuelle", { type: "tool_used", tool: 3 }],
    ["page avec requête", { type: "page_view", page: "/?email=a@b.c" }],
    ["page trop longue", { type: "page_view", page: `/${"a".repeat(50)}/` }],
    ["image", { type: "download", format: "png", image: "data:image/png;base64,AAAA" }],
    ["tableau", [{ type: "page_view" }]],
    ["null", null],
  ])("rejette : %s", (_, input) => {
    expect(validateEvent(input)).toBeNull();
  });

  it("aucun type n'autorise de champ d'identification", () => {
    const forbidden = ["ip", "userAgent", "referrer", "id", "fileName", "image", "cookie", "url"];
    for (const type of EVENT_TYPES) for (const f of forbidden) expect(FIELDS_BY_TYPE[type]).not.toContain(f);
  });

  it("tranches de temps et de taille, chemin de page", () => {
    expect([999, 1000, 4999, 9999, 10000].map(timeBucket)).toEqual(["lt1s", "1-2s", "2-5s", "5-10s", "gt10s"]);
    expect(sizeBucket(2000, 1332)).toBe("1-4mp");
    expect(sizeBucket(8000, 6000)).toBe("gt24mp");
    expect(pageOf("/fr")).toBe("/fr/");
    expect(pageOf("/x/../../etc/passwd")).toBe("/");
  });

  it("Do Not Track et Global Privacy Control désactivent l'envoi", () => {
    expect(privacyOptOut({ doNotTrack: "1" })).toBe(true);
    expect(privacyOptOut({ globalPrivacyControl: true })).toBe(true);
    expect(privacyOptOut({}, { doNotTrack: "1" })).toBe(true);
    expect(privacyOptOut({ doNotTrack: "0" }, {})).toBe(false);
  });
});

describe("POST /api/event", () => {
  const now = Date.UTC(2026, 10, 1, 12);

  it("compte de façon agrégée (même jour + mêmes dimensions = même ligne)", async () => {
    const { db, rows } = fakeDb();
    for (let i = 0; i < 3; i++) expect((await handleEvent(post({ type: "download", format: "png", lang: "en", size: "1-4mp" }), { DB: db }, now, new RateLimiter())).status).toBe(204);
    expect(rows.size).toBe(1);
    expect([...rows.values()]).toEqual([3]);
    expect(JSON.parse([...rows.keys()][0]!)).toEqual([dayOf(now), "download", "", "en", "", "", "", "png", "", "1-4mp"]);
  });

  it("rejette champs inconnus, JSON invalide, corps trop gros, mauvaise méthode", async () => {
    const { db, rows } = fakeDb();
    const env = { DB: db };
    expect((await handleEvent(post({ type: "download", format: "png", name: "x.png" }), env, now, new RateLimiter())).status).toBe(400);
    expect((await handleEvent(post("{pas du json"), env, now, new RateLimiter())).status).toBe(400);
    expect((await handleEvent(post({ type: "page_view", page: "/", lang: "en", pad: "x".repeat(600) }), env, now, new RateLimiter())).status).toBe(413);
    expect((await handleEvent(new Request("https://cutova.test/api/event"), env, now, new RateLimiter())).status).toBe(405);
    expect(rows.size).toBe(0);
  });

  it("limitation de débit par adresse (en mémoire seulement)", async () => {
    const { db } = fakeDb();
    const limiter = new RateLimiter(2, 60_000);
    const send = () => handleEvent(post({ type: "page_view", page: "/", lang: "en" }, { "CF-Connecting-IP": "203.0.113.7" }), { DB: db }, now, limiter);
    expect((await send()).status).toBe(204);
    expect((await send()).status).toBe(204);
    expect((await send()).status).toBe(429);
    expect(limiter.allow("203.0.113.7", now + 61_000)).toBe(true);
  });

  it("sans base configurée : 503, jamais de plantage", async () => {
    expect((await handleEvent(post({ type: "batch_zip", format: "png" }), {}, now, new RateLimiter())).status).toBe(503);
  });
});
