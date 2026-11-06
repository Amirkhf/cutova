/**
 * Vue Node de la source unique `src/core/model/models.json` (aussi lue par le navigateur via
 * `src/core/model/model-source.ts`). Révisions HF figées pour que la vérification SHA-256 de
 * `scripts/fetch-model.mjs` ait un sens : voir context.md > Décisions.
 */
import catalog from "../src/core/model/models.json" with { type: "json" };

export const MODELS = catalog.models;
export const ENGINES = catalog.engines;

/** Identifiants des modèles réellement utilisés par un moteur (les seuls à télécharger). */
export const USED_MODEL_IDS = [...new Set(Object.values(ENGINES))];

/** Modèle de référence qualité (WebGPU) — utilisé par scripts/reference-masks.mjs. */
export const REFERENCE_MODEL = MODELS[ENGINES.webgpu];
