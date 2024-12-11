const urlsToCache = [
  "/",
  "/index.html",
  "/favicon.ico",
  "/assets/tracepaper-icon.png",
  "/assets/logo.png",
  "/assets/draftsman-logo.png",
  "/auth/index.html",
  "/configuration/index.html",
  "/css/ide.css",
  "/css/draftsman.css",
  "/js/config/configuration.js",
  "/js/config/setup.js",
  "/js/config/configuration-staging.js",
  "/js/tp/mode-html.js",
  "/js/tp/ace-python.js",
  "/js/tp/xml-builder.js",
  "/js/tp/vis.js",
  "/js/tp/showdown.js",
  "/js/tp/theme-github.js",
  "/js/tp/ace-editor.js",
  "/js/tp/vimeshui.js",
  "/js/tp/minisearch.js",
  "/js/tp/isomorphic-git.js",
  "/js/tp/ace-language.js",
  "/js/tp/luxon.js",
  "/js/tp/alpine.js",
  "/js/tp/tailwind.js",
  "/js/tp/theme-github_dark.js",
  "/js/tp/lightning-fs.js",
  "/js/tp/fast-xml-parser.js",
  "/js/tp/diff.js",
  "/js/tp/http.js",
  "/js/tp/alpine-persist.js",
  "/js/tp/snippets/python.js",
  "/js/utils/database.js",
  "/js/utils/modeler.js",
  "/js/utils/git.js",
  "/js/utils/searchindex.js",
  "/js/utils/diagram.js",
  "/js/utils/custom-completer.js",
  "/js/utils/api.js",
  "/js/utils/helper.js",
  "/js/modules/modeler/expressions.js",
  "/js/modules/modeler/notifier.js",
  "/js/modules/modeler/aggregate-entity.js",
  "/js/modules/modeler/basic-file.js",
  "/js/modules/modeler/domain-event.js",
  "/js/modules/modeler/modeler-template.js",
  "/js/modules/modeler/configuration.js",
  "/js/modules/modeler/aggregate-root.js",
  "/js/modules/modeler/behavior.js",
  "/js/modules/modeler/patterns.js",
  "/js/modules/modeler/command.js",
  "/js/modules/modeler/projection.js",
  "/js/modules/modeler/view.js",
  "/js/modules/modeler/model-wizard.js",
  "/js/modules/modeler/scenario.js",
  "/js/modules/navigation/source-management.js",
  "/js/modules/navigation/context-management.js",
  "/js/modules/navigation/navigation.js",
  "/js/modules/navigation/file-browser.js",
  "/js/modules/navigation/settings.js",
  "/js/modules/utilities/markdown-editor.js",
  "/js/modules/utilities/input-validator.js",
  "/js/modules/utilities/info-card.js",
  "/js/modules/examples/fulltext-search-storage-example.js",
  "/js/modules/examples/documentdb-example.js",
  "/js/modules/examples/git-example.js",
  "/js/modules/examples/api-example.js",
  "/js/modules/visuals/treemap.js",
  "/js/modules/visuals/diagram-small.js",
  "/js/modules/visuals/diagram-only.js",
  "/js/webworkers/modelValidatorWorker.js",
  "/js/webworkers/apiWorker.js",
  "/js/webworkers/gitWorker.js",
  "/js/webworkers/miniSearchWorker.js",
  "/js/webworkers/dbWorker.js",
  "/js/webworkers/modelVisualizerWorker.js",
  "/components/file-browser.html",
  "/components/model-wizard.html",
  "/components/menu-bar.html",
  "/components/settings.html",
  "/components/tab-bar.html",
  "/components/modeler/view-data-sources.html",
  "/components/modeler/notifier-flow.html",
  "/components/modeler/python.html",
  "/components/modeler/patterns.html",
  "/components/modeler/notifier-trigger.html",
  "/components/modeler/scenario.html",
  "/components/modeler/command.html",
  "/components/modeler/aggregate.html",
  "/components/modeler/readme.html",
  "/components/modeler/view-queries.html",
  "/components/modeler/projection.html",
  "/components/modeler/notifier.html",
  "/components/modeler/behavior-flow.html",
  "/components/modeler/behavior-trigger.html",
  "/components/modeler/dummy-page.html",
  "/components/modeler/view.html",
  "/components/modeler/template.html",
  "/components/modeler/diagram.html",
  "/components/modeler/domain-event.html",
  "/components/modeler/aggregate-entity.html",
  "/components/modeler/behavior.html",
  "/components/modeler/expressions.html",
  "/components/modeler/behavior-tests.html",
  "/components/modeler/roles.html",
  "/components/modeler/dependencies.html",
  "/components/modeler/view-data.html",
  "/components/elements/embedded-diagram.html",
  "/components/elements/input.html",
  "/components/elements/trace-notifications.html",
  "/components/pages/git-example.html",
  "/components/pages/documentdb-example.html",
  "/components/pages/fulltext-search-example.html",
  "/components/pages/api-example.html"
];

//generator-devider//

const CACHE_NAME = 'tracepaper-dynamic-cache-v1';
// Install: Cache alleen de basisbestanden
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(urlsToCache);
    })
  );
});

// Fetch: Probeer eerst het netwerk, gebruik cache als fallback
self.addEventListener('fetch', event => {
  // Controleer of de methode van het verzoek 'GET' is
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(networkResponse => {
        // Voeg alleen GET-verzoeken aan de cache toe
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      })
      .catch(() => {
        // Fallback naar cache als netwerk faalt
        return caches.match(event.request).then(cachedResponse => {
          // Laat een offline-pagina zien als de resource niet in cache zit
          return cachedResponse || caches.match('/offline.html');
        });
      })
  );
});

// Activate: Verwijder oude caches bij een nieuwe versie
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (!cacheWhitelist.includes(cacheName)) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});