/* ============================================================
   SERVICE WORKER — PWA do Dia a Dia
   ------------------------------------------------------------
   Estratégia:
   - CACHE DOS ARQUIVOS PRÓPRIOS (HTML/CSS/JS/JSON/ícones):
     cache-first — o app abre INSTANTÂNEO e funciona OFFLINE
     (a lista de linhas já carregada continua disponível);
   - APIS EXTERNAS (ViaCEP, OSRM, MapLibre tiles, Olho Vivo, Nominatim):
     network-only — dados de mapa/localização não fazem sentido
     offline e não devem ser "congelados".
   ============================================================ */

const CACHE = "diaadia-v1";

const ARQUIVOS_APP = [
  "./",
  "./manifest.json",
  "./paginas/index.html",
  "./paginas/onibus.html",
  "./paginas/relogio.html",
  "./paginas/financas.html",
  "./paginas/anotacoes.html",
  "./paginas/lista_tarefas.html",
  "./recursos/css/style.css",
  "./recursos/js/script.js",
  "./recursos/js/onibus.js",
  "./dados/onibus.json",
  "./recursos/img/icon-192.png",
  "./recursos/img/icon-512.png",
];

/* Instalação: pré-cacheia tudo do app */
self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ARQUIVOS_APP)),
  );
  self.skipWaiting();
});

/* Ativação: apaga caches antigos (quando a versão muda) */
self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((chaves) =>
        Promise.all(
          chaves.filter((c) => c !== CACHE).map((c) => caches.delete(c)),
        ),
      ),
  );
  self.clients.claim();
});

/* Interceptor de requisições */
self.addEventListener("fetch", (evento) => {
  const url = evento.request.url;

  // APIs externas: sempre rede (não cachear dados dinâmicos)
  const externas =
    url.includes("viacep") ||
    url.includes("nominatim") ||
    url.includes("osrm") ||
    url.includes("openfreemap") ||
    url.includes("unpkg.com") ||
    url.includes("olhovivo") ||
    url.includes("sptrans");

  if (externas) return; // deixa passar sem interceptar

  // Arquivos do app: cache-first (offline OK)
  evento.respondWith(
    caches.match(evento.request).then(
      (doCache) =>
        doCache ||
        fetch(evento.request).then((resposta) => {
          // guarda cópia para a próxima visita offline
          const copia = resposta.clone();
          caches.open(CACHE).then((cache) => cache.put(evento.request, copia));
          return resposta;
        }),
    ),
  );
});
