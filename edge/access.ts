/**
 * Vérification du jeton Cloudflare Access (`Cf-Access-Jwt-Assertion`) : signature RS256 avec les clés
 * publiques de l'équipe (`https://<équipe>.cloudflareaccess.com/cdn-cgi/access/certs`), audience (AUD de
 * l'application), émetteur, dates. WebCrypto uniquement, aucune dépendance.
 * Documentation : https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/
 */

export interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}

export type JwksFetcher = (teamDomain: string) => Promise<Jwk[]>;

/** "monequipe.cloudflareaccess.com" ou "https://monequipe.cloudflareaccess.com/" → origine https. */
export function teamOrigin(teamDomain: string): string {
  const host = teamDomain.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `https://${host}`;
}

let cache: { origin: string; keys: Jwk[]; expires: number } | null = null;

export const fetchTeamKeys: JwksFetcher = async (teamDomain) => {
  const origin = teamOrigin(teamDomain);
  if (cache && cache.origin === origin && cache.expires > Date.now()) return cache.keys;
  const response = await fetch(`${origin}/cdn-cgi/access/certs`);
  if (!response.ok) throw new Error(`certs ${response.status}`);
  const { keys } = (await response.json()) as { keys: Jwk[] };
  cache = { origin, keys, expires: Date.now() + 10 * 60_000 };
  return keys;
};

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJson(part: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(part))) as Record<string, unknown>;
}

export interface AccessConfig {
  teamDomain: string;
  aud: string;
}

/** Vrai seulement si le jeton est signé par l'équipe, destiné à cette application et valide maintenant. */
export async function verifyAccessJwt(token: string | null, config: AccessConfig, fetchKeys: JwksFetcher = fetchTeamKeys, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const [h, p, sig] = parts as [string, string, string];
    const header = decodeJson(h);
    const payload = decodeJson(p);
    if (header.alg !== "RS256" || typeof header.kid !== "string") return false;
    const jwk = (await fetchKeys(config.teamDomain)).find((k) => k.kid === header.kid);
    if (!jwk) return false;
    const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, base64UrlToBytes(sig), new TextEncoder().encode(`${h}.${p}`));
    if (!valid) return false;
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(config.aud)) return false;
    if (payload.iss !== teamOrigin(config.teamDomain)) return false;
    const seconds = now / 1000;
    if (typeof payload.exp !== "number" || payload.exp < seconds - 60) return false;
    if (typeof payload.nbf === "number" && payload.nbf > seconds + 60) return false;
    return true;
  } catch {
    return false;
  }
}
