import { describe, expect, it } from "vitest";
import { verifyAccessJwt, teamOrigin, type Jwk } from "../../edge/access.ts";
import { aggregate, handleStats, periodRanges, totalsOf, type Row } from "../../edge/stats.ts";
import { generateDemoRows } from "../../edge/demo.ts";
import type { D1Database } from "../../edge/types.ts";

const TEAM = "equipe.cloudflareaccess.com";
const AUD = "aud-123";
const NOW = Date.UTC(2026, 10, 1, 12);

const b64url = (bytes: Uint8Array | string) =>
  Buffer.from(typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

async function keyPair() {
  return crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
}

const pair = await keyPair();
const other = await keyPair();
const jwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as Jwk;
const keys: Jwk[] = [{ ...jwk, kid: "k1" }];
const fetchKeys = async () => keys;

async function sign(payload: Record<string, unknown>, opts: { kid?: string; key?: CryptoKey } = {}) {
  const h = b64url(JSON.stringify({ alg: "RS256", kid: opts.kid ?? "k1" }));
  const p = b64url(JSON.stringify(payload));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", opts.key ?? pair.privateKey, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64url(new Uint8Array(sig))}`;
}

const good = { aud: [AUD], iss: `https://${TEAM}`, exp: NOW / 1000 + 600, nbf: NOW / 1000 - 10 };
const config = { teamDomain: TEAM, aud: AUD };

describe("verifyAccessJwt", () => {
  it("accepte un jeton valide", async () => {
    expect(await verifyAccessJwt(await sign(good), config, fetchKeys, NOW)).toBe(true);
  });
  it("rejette mauvaise audience, émetteur, expiration, clé, signature, format", async () => {
    expect(await verifyAccessJwt(await sign({ ...good, aud: ["autre"] }), config, fetchKeys, NOW)).toBe(false);
    expect(await verifyAccessJwt(await sign({ ...good, iss: "https://pirate.example" }), config, fetchKeys, NOW)).toBe(false);
    expect(await verifyAccessJwt(await sign({ ...good, exp: NOW / 1000 - 3600 }), config, fetchKeys, NOW)).toBe(false);
    expect(await verifyAccessJwt(await sign({ ...good, nbf: NOW / 1000 + 3600 }), config, fetchKeys, NOW)).toBe(false);
    expect(await verifyAccessJwt(await sign(good, { kid: "inconnu" }), config, fetchKeys, NOW)).toBe(false);
    expect(await verifyAccessJwt(await sign(good, { key: other.privateKey }), config, fetchKeys, NOW)).toBe(false);
    expect(await verifyAccessJwt("abc.def", config, fetchKeys, NOW)).toBe(false);
    expect(await verifyAccessJwt(null, config, fetchKeys, NOW)).toBe(false);
  });
  it("normalise le domaine d'équipe", () => {
    expect(teamOrigin("https://equipe.cloudflareaccess.com/")).toBe("https://equipe.cloudflareaccess.com");
  });
});

function fakeDb(rows: Row[]): D1Database {
  return {
    prepare: () => ({
      bind: (start: string, end: string) => ({
        run: async () => ({ results: [], success: true }),
        all: async () => ({ results: rows.filter((r) => r.day >= start && r.day <= end), success: true }),
        bind: () => { throw new Error("unused"); },
      }),
    }),
  } as unknown as D1Database;
}

describe("handleStats", () => {
  const db = fakeDb(generateDemoRows(120, NOW));
  const req = (headers: Record<string, string> = {}, q = "?period=7") => new Request(`https://cutova.test/api/stats${q}`, { headers });

  it("403 en production si les variables ACCESS_* manquent", async () => {
    expect((await handleStats(req(), { DB: db }, NOW, fetchKeys)).status).toBe(403);
    expect((await handleStats(req(), { DB: db, ACCESS_AUD: AUD }, NOW, fetchKeys)).status).toBe(403);
  });
  it("403 sans jeton ou avec jeton invalide, 200 avec jeton valide", async () => {
    const env = { DB: db, ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD };
    expect((await handleStats(req(), env, NOW, fetchKeys)).status).toBe(403);
    expect((await handleStats(req({ "Cf-Access-Jwt-Assertion": await sign({ ...good, aud: ["x"] }) }), env, NOW, fetchKeys)).status).toBe(403);
    const ok = await handleStats(req({ "Cf-Access-Jwt-Assertion": await sign(good) }), env, NOW, fetchKeys);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Cache-Control")).toBe("no-store");
    expect(ok.headers.get("X-Robots-Tag")).toBe("noindex");
  });
  it("dev local ouvert, période invalide → 400, méthode → 405, sans base → 503", async () => {
    expect((await handleStats(req(), { DB: db, STATS_DEV_OPEN: "1" }, NOW, fetchKeys)).status).toBe(200);
    expect((await handleStats(req({}, "?period=365"), { DB: db, STATS_DEV_OPEN: "1" }, NOW, fetchKeys)).status).toBe(400);
    expect((await handleStats(new Request("https://cutova.test/api/stats", { method: "POST" }), { STATS_DEV_OPEN: "1" }, NOW, fetchKeys)).status).toBe(405);
    expect((await handleStats(req(), { STATS_DEV_OPEN: "1" }, NOW, fetchKeys)).status).toBe(503);
  });
});

describe("agrégation", () => {
  it("périodes courante et précédente contiguës", () => {
    const { current, previous } = periodRanges("7", NOW);
    expect(current.end).toBe("2026-11-01");
    expect(current.start).toBe("2026-10-26");
    expect(previous.end).toBe("2026-10-25");
    expect(current.days).toHaveLength(7);
    expect(periodRanges("today", NOW).current.days).toEqual(["2026-11-01"]);
  });
  it("totaux, taux de réussite, part WebGPU", () => {
    const base = { page: "", lang: "en", engine: "", model: "", tool: "", format: "", time_bucket: "", size_bucket: "" };
    const rows: Row[] = [
      { ...base, day: "2026-11-01", type: "cutout_done", engine: "webgpu", count: 3 },
      { ...base, day: "2026-11-01", type: "cutout_done", engine: "wasm", count: 1 },
      { ...base, day: "2026-11-01", type: "cutout_failed", count: 1 },
    ];
    const t = totalsOf(rows);
    expect(t.cutouts).toBe(4);
    expect(t.successRate).toBeCloseTo(0.8);
    expect(t.webgpuShare).toBeCloseTo(0.75);
    expect(totalsOf([]).successRate).toBeNull();
  });
  it("données de démo déterministes et séries cohérentes", () => {
    const a = generateDemoRows(120, NOW);
    expect(generateDemoRows(120, NOW)).toEqual(a);
    const s = aggregate(a, "30", NOW);
    expect(s.series.visits).toHaveLength(30);
    expect(s.series.visits.reduce((x, y) => x + y, 0)).toBe(s.totals.visits);
    expect(s.tools[0]!.count).toBeGreaterThanOrEqual(s.tools.at(-1)!.count);
    expect(Object.keys(s.timeByEngine).sort()).toEqual(["wasm", "webgpu"]);
  });
});
