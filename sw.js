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

const CACHE = "diaadia-v3"; // v3: SW robusto (same-origin, catch offline) + index raiz + anti-XSS

const ARQUIVOS_APP = [
  "./",
  "./index.html",
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

  // Só intercepta requisições do PRÓPRIO domínio (GET)
  // APIs externas (ViaCEP, OSRM, tiles...) passam direto, sem cachear
  if (evento.request.method !== "GET") return;
  if (new URL(url).origin !== self.location.origin) return;

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
    ).catch(() =>
      // Offline e sem cópia em cache: responde sem quebrar (não deixa
      // o respondWith estourar exceção não tratada no navegador)
      new Response("Offline: arquivo não disponível no cache.", {
        status: 504,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      }),
    ),
  );
});
