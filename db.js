// db.js — camada de armazenamento local (funciona 100% offline)
// Usa IndexedDB para guardar estoque, movimentos, requisições e itens,
// mais uma fila de alterações pendentes que ainda não foram enviadas ao servidor.

const DB_NAME = 'bram-estoque-db';
const DB_VERSION = 1;

const STORES = {
  estoque: 'idFluig',
  movimentos: 'id',
  requisicoes: 'id',
  itensStatus: 'id',
  fila: 'id',
};

let dbPromise = null;

function abrirDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (evt) => {
      const db = evt.target.result;

      if (!db.objectStoreNames.contains('estoque')) {
        db.createObjectStore('estoque', { keyPath: 'idFluig' });
      }
      if (!db.objectStoreNames.contains('movimentos')) {
        const s = db.createObjectStore('movimentos', { keyPath: 'id' });
        s.createIndex('idFluig', 'idFluig');
        s.createIndex('data', 'data');
      }
      if (!db.objectStoreNames.contains('requisicoes')) {
        const s = db.createObjectStore('requisicoes', { keyPath: 'id' });
        s.createIndex('data', 'data');
      }
      if (!db.objectStoreNames.contains('itensStatus')) {
        const s = db.createObjectStore('itensStatus', { keyPath: 'id' });
        s.createIndex('requisicaoId', 'requisicaoId');
        s.createIndex('idFluig', 'idFluig');
      }
      if (!db.objectStoreNames.contains('fila')) {
        db.createObjectStore('fila', { keyPath: 'id', autoIncrement: true });
      }
    };

    req.onsuccess = (evt) => resolve(evt.target.result);
    req.onerror = (evt) => reject(evt.target.error);
  });
  return dbPromise;
}

function tx(storeName, mode = 'readonly') {
  return abrirDB().then((db) => db.transaction(storeName, mode).objectStore(storeName));
}

// --- CRUD genérico ---

async function getAll(storeName) {
  const store = await tx(storeName);
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function get(storeName, key) {
  const store = await tx(storeName);
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function put(storeName, value) {
  const store = await tx(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function del(storeName, key) {
  const store = await tx(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// --- Fila de sincronização ---
// Toda alteração feita offline (ou online) entra aqui, e o sync.js
// tenta esvaziar essa fila sempre que há conexão.

async function enfileirar(tabela, acao, registro) {
  await put('fila', {
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    tabela,
    acao, // 'upsert' | 'delete'
    registro,
    criadoEm: new Date().toISOString(),
  });
}

async function tamanhoFila() {
  const itens = await getAll('fila');
  return itens.length;
}

async function limparFila() {
  const itens = await getAll('fila');
  for (const item of itens) await del('fila', item.id);
}

window.BramDB = {
  abrirDB,
  getAll,
  get,
  put,
  del,
  enfileirar,
  tamanhoFila,
  limparFila,
  STORES,
};
