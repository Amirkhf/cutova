/**
 * Limitation de débit en mémoire, par instance du worker (fenêtre fixe). La clé (l'adresse IP de la
 * requête, fournie par Cloudflare) n'est gardée qu'en mémoire, le temps de la fenêtre, et n'est JAMAIS
 * écrite dans D1 ni dans un journal. Protection "raisonnable" contre le remplissage abusif des compteurs
 * (une limite globale stricte demanderait un service payant ou partagé).
 */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; reset: number }>();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit = 60, windowMs = 60_000) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  /** Vrai si la requête est acceptée. */
  allow(key: string, now = Date.now()): boolean {
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) if (v.reset <= now) this.hits.delete(k);
    }
    const entry = this.hits.get(key);
    if (!entry || entry.reset <= now) {
      this.hits.set(key, { count: 1, reset: now + this.windowMs });
      return true;
    }
    entry.count++;
    return entry.count <= this.limit;
  }
}
