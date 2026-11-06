/** Cloudflare Pages Function : POST /api/event (logique : edge/event.ts). */
import { handleEvent } from "../../edge/event.ts";
import type { PagesContext } from "../../edge/types.ts";

export const onRequest = (context: PagesContext): Promise<Response> => handleEvent(context.request, context.env);
