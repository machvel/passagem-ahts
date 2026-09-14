// sw.js — guarda os arquivos do app em cache para que ele abra mesmo sem internet.
// Só os arquivos do app (HTML/CSS/JS) ficam em cache; os dados em si vivem no IndexedDB.
//
// Estratégia: tenta buscar a versão mais nova na rede primeiro; só usa o
// cache se estiver sem internet. Assim, toda vez que você atualizar um
// arquivo no GitHub, quem tiver internet já pega a versão nova na hora,
// sem precisar lembrar de trocar nenhum número aqui.
const CACHE_NOME = 'bram-estoque-v4';
const ARQUIVOS = [
  './',
  './index.html',
  './styles.css',
  './db.js',
  './sync.js',
  './app.js',
  './scanner.js',
  './ui.js',
  './manifest.json',
  './icone-192.png',
  './icone-512.png',
];

// Cache separado pra biblioteca externa do leitor de código de barras
// (usada só em navegadores sem leitura nativa, tipo Safari/iPhone).
// Guardamos ela aqui pra, depois do primeiro uso, funcionar offline também.
const CACHE_SCANNER = 'bram-scanner-lib-v1';
const HOSTS_SCANNER_EXTERNO = ['unpkg.com', 'cdn.jsdelivr.net'];

self.addEventListener('install', (evt) => {
  evt.waitUntil(
    caches.open(CACHE_NOME).then((cache) => cache.addAll(ARQUIVOS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
  evt.waitUntil(
    caches.keys().then((chaves) =>
      Promise.all(chaves.filter((k) => k !== CACHE_NOME && k !== CACHE_SCANNER).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evt) => {
  if (evt.request.method !== 'GET') return;

  const url = new URL(evt.request.url);

  // Biblioteca externa do leitor de código de barras: guarda em cache
  // assim que baixar, e reusa depois — mesmo offline.
  if (HOSTS_SCANNER_EXTERNO.includes(url.hostname)) {
    evt.respondWith(
      caches.open(CACHE_SCANNER).then((cache) =>
        cache.match(evt.request).then((resposta) => {
          if (resposta) return resposta;
          return fetch(evt.request).then((resposta_rede) => {
            cache.put(evt.request, resposta_rede.clone());
            return resposta_rede;
          });
        })
      )
    );
    return;
  }

  // Só intercepta pedidos dos próprios arquivos do app (GET, mesma origem).
  // Chamadas ao backend do Google Apps Script passam direto (precisam de rede).
  if (!evt.request.url.startsWith(self.location.origin)) return;

  // Network-first: tenta buscar fresco na rede; se conseguir, atualiza o
  // cache também (pra próxima vez offline já estar com a versão nova).
  // Se a rede falhar (sem internet), usa o que tiver em cache.
  evt.respondWith(
    fetch(evt.request)
      .then((resposta_rede) => {
        const copia = resposta_rede.clone();
        caches.open(CACHE_NOME).then((cache) => cache.put(evt.request, copia));
        return resposta_rede;
      })
      .catch(() => caches.match(evt.request))
  );
});
