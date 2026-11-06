/**
 * GET /api/stats?period=today|7|30|90 : chiffres agrégés pour le tableau de bord privé /stats.
 * Accès : Cloudflare Access protège /stats et /api/stats, ET cette fonction vérifie elle-même le jeton
 * (`Cf-Access-Jwt-Assertion`) avec ACCESS_TEAM_DOMAIN et ACCESS_AUD. Variables absentes → 403
 * (production fermée par défaut). Dev local seulement : STATS_DEV_OPEN=1 (fichier .dev.vars).
 */
import { verifyAccessJwt, fetchTeamKeys, type JwksFetcher } from "./access.ts";
import type { EdgeEnv } from "./types.ts";

export const PERIODS = { today: 1, "7": 7, "30": 30, "90": 90 } as const;
export type Period = keyof typeof PERIODS;

export interface Row {
  day: string;
  type: string;
  page: string;
  lang: string;
  engine: string;
  model: string;
  tool: string;
  format: string;
  time_bucket: string;
  size_bucket: string;
  count: number;
}

export interface DayRange {
  start: string;
  end: string;
  days: string[];
}

const DAY_MS = 86_400_000;
const dayString = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Période courante (se terminant aujourd'hui, UTC) et période précédente de même durée. */
export function periodRanges(period: Period, now: number): { current: DayRange; previous: DayRange } {
  const length = PERIODS[period];
  const today = Math.floor(now / DAY_MS) * DAY_MS;
  const range = (endMs: number): DayRange => {
    const days = Array.from({ length }, (_, i) => dayString(endMs - (length - 1 - i) * DAY_MS));
    return { start: days[0]!, end: days.at(-1)!, days };
  };
  return { current: range(today), previous: range(today - length * DAY_MS) };
}

export interface Totals {
  visits: number;
  cutouts: number;
  failures: number;
  downloads: number;
  fallbacks: number;
  zips: number;
  successRate: number | null;
  webgpuShare: number | null;
}

const sum = (rows: Row[], pred: (r: Row) => boolean) => rows.reduce((n, r) => (pred(r) ? n + r.count : n), 0);

export function totalsOf(rows: Row[]): Totals {
  const cutouts = sum(rows, (r) => r.type === "cutout_done");
  const failures = sum(rows, (r) => r.type === "cutout_failed");
  const webgpu = sum(rows, (r) => r.type === "cutout_done" && r.engine === "webgpu");
  return {
    visits: sum(rows, (r) => r.type === "page_view"),
    cutouts,
    failures,
    downloads: sum(rows, (r) => r.type === "download"),
    fallbacks: sum(rows, (r) => r.type === "engine_fallback"),
    zips: sum(rows, (r) => r.type === "batch_zip"),
    successRate: cutouts + failures > 0 ? cutouts / (cutouts + failures) : null,
    webgpuShare: cutouts > 0 ? webgpu / cutouts : null,
  };
}

/** Classement décroissant d'une dimension pour un type d'événement. */
function top(rows: Row[], type: string, key: keyof Row, limit = 10): { key: string; count: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) if (r.type === type && r[key] !== "") map.set(String(r[key]), (map.get(String(r[key])) ?? 0) + r.count);
  return [...map].map(([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)).slice(0, limit);
}

export function aggregate(rows: Row[], period: Period, now: number) {
  const { current, previous } = periodRanges(period, now);
  const inRange = (r: Row, range: DayRange) => r.day >= range.start && r.day <= range.end;
  const cur = rows.filter((r) => inRange(r, current));
  const prev = rows.filter((r) => inRange(r, previous));
  const series = (type: string) => current.days.map((day) => sum(cur, (r) => r.day === day && r.type === type));
  const timeByEngine: Record<string, Record<string, number>> = {};
  for (const r of cur) {
    if (r.type !== "cutout_done" || !r.engine || !r.time_bucket) continue;
    timeByEngine[r.engine] ??= {};
    timeByEngine[r.engine]![r.time_bucket] = (timeByEngine[r.engine]![r.time_bucket] ?? 0) + r.count;
  }
  return {
    period,
    range: { start: current.start, end: current.end },
    previousRange: { start: previous.start, end: previous.end },
    days: current.days,
    totals: totalsOf(cur),
    previousTotals: totalsOf(prev),
    series: {
      visits: series("page_view"),
      cutouts: series("cutout_done"),
      downloads: series("download"),
      failures: series("cutout_failed"),
      fallbacks: series("engine_fallback"),
    },
    tools: top(cur, "tool_used", "tool"),
    formats: top(cur, "download", "format"),
    langs: top(cur, "page_view", "lang"),
    landingPages: top(cur, "page_view", "page"),
    timeByEngine,
  };
}

export type StatsPayload = ReturnType<typeof aggregate>;

export const SELECT_SQL = `SELECT day, type, page, lang, engine, model, tool, format, time_bucket, size_bucket, SUM(count) AS count
FROM daily_events WHERE day BETWEEN ? AND ?
GROUP BY day, type, page, lang, engine, model, tool, format, time_bucket, size_bucket`;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });

/** Autorisé ? Dev local ouvert explicitement, sinon jeton Access obligatoire et vérifié. */
export async function authorized(request: Request, env: EdgeEnv, fetchKeys: JwksFetcher = fetchTeamKeys, now = Date.now()): Promise<boolean> {
  if (env.STATS_DEV_OPEN === "1") return true;
  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) return false;
  return verifyAccessJwt(request.headers.get("Cf-Access-Jwt-Assertion"), { teamDomain: env.ACCESS_TEAM_DOMAIN, aud: env.ACCESS_AUD }, fetchKeys, now);
}

export async function handleStats(request: Request, env: EdgeEnv, now = Date.now(), fetchKeys: JwksFetcher = fetchTeamKeys): Promise<Response> {
  if (request.method !== "GET") return json(405, { error: "method" });
  if (!(await authorized(request, env, fetchKeys, now))) return json(403, { error: "forbidden" });
  const requested = new URL(request.url).searchParams.get("period") ?? "7";
  if (!(requested in PERIODS)) return json(400, { error: "period" });
  const period = requested as Period;
  if (!env.DB) return json(503, { error: "storage not configured" });
  const { current, previous } = periodRanges(period, now);
  const { results } = await env.DB.prepare(SELECT_SQL).bind(previous.start, current.end).all<Row>();
  return json(200, aggregate(results.map((r) => ({ ...r, count: Number(r.count) })), period, now));
}
