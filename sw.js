const CACHE = 'financas-v93';

const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'css/fonts/fraunces-700.woff2',
  'js/app.js',
  'js/edition.js',
  'js/categories.js',
  'js/category-icons.js',
  'js/icon-library.js',
  'js/voice.js',
  'js/charts.js',
  'js/db.js',
  'js/format.js',
  'js/stats.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/despesas-fixas.svg',
  'icons/rifa-faculdade.svg',
  'icons/academia.svg',
  'icons/internet.svg',
  'icons/faculdade.svg',
  'icons/cabelo.svg',
  'icons/papel-de-agua.svg',
  'icons/despesas-variaveis.svg',
  'icons/ic_uber.jpg',
  'icons/vestuario.svg',
  'icons/outros.svg',
  'icons/emergencia.svg',
  'icons/receita.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Rede primeiro para receber atualizações; sem conexão, responde com o que está em cache.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  event.respondWith(
    fetch(request)
      .then(async (response) => {
        if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        if (request.mode === 'navigate') return caches.match('index.html');
        return Response.error();
      }),
  );
});
