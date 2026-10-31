# Déployer Cutova — ce que TU dois faire, dans l'ordre

Tout le code est prêt : le site part sur **Cloudflare Pages** (gratuit), les modèles d'IA et les gros
binaires WebAssembly sur **Cloudflare R2** (stockage, servi par un sous-domaine). Il reste des étapes qui
demandent ton compte, ta carte ou tes accès : les voici, dans l'ordre. Coche au fur et à mesure.

> Pourquoi deux endroits ? Cloudflare Pages refuse les fichiers de plus de 25 Mio. Les modèles font
> 109 à 214 Mio, et le binaire `ort-wasm-simd-threaded.asyncify.wasm` fait 25,6 Mio. Le build échoue
> volontairement sur Cloudflare si un fichier trop gros reste dans `dist/` (`scripts/postbuild.mjs`).

Dans la suite, remplace `exemple.com` par ton domaine.

---

## 1. Préparer (une fois)

- [ ] **Accès GitHub** : vérifier que l'app Claude a le droit d'écrire sur `Amirkhf/cutova` (les push
      de cette session ont été refusés : erreur 403), puis fusionner la branche
      `claude/eloquent-ritchie-tl8fus` dans `main`.
- [ ] **Choisir et acheter un domaine** (payant, ~10 €/an). Le plus simple : Cloudflare Registrar
      (Dashboard Cloudflare → *Domain Registration*). Si le domaine est acheté ailleurs, l'ajouter à
      Cloudflare (*Add a site*) et changer les serveurs DNS chez le vendeur.
- [ ] **Compte Cloudflare** (gratuit) : https://dash.cloudflare.com/sign-up
- [ ] **Activer R2** : Dashboard → *R2 Object Storage*. Cloudflare demande un moyen de paiement même pour
      l'offre gratuite (10 Go de stockage inclus, sortie de données gratuite ; nos fichiers font ~530 Mo).

## 2. Stockage des modèles (R2)

- [ ] Créer un bucket : **`cutova-models`** (R2 → *Create bucket*, emplacement automatique).
- [ ] Lui donner un domaine public : bucket → *Settings* → *Public access* → *Custom Domains* →
      **`models.exemple.com`**. (Ne pas utiliser l'URL `r2.dev` en production : elle est limitée en débit.)
- [ ] CORS : bucket → *Settings* → *CORS policy* → coller le contenu de `deploy/r2-cors.json` en
      remplaçant `https://REMPLACER-PAR-VOTRE-DOMAINE` par **`https://exemple.com`**.
      (Sans CORS, le navigateur refusera les fichiers : le site est en isolation cross-origin.)
- [ ] Envoyer les fichiers, depuis ton ordinateur, dans le dossier du projet :

  ```bash
  npm ci
  ```

  ```bash
  node scripts/fetch-model.mjs
  ```

  ```bash
  npx wrangler login
  ```

  ```bash
  node scripts/model-mirror.mjs r2-commands --bucket cutova-models > upload-r2.sh
  ```

  ```bash
  sh upload-r2.sh
  ```

  (`fetch-model.mjs` vérifie le SHA-256 de chaque modèle ; `model-mirror.mjs` écrit seulement les
  commandes `wrangler r2 object put` : 9 fichiers, ~530 Mo au total.)
- [ ] Vérifier qu'un fichier répond bien, avec CORS :

  ```bash
  curl -sI -H "Origin: https://exemple.com" https://models.exemple.com/onnx-community/ormbg-ONNX/resolve/034e2d884afbab897e10e78fc5bb566b29533fd6/config.json
  ```

  Attendu : `HTTP/2 200` et `access-control-allow-origin: https://exemple.com`.
- [ ] Vérifier que les gros fichiers arrivent **avec leur taille** (sinon la barre de progression ne peut
      pas afficher de pourcentage), même quand le navigateur accepte la compression :

  ```bash
  curl -s -D - -o /dev/null -H "Accept-Encoding: gzip, br" https://models.exemple.com/onnx-community/ormbg-ONNX/resolve/034e2d884afbab897e10e78fc5bb566b29533fd6/onnx/model.onnx
  ```

  Attendu : une ligne `content-length: 176116019` et **aucune** ligne `content-encoding: gzip`/`br`.
  Les commandes d'envoi posent `Cache-Control: no-store, no-transform` sur chaque fichier ;
  `no-transform` interdit à Cloudflare de les compresser à la volée. Si `content-length` manque quand
  même : Dashboard → ton domaine → *Rules* → *Compression Rules* → règle « Hostname equals
  `models.exemple.com` » → *Disable compression*.
- [ ] Cache au bord du réseau (recommandé) : Dashboard → ton domaine → *Caching* → *Cache Rules* →
      *Create rule* : « Hostname equals `models.exemple.com` » → *Eligible for cache*, *Edge TTL* :
      « Ignore cache-control header and use this TTL » → 1 an. (Le navigateur, lui, ne garde pas de copie
      HTTP : le modèle est déjà stocké dans le navigateur (OPFS) par l'application.)

## 3. Le site (Cloudflare Pages)

- [ ] Dashboard → *Workers & Pages* → *Create* → *Pages* → *Connect to Git* → dépôt **`Amirkhf/cutova`**,
      branche **`main`**.
- [ ] Réglages du build :
  - *Framework preset* : **None**
  - *Build command* : **`npm run build`**
  - *Build output directory* : **`dist`**
- [ ] Variables d'environnement (*Settings* → *Variables and Secrets*, pour *Production* ET *Preview*) :
  - `NODE_VERSION` = **`22`**
  - `SITE_URL` = **`https://exemple.com`** (URLs absolues : canonical, hreflang, sitemap, robots.txt)
  - `VITE_MODEL_BASE_URL` = **`https://models.exemple.com`** (modèles + binaires `.wasm` sur R2 ;
    ajouté automatiquement à la CSP `connect-src`)
- [ ] *Save and Deploy*. Le build échoue avec un message clair si un fichier dépasse 25 Mio (variable
      `VITE_MODEL_BASE_URL` oubliée, en général).
- [ ] Domaine du site : projet Pages → *Custom domains* → ajouter **`exemple.com`** (et `www.exemple.com`
      si tu veux, avec une redirection vers `exemple.com` : *Rules* → *Redirect Rules*).

Le fichier `dist/_headers` (généré au build depuis `security-headers.mjs`) applique automatiquement
COOP/COEP (multithread WebAssembly), la CSP stricte et les règles de cache. Rien à configurer à la main.

## 4. Vérifier en production

- [ ] En-têtes :

  ```bash
  curl -sI https://exemple.com/ | grep -i -E "cross-origin|content-security-policy"
  ```

  Attendu : `cross-origin-opener-policy: same-origin`, `cross-origin-embedder-policy: require-corp`, et
  une CSP contenant `connect-src 'self' https://models.exemple.com`.
- [ ] Ouvrir `https://exemple.com`, console du navigateur (F12) : `crossOriginIsolated` doit afficher
      `true`.
- [ ] Cliquer sur une image d'exemple : un détourage doit apparaître. Onglet *Réseau* : seules des
      requêtes vers `exemple.com` et `models.exemple.com`.
- [ ] Tester sur un **ordinateur avec une vraie carte graphique** (chemin WebGPU, BiRefNet_lite : jamais
      testé sur du vrai matériel) et sur un **iPhone** (chemin WASM, ormbg). Noter les temps dans
      `context.md` > Mesures.
- [ ] `https://exemple.com/fr/`, `https://exemple.com/sitemap.xml`, `https://exemple.com/robots.txt`,
      `https://exemple.com/llms.txt` s'ouvrent et contiennent bien `https://exemple.com`.
- [ ] Lighthouse (Chrome → F12 → *Lighthouse*) sur `/` et `/fr/` : viser ≥ 95 partout.

## 5. Référencement

- [ ] Google Search Console : https://search.google.com/search-console → ajouter la propriété
      *Domaine* `exemple.com` (validation DNS, automatique si le domaine est chez Cloudflare) →
      *Sitemaps* → envoyer `https://exemple.com/sitemap.xml`.
- [ ] Bing Webmaster Tools : https://www.bing.com/webmasters → *Import from Google Search Console*.
- [ ] Revenir après quelques jours : *Pages* (indexation) et *Améliorations* (FAQ, fil d'Ariane).

## Plus tard : changer de modèle

1. Modifier `src/core/model/models.json` (dépôt, révision, SHA-256, `engines`).
2. Relancer les commandes de la section 2 (`fetch-model.mjs`, `model-mirror.mjs r2-commands`,
   `upload-r2.sh`) : la révision fait partie du chemin, donc aucun vieux fichier en cache n'est
   réutilisé par erreur.
3. Pousser sur `main` : Cloudflare Pages reconstruit le site.

## En local (rappel)

- `node scripts/fetch-model.mjs` puis `npm run dev` : tout est servi par Vite, sans R2.
- `npm run test:e2e:remote` : simule la production (site + « faux R2 » sur une autre origine avec CORS,
  `scripts/model-mirror.mjs serve`) et vérifie qu'un vrai détourage marche sous COEP/CSP. Ce test
  reconstruit `dist/` en mode externe : relancer `npm run build` ensuite.
