// ==========================================================================
// sw.js — le "service worker" : un petit programme que le navigateur garde
// en arrière-plan. Il enregistre une copie de l'appli sur le téléphone pour
// qu'elle s'ouvre même sans réseau (salle de sport qui capte mal).
//
// Stratégie :
//  - La page (index.html) : on essaie d'abord le réseau, pour avoir toujours
//    la dernière version ; si ça ne répond pas en 3 secondes ou s'il n'y a pas
//    de réseau, on sert la copie enregistrée.
//  - Les fichiers versionnés (style.css?v=10, js/app.js?v=10...) : la copie
//    enregistrée suffit, puisqu'une nouvelle version change leur adresse (?v=11).
//  - Chart.js et les polices (sites externes) : copie enregistrée en priorité.
// Tes DONNÉES ne passent jamais par ici : elles restent dans le stockage local.
// ==========================================================================

const CACHE_NAME = "carnet-cache-v1";
const NETWORK_TIMEOUT_MS = 3000;

const BASE_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icons/apple-touch-icon.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/favicon-32.png",
];

/** Liste les fichiers dont la page a besoin (scripts, styles, icônes, polices, Chart.js). */
function extractAssetUrls(html) {
  const urls = new Set();
  const pattern = /(?:src|href)="([^"#]+)"/g;
  let match;
  while ((match = pattern.exec(html))) {
    const raw = match[1].replace(/&amp;/g, "&");
    if (/\.(js|css|png|webmanifest)(\?|$)/.test(raw) || raw.includes("fonts.googleapis.com/css2")) {
      urls.add(new URL(raw, self.registration.scope).href);
    }
  }
  return [...urls];
}

/** Enregistre une adresse sans faire échouer le reste si elle ne répond pas. */
async function cacheQuietly(cache, url) {
  try {
    const sameOrigin = new URL(url).origin === self.location.origin;
    const response = await fetch(new Request(url, { mode: sameOrigin ? "same-origin" : "cors", cache: "no-cache" }));
    if (response.ok) await cache.put(url, response);
  } catch (error) { /* hors ligne ou site indisponible : ce sera fait plus tard */ }
}

// Installation : on enregistre la page et tout ce qu'elle charge
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(BASE_FILES.map((url) => cacheQuietly(cache, new URL(url, self.registration.scope).href)));
    const page = await cache.match(new URL("./index.html", self.registration.scope).href);
    if (page) {
      const html = await page.clone().text();
      await Promise.all(extractAssetUrls(html).map((url) => cacheQuietly(cache, url)));
    }
    await self.skipWaiting();
  })());
});

// Activation : on supprime les anciennes réserves et on prend la main tout de suite
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

/**
 * Après chaque nouvelle version de la page, on enregistre ses fichiers et on
 * supprime ceux des versions précédentes (?v= plus ancien) pour ne pas
 * accumuler de copies inutiles sur le téléphone.
 */
async function refreshAssetsFromPage(html) {
  const cache = await caches.open(CACHE_NAME);
  const wanted = new Set(extractAssetUrls(html));
  await Promise.all([...wanted].map(async (url) => {
    if (!(await cache.match(url))) await cacheQuietly(cache, url);
  }));
  const keys = await cache.keys();
  await Promise.all(keys.map((request) => {
    const url = new URL(request.url);
    const isOldVersion = url.origin === self.location.origin && url.searchParams.has("v") && !wanted.has(request.url);
    return isOldVersion ? cache.delete(request) : null;
  }));
}

async function handlePage(event) {
  const cache = await caches.open(CACHE_NAME);
  const pageKey = new URL("./index.html", self.registration.scope).href;

  const fromNetwork = fetch(event.request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      const saving = (async () => {
        await cache.put(pageKey, copy.clone());
        await refreshAssetsFromPage(await copy.text());
      })();
      // Si la copie enregistrée a déjà été servie, l'événement est terminé :
      // l'enregistrement continue quand même, on ignore juste l'erreur.
      try { event.waitUntil(saving); } catch (error) { /* rien à faire */ }
    }
    return response;
  });

  const cached = await cache.match(pageKey);
  if (!cached) return fromNetwork; // première visite : il faut le réseau

  // Réseau d'abord, mais sans attendre plus de 3 s : sinon la copie enregistrée
  const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), NETWORK_TIMEOUT_MS));
  return Promise.race([fromNetwork.catch(() => cached), timeout]);
}

async function handleAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok || response.type === "opaque") cache.put(request, response.clone());
    return response;
  } catch (error) {
    // Fichier non versionné (ex. icône) : on tente sans les paramètres d'adresse
    const fallback = await cache.match(request, { ignoreSearch: true });
    if (fallback) return fallback;
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (!url.protocol.startsWith("http")) return;

  if (request.mode === "navigate") {
    event.respondWith(handlePage(event));
    return;
  }
  const sameOrigin = url.origin === self.location.origin;
  const versioned = sameOrigin && url.searchParams.has("v");
  const external = /(^|\.)(jsdelivr\.net|googleapis\.com|gstatic\.com)$/.test(url.hostname);
  if (versioned || external) {
    event.respondWith(handleAsset(request));
    return;
  }
  if (sameOrigin) {
    // Autres fichiers du site (icônes, manifeste) : réseau d'abord, copie si hors ligne
    event.respondWith(fetch(request).catch(async () => (await caches.match(request)) || Response.error()));
  }
});
