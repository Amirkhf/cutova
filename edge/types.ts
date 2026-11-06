/**
 * Types minimaux de l'environnement Cloudflare (Pages Functions + D1), déclarés ici plutôt que via
 * @cloudflare/workers-types : seules les méthodes réellement utilisées.
 */
export interface D1Result<T> {
  results: T[];
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<unknown>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export interface EdgeEnv {
  /** Base D1 des compteurs agrégés (liaison "DB", voir wrangler.toml). */
  DB?: D1Database;
  /** Cloudflare Access : domaine de l'équipe (ex. "monequipe.cloudflareaccess.com"). */
  ACCESS_TEAM_DOMAIN?: string;
  /** Cloudflare Access : "Application Audience (AUD) Tag" de l'application protégeant /stats. */
  ACCESS_AUD?: string;
  /** Dev local uniquement (.dev.vars) : "1" ouvre /api/stats sans Cloudflare Access. */
  STATS_DEV_OPEN?: string;
}

export interface PagesContext {
  request: Request;
  env: EdgeEnv;
}
