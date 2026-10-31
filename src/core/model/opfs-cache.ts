/**
 * Cache personnalisé pour transformers.js (`env.customCache`), persistant via OPFS :
 * le modèle n'est téléchargé qu'une fois par appareil. Si OPFS est indisponible (API
 * absente, contexte privé qui la bloque, etc.), toutes les méthodes échouent "proprement"
 * (retour `undefined`/no-op) : transformers.js retombe alors sur un téléchargement direct
 * sans cache, sans jamais planter.
 */

const ROOT_DIR = "cutova-model-cache";

function isOpfsSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.storage?.getDirectory === "function";
}

/** Dérive un nom de fichier stable et sûr depuis l'URL demandée par transformers.js. */
function cacheKeyFor(request: string): string {
  return request.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function getRootDir(): Promise<FileSystemDirectoryHandle> {
  const opfsRoot = await navigator.storage.getDirectory();
  return opfsRoot.getDirectoryHandle(ROOT_DIR, { create: true });
}

export interface OpfsCacheHandle {
  match(request: string): Promise<Response | undefined>;
  put(request: string, response: Response, progressCallback?: (data: { progress: number; loaded: number; total: number }) => void): Promise<void>;
  delete(request: string): Promise<boolean>;
}

/** `null` quand OPFS n'est pas disponible dans ce contexte (worker ou page). */
export async function createOpfsCache(): Promise<OpfsCacheHandle | null> {
  if (!isOpfsSupported()) return null;

  try {
    await getRootDir();
  } catch {
    return null;
  }

  return {
    async match(request) {
      try {
        const dir = await getRootDir();
        const fileHandle = await dir.getFileHandle(cacheKeyFor(request));
        const file = await fileHandle.getFile();
        return new Response(file, { headers: { "Content-Length": String(file.size) } });
      } catch {
        return undefined;
      }
    },

    async put(request, response, progressCallback) {
      try {
        const dir = await getRootDir();
        const fileHandle = await dir.getFileHandle(cacheKeyFor(request), { create: true });
        const writable = await fileHandle.createWritable();
        const total = Number(response.headers.get("Content-Length") ?? 0);
        let loaded = 0;

        if (!response.body) {
          await writable.close();
          return;
        }

        const reader = response.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          await writable.write(value);
          loaded += value.byteLength;
          if (total > 0) {
            progressCallback?.({ progress: (loaded / total) * 100, loaded, total });
          }
        }
        await writable.close();
      } catch {
        // Échec d'écriture OPFS (quota, contexte privé...) : on laisse simplement le
        // fichier non mis en cache, sans remonter d'erreur — le prochain chargement
        // retéléchargera, ce n'est jamais bloquant.
      }
    },

    async delete(request) {
      try {
        const dir = await getRootDir();
        await dir.removeEntry(cacheKeyFor(request));
        return true;
      } catch {
        return false;
      }
    },
  };
}
