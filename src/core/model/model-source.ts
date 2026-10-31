/**
 * Vue navigateur de la source unique `models.json` (aussi lue par Node via
 * `scripts/model-manifest.mjs`). Pour changer le modèle d'un moteur : modifier
 * `models.json` > `engines`, rien d'autre.
 *
 * `repoId` est l'identifiant transmis à `AutoModel.from_pretrained` / `AutoProcessor.from_pretrained`.
 * Avec `env.allowRemoteModels = false` et `env.allowLocalModels = true`, transformers.js résout
 * les fichiers sous `${env.localModelPath}${repoId}/...`, soit `/models/<repoId>/...`, exactement
 * l'arborescence écrite par `scripts/fetch-model.mjs` dans `public/models/`.
 */
import catalog from "./models.json";

export type EngineFamily = "webgpu" | "wasm";

export interface ModelInfo {
  id: string;
  repoId: string;
  license: string;
  inputSize: number;
}

export function getModelForEngine(engine: EngineFamily): ModelInfo {
  const id = catalog.engines[engine];
  const model = (catalog.models as Record<string, { repoId: string; license: string; inputSize: number }>)[id];
  if (!model) throw new Error(`models.json : modèle "${id}" introuvable pour le moteur ${engine}`);
  return { id, repoId: model.repoId, license: model.license, inputSize: model.inputSize };
}

/** Taille de l'aperçu provisoire (tous les modèles retenus travaillent en 1024×1024). */
export const MODEL_INPUT_SIZE = 1024;
