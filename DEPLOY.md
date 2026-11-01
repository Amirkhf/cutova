# Déployer Cutova — ce que TU dois faire, dans l'ordre

Le code est prêt et testé (rapport : `docs/QA.md`). Le site part sur **Cloudflare Pages** (gratuit) ; les
modèles d'IA et les gros binaires WebAssembly sur **Cloudflare R2** (stockage, servi par un sous-domaine).
Ce qui reste demande ton compte, ta carte, tes informations légales ou tes accès : voici tout, **dans
l'ordre**. Coche au fur et à mesure. Remplace `exemple.com` par ton domaine.

> Pourquoi deux endroits ? Cloudflare Pages refuse les fichiers de plus de 25 Mio. Les modèles font
> 109 à 214 Mio, et le binaire `ort-wasm-simd-threaded.asyncify.wasm` fait 25,6 Mio. Le build échoue
> volontairement sur Cloudflare si un fichier trop gros reste dans `dist/` (`scripts/postbuild.mjs`).

---

## 1. Code

- [ ] Relire puis **fusionner la PR** de la branche `claude/eloquent-ritchie-tl8fus` dans `main`
      (https://github.com/Amirkhf/cutova/pull/1).

## 2. Domaine et compte (payant : le domaine)

- [ ] **Compte Cloudflare** (gratuit) : https://dash.cloudflare.com/sign-up
- [ ] **Acheter un domaine** (~10 €/an). Le plus simple : Cloudflare → *Domain Registration*. Acheté
      ailleurs : Cloudflare → *Add a site*, puis changer les serveurs DNS chez le vendeur.

## 3. Informations légales (obligatoire avant la mise en ligne)

Remplace chaque `[À COMPLÉTER]` dans ces fichiers (versions anglaise **et** française dans le même
fichier), puis commite. Le build affiche le nombre de champs restants (`[postbuild] … [À COMPLÉTER]`).

- [ ] `content/legal-notice.json` (pages `/legal/` et `/fr/mentions-legales/`) :
  - nom ou raison sociale ;
  - forme juridique et numéro d'immatriculation (SIREN/SIRET si entreprise) ;
  - adresse postale ;
  - e-mail de contact ;
  - directeur ou directrice de la publication ;
  - contrat et région d'hébergement Cloudflare.
- [ ] `content/privacy.json` (pages `/privacy/` et `/fr/confidentialite/`) :
  - durée de conservation et outil de mesure d'audience (aucun au lancement : écrire « aucun ») ;
  - e-mail pour exercer ses droits ;
  - responsable du traitement ;
  - date de dernière mise à jour.
- [ ] `content/terms.json` (pages `/terms/` et `/fr/conditions/`) :
  - droit applicable et tribunaux compétents ;
  - contact ;
  - date de dernière mise à jour.
- [ ] Vérifier à la main les **licences des photos** (liens Pexels d'origine) listées dans
      `public/examples/SOURCES.md`, `public/backgrounds/SOURCES.md` et `tests/images/SOURCES.md`.
      Remplacer toute photo dont la page d'origine n'existe plus.

## 4. Stockage des modèles (R2)

- [ ] **Activer R2** : Dashboard → *R2 Object Storage* (Cloudflare demande un moyen de paiement même
      pour l'offre gratuite ; 10 Go inclus, sortie gratuite ; nos fichiers font ~530 Mo).
- [ ] Créer un bucket **`cutova-models`** (R2 → *Create bucket*, emplacement automatique).
- [ ] Domaine public du bucket : *Settings* → *Public access* → *Custom Domains* → **`models.exemple.com`**
      (pas l'URL `r2.dev` en production : débit limité).
- [ ] CORS : *Settings* → *CORS policy* → coller `deploy/r2-cors.json` en remplaçant
      `https://REMPLACER-PAR-VOTRE-DOMAINE` par **`https://exemple.com`**.
- [ ] Envoyer les fichiers depuis ton ordinateur, dans le dossier du projet :

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
  commandes `wrangler r2 object put` : 9 fichiers, ~530 Mo.)
- [ ] Vérifier un fichier (réponse et CORS) :

  ```bash
  curl -sI -H "Origin: https://exemple.com" https://models.exemple.com/onnx-community/ormbg-ONNX/resolve/034e2d884afbab897e10e78fc5bb566b29533fd6/config.json
  ```

  Attendu : `HTTP/2 200` et `access-control-allow-origin: https://exemple.com`.
- [ ] Vérifier que les gros fichiers arrivent **avec leur taille** (barre de progression en %) :

  ```bash
  curl -s -D - -o /dev/null -H "Accept-Encoding: gzip, br" https://models.exemple.com/onnx-community/ormbg-ONNX/resolve/034e2d884afbab897e10e78fc5bb566b29533fd6/onnx/model.onnx
  ```

  Attendu : `content-length: 176116019` et **aucune** ligne `content-encoding: gzip`/`br`. Sinon :
  ton domaine → *Rules* → *Compression Rules* → « Hostname equals `models.exemple.com` » → *Disable
  compression*.
- [ ] Cache au bord du réseau (recommandé) : ton domaine → *Caching* → *Cache Rules* → « Hostname equals
      `models.exemple.com` » → *Eligible for cache*, *Edge TTL* : « Ignore cache-control header and use this
      TTL » → 1 an (la révision fait partie du chemin : aucun risque de fichier périmé).

## 5. Le site (Cloudflare Pages)

- [ ] Générer une clé IndexNow (à garder ; elle n'est pas secrète, elle sera publique sur le site) :

  ```bash
  openssl rand -hex 16
  ```

- [ ] *Workers & Pages* → *Create* → *Pages* → *Connect to Git* → **`Amirkhf/cutova`**, branche **`main`**.
- [ ] Build : *Framework preset* **None**, *Build command* **`npm run build`**, *Build output directory*
      **`dist`**.
- [ ] Variables publiques : le dépôt contient un `wrangler.toml` (base D1, voir 5 bis), que Cloudflare
      Pages prend comme **source de vérité** (les champs qu'il définit ne sont plus modifiables dans le
      tableau de bord). Dans `wrangler.toml`, décommenter le bloc `[vars]` et remplir :
  - `NODE_VERSION` = **`22`**
  - `SITE_URL` = **`https://exemple.com`** (canonical, hreflang, sitemaps, robots.txt, llms.txt) —
    **obligatoire** : sur Cloudflare Pages (`CF_PAGES=1`), le build **échoue** si `SITE_URL` manque, n'est
    pas en https, contient un chemin ou vise localhost / une adresse locale (`seo/site-url.mjs`).
  - `VITE_MODEL_BASE_URL` = **`https://models.exemple.com`** (modèles + `.wasm` sur R2 ; ajouté à la CSP)
  - `INDEXNOW_KEY` = **la clé générée** (publie `/<clé>.txt`)

  Si le premier build affiche « SITE_URL est obligatoire… », c'est que la variable n'est pas vue au
  moment du build : l'ajouter aussi dans *Settings* → *Variables and Secrets* (type *Text*), puis relancer.
- [ ] *Save and Deploy* (échec volontaire avec message clair si un fichier dépasse 25 Mio ou si
      `SITE_URL` est absent/invalide).
- [ ] *Custom domains* → **`exemple.com`** (et `www.exemple.com` avec redirection vers `exemple.com` :
      *Rules* → *Redirect Rules*).

`dist/_headers` (généré depuis `security-headers.mjs`) applique COOP/COEP, la CSP stricte et le cache :
rien à configurer à la main.

## 5 bis. Statistiques anonymes (base D1)

Compteurs agrégés par jour (aucune donnée personnelle, voir la politique de confidentialité). Offre
gratuite D1 : 100 000 lignes écrites par jour (≈ 100 000 événements) — au-delà, les événements en trop
sont simplement perdus (le site continue de marcher) ; plan Workers payant seulement si un jour ça ne suffit
plus.

- [ ] Se connecter à Cloudflare depuis le dossier du projet :

  ```bash
  npx wrangler login
  ```

- [ ] Créer la base :

  ```bash
  npx wrangler d1 create cutova-stats
  ```

- [ ] Copier le `database_id` affiché dans `wrangler.toml` (remplace `00000000-0000-0000-0000-000000000000`),
      commit, push.
- [ ] Créer la table (migration `migrations/0001_daily_events.sql`) sur la base distante :

  ```bash
  npx wrangler d1 migrations apply cutova-stats --remote
  ```

- [ ] Liaison : grâce à `wrangler.toml`, Pages lie automatiquement la base sous le nom **`DB`** (Production
      et Preview) au prochain déploiement. Vérifier dans *Workers & Pages* → *cutova* → *Settings* →
      *Bindings* : `DB` → `cutova-stats`.
- [ ] Après déploiement, vérifier qu'un événement est compté :

  ```bash
  curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Content-Type: application/json" --data '{"type":"page_view","page":"/","lang":"en"}' https://exemple.com/api/event
  ```

  Attendu : `204`. Puis :

  ```bash
  npx wrangler d1 execute cutova-stats --remote --command "SELECT day, type, count FROM daily_events ORDER BY day DESC LIMIT 5"
  ```

  Ne **jamais** lancer `npm run seed:demo` contre la base distante (le script refuse `--remote`).

## 5 ter. Protéger `/stats` et `/api/stats` (Cloudflare Access)

Double protection : Cloudflare Access bloque `/stats` et `/api/stats` avant le site, **et** `/api/stats`
vérifie lui-même le jeton Access (signature, audience, émetteur, dates). Sans `ACCESS_TEAM_DOMAIN` et
`ACCESS_AUD`, `/api/stats` répond **403** à tout le monde (fermé par défaut).

- [ ] Ouvrir **Zero Trust** : https://one.dash.cloudflare.com → choisir un *team name* (ex. `cutova`) →
      plan **Free** (0 €, jusqu'à 50 utilisateurs ; Cloudflare peut demander une carte bancaire pour
      activer le plan, sans prélèvement). Ton domaine d'équipe sera `cutova.cloudflareaccess.com`.
- [ ] *Settings* → *Authentication* → *Login methods* : vérifier que **One-time PIN** est activé (code
      reçu par e-mail ; rien d'autre à configurer).
- [ ] *Access* → *Applications* → *Add an application* → **Self-hosted** :
  - *Application name* : `Cutova stats` ; *Session duration* : `24 hours`.
  - *Public hostname* n° 1 : domaine **`exemple.com`**, chemin **`stats`**.
  - *+ Add public hostname* n° 2 : domaine **`exemple.com`**, chemin **`api/stats`**.
  - (Optionnel, recommandé) n° 3 et 4 : les mêmes chemins sur **`cutova.pages.dev`** — sans cela, la page
    `/stats` y reste visible, mais vide : `/api/stats` répond 403 sans jeton.
- [ ] *Policies* → *Add a policy* : nom `Moi seulement`, *Action* **Allow**, *Include* → **Emails** →
      **ton adresse e-mail** (une seule ligne, une seule adresse). Aucune autre règle. *Save*.
- [ ] Ouvrir l'application créée → *Overview* (ou *Basic information*) → copier
      **Application Audience (AUD) Tag**.
- [ ] Ajouter les deux valeurs comme **secrets** du projet Pages (Production) — tableau de bord
      *Workers & Pages* → *cutova* → *Settings* → *Variables and Secrets* → *Add* → type **Secret**, ou :

  ```bash
  npx wrangler pages secret put ACCESS_TEAM_DOMAIN --project-name cutova
  ```

  (valeur : `cutova.cloudflareaccess.com`, sans `https://`)

  ```bash
  npx wrangler pages secret put ACCESS_AUD --project-name cutova
  ```

  (valeur : le tag AUD copié)
- [ ] Redéployer (*Deployments* → *Retry deployment*) pour que les secrets soient pris en compte.
- [ ] Vérifier, dans une fenêtre de navigation privée :
  - `https://exemple.com/stats/` → page de connexion Cloudflare Access → code reçu par e-mail → le tableau
    de bord s'affiche avec les vrais chiffres (pas de badge « Données de démonstration »).
  - Sans connexion, l'API est refusée :

    ```bash
    curl -s -o /dev/null -w "%{http_code}\n" https://cutova.pages.dev/api/stats?period=7
    ```

    Attendu : `403` (ou `302` vers la connexion Access si tu as protégé aussi `cutova.pages.dev`).
  - Une autre adresse e-mail que la tienne ne reçoit **pas** de code.

## 6. Vérifier en production

- [ ] En-têtes :

  ```bash
  curl -sI https://exemple.com/ | grep -i -E "cross-origin|content-security-policy|x-content-type"
  ```

  Attendu : `same-origin`, `require-corp`, une CSP avec `connect-src 'self' https://models.exemple.com`,
  `nosniff`.
- [ ] Ouvrir `https://exemple.com` → console (F12) : `crossOriginIsolated` vaut `true` ; la ligne
      `[cutova] GPU limits: …` s'affiche.
- [ ] Cliquer une image d'exemple → détourage, puis télécharger PNG / WebP / JPG et un ZIP. Onglet
      *Réseau* : seulement `exemple.com` et `models.exemple.com`.
- [ ] Ouvrir `/fr/`, `/pt-br/`, `/es/`, `/id/`, `/sitemap.xml` (index) et `/sitemap-fr.xml`, `/robots.txt`,
      `/llms.txt`, `/<clé IndexNow>.txt` : URL en `https://exemple.com`.
- [ ] Lighthouse (Chrome → F12 → *Lighthouse*, mobile) sur `/`, `/es/`, `/white-background/` : ≥ 95
      partout (en local : 97–100, `docs/review/lighthouse-n5.json`).
- [ ] **Matériel réel** (jamais testé jusqu'ici) : un ordinateur avec carte graphique récente (noter la
      ligne `GPU limits` et le moteur affiché), un iPhone (Safari) et un Android d'entrée de gamme. Noter
      les temps dans `context.md` > Mesures.

## 7. Référencement

- [ ] **Google Search Console** : https://search.google.com/search-console → propriété *Domaine*
      `exemple.com` (validation DNS automatique si le domaine est chez Cloudflare) → *Sitemaps* →
      `https://exemple.com/sitemap.xml` (index : les 5 sitemaps par langue sont découverts automatiquement).
- [ ] **Bing Webmaster Tools** : https://www.bing.com/webmasters → *Import from Google Search Console*.
- [ ] **IndexNow** (Bing, Yandex…), après chaque mise en ligne importante :

  ```bash
  SITE_URL=https://exemple.com INDEXNOW_KEY=<ta clé> node scripts/indexnow-ping.mjs
  ```

  Attendu : `HTTP 200` ou `202`.
- [ ] Quelques jours plus tard : Search Console → *Pages* (indexation), *Améliorations* (FAQ, fil
      d'Ariane), et Bing → *URL inspection*.

---

## Plus tard : changer de modèle

1. Modifier `src/core/model/models.json` (dépôt, révision, SHA-256, `engines`).
2. Relancer `node scripts/fetch-model.mjs`, `node scripts/model-mirror.mjs r2-commands …` et
   `sh upload-r2.sh` (la révision est dans le chemin : aucun ancien fichier réutilisé par erreur).
3. Pousser sur `main` : Cloudflare Pages reconstruit le site.

## En local (rappel)

- `node scripts/fetch-model.mjs` puis `npm run dev` : tout est servi par Vite, sans R2.
- `npm run build && npx playwright test` : toute la suite (voir `docs/QA.md`) ;
  `npm run test:e2e:remote` : simule la production avec un « faux R2 » (relancer `npm run build` après).
- `node scripts/build-showcase.mjs` : régénère les images de l'accueil avec notre modèle.
