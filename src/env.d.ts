/** Version figée d'onnxruntime-web (package.json), injectée par vite.config.ts > define. */
declare const __ORT_VERSION__: string;

interface ImportMetaEnv {
  /**
   * URL de base du stockage externe (R2 en production) des modèles et des binaires onnxruntime-web.
   * Absente = tout est servi par le site (`/models/`, binaires bundlés). Voir DEPLOY.md.
   */
  readonly VITE_MODEL_BASE_URL?: string;
}
