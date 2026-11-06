/**
 * POST /api/event : reçoit UN événement anonyme, le valide (liste blanche stricte, partagée avec le
 * navigateur : src/core/analytics/schema.ts), puis incrémente un compteur AGRÉGÉ dans D1 (une ligne
 * par jour et par combinaison de dimensions, jamais une ligne par visiteur). Tout le reste est rejeté.
 */
import { MAX_BODY_BYTES, validateEvent, type AnalyticsEvent } from "../src/core/analytics/schema.ts";
import { RateLimiter } from "./ratelimit.ts";
import type { D1Database, EdgeEnv } from "./types.ts";

const limiter = new RateLimiter(60, 60_000);

const NO_STORE = { "Cache-Control": "no-store" };

function reply(status: number, message?: string): Response {
  return message ? new Response(message, { status, headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" } }) : new Response(null, { status, headers: NO_STORE });
}

/** Jour UTC "AAAA-MM-JJ". */
export function dayOf(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export const UPSERT_SQL = `INSERT INTO daily_events (day, type, page, lang, engine, model, tool, format, time_bucket, size_bucket, count)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
ON CONFLICT (day, type, page, lang, engine, model, tool, format, time_bucket, size_bucket) DO UPDATE SET count = count + 1`;

export async function recordEvent(db: D1Database, event: AnalyticsEvent, now: number): Promise<void> {
  await db
    .prepare(UPSERT_SQL)
    .bind(dayOf(now), event.type, event.page ?? "", event.lang ?? "", event.engine ?? "", event.model ?? "", event.tool ?? "", event.format ?? "", event.time ?? "", event.size ?? "")
    .run();
}

export async function handleEvent(request: Request, env: EdgeEnv, now = Date.now(), rate: RateLimiter = limiter): Promise<Response> {
  if (request.method !== "POST") return reply(405);
  const declared = Number(request.headers.get("Content-Length") ?? "0");
  if (declared > MAX_BODY_BYTES) return reply(413);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return reply(413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return reply(400, "invalid json");
  }
  const event = validateEvent(body);
  if (!event) return reply(400, "rejected");
  if (!rate.allow(request.headers.get("CF-Connecting-IP") ?? "unknown", now)) return reply(429);
  if (!env.DB) return reply(503, "storage not configured");
  await recordEvent(env.DB, event, now);
  return reply(204);
}
