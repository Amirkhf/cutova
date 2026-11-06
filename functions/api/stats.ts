/** Cloudflare Pages Function : GET /api/stats (logique et contrôle d'accès : edge/stats.ts). */
import { handleStats } from "../../edge/stats.ts";
import type { PagesContext } from "../../edge/types.ts";

export const onRequest = (context: PagesContext): Promise<Response> => handleStats(context.request, context.env);
