// sync.js — sincroniza a fila local com a planilha Google, quando há conexão.
// O endereço do backend (Web App do Google Apps Script) fica salvo no navegador.

const CHAVE_URL_BACKEND = 'bram_backend_url';

// URL padrão já configurada — qualquer aparelho novo usa essa automaticamente,
// sem precisar colar nada na aba Sincronizar. Se um dia trocar de planilha/
// implantação, é só atualizar essa linha aqui (e reidistribuir o app).
const URL_BACKEND_PADRAO = 'https://script.google.com/macros/s/AKfycbwos3Iq_YjiF0p35qjegtyyfEC4rZizGsKngcN9qSMP8y8Oi1FjN2iou_zrrRUCo0jCbg/exec';

function getBackendUrl() {
  return localStorage.getItem(CHAVE_URL_BACKEND) || URL_BACKEND_PADRAO;
}

function setBackendUrl(url) {
  localStorage.setItem(CHAVE_URL_BACKEND, url.trim());
}

async function testarConexaoBackend() {
  const url = getBackendUrl();
  if (!url) return { ok: false, motivo: 'sem-url' };
  try {
    const resp = await fetch(url + '?acao=ping', { method: 'GET' });
    if (!resp.ok) return { ok: false, motivo: 'erro-http-' + resp.status };
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: 'sem-rede' };
  }
}

async function enviarItemFila(url, item) {
  const controlador = new AbortController();
  const tempoLimite = setTimeout(() => controlador.abort(), 30000); // 30s por item
  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' }, // evita preflight CORS no Apps Script
      body: JSON.stringify({
        tabela: item.tabela,
        acao: item.acao,
        registro: item.registro,
      }),
      signal: controlador.signal,
    });
  } finally {
    clearTimeout(tempoLimite);
  }
  if (!resp.ok) throw new Error('Falha ao sincronizar item ' + item.id);
  return resp.json();
}

// Envia tudo que está pendente na fila local, um item por vez.
// Se algo falhar no meio, para e deixa o resto na fila para a próxima tentativa.
async function sincronizarFila(onProgresso) {
  const url = getBackendUrl();
  if (!url) return { enviados: 0, restantes: await BramDB.tamanhoFila(), erro: 'sem-url' };

  const fila = await BramDB.getAll('fila');
  fila.sort((a, b) => (a.criadoEm > b.criadoEm ? 1 : -1));

  let enviados = 0;
  for (const item of fila) {
    try {
      await enviarItemFila(url, item);
      await BramDB.del('fila', item.id);
      enviados++;
      if (onProgresso) onProgresso(enviados, fila.length);
    } catch (e) {
      // Sem rede ou erro no servidor: interrompe e tenta de novo depois.
      return { enviados, restantes: await BramDB.tamanhoFila(), erro: 'interrompido' };
    }
  }
  return { enviados, restantes: 0, erro: null };
}

// Puxa o estado completo do servidor (usado na primeira configuração
// ou quando o usuário pede para "restaurar" os dados da planilha).
async function puxarDoServidor() {
  const url = getBackendUrl();
  if (!url) throw new Error('Configure o endereço do backend primeiro.');

  const controlador = new AbortController();
  const tempoLimite = setTimeout(() => controlador.abort(), 60000); // 60s

  let resp;
  try {
    resp = await fetch(url + '?acao=exportar', { signal: controlador.signal });
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error('A planilha demorou demais pra responder (mais de 60s). Tente de novo — se persistir, pode ser sua planilha estar muito grande.');
    }
    throw new Error('Não foi possível conectar ao servidor: ' + e.message);
  } finally {
    clearTimeout(tempoLimite);
  }

  if (!resp.ok) throw new Error(`Não foi possível ler os dados do servidor (código ${resp.status}).`);
  const dados = await resp.json();

  // Garante que idFluig sempre chegue como texto — mesmo que a planilha
  // mande um número (ex: código sem ponto tipo 10603901), pra não gerar
  // chaves inconsistentes no banco local nem quebrar buscas por texto.
  const normalizarIdFluig = (registro) => {
    if (registro && registro.idFluig !== undefined) registro.idFluig = String(registro.idFluig);
    if (registro && registro.itemCritico !== undefined && registro.itemCritico !== '') {
      registro.itemCritico = registro.itemCritico === true || String(registro.itemCritico).trim().toLowerCase() === 'sim';
    }
    return registro;
  };

  for (const registro of dados.estoque || []) await BramDB.put('estoque', normalizarIdFluig(registro));
  for (const registro of dados.movimentos || []) await BramDB.put('movimentos', normalizarIdFluig(registro));
  // Cabeçalho da requisição e itens agora vêm prontos, cada um da sua aba —
  // não precisa mais reconstruir nada localmente, nem recalcular status
  // (o status "PEDIDO STATUS" já vem certo direto da planilha).
  for (const registro of dados.requisicoes || []) await BramDB.put('requisicoes', registro);
  for (const registro of dados.itensStatus || []) await BramDB.put('itensStatus', normalizarIdFluig(registro));

  return dados;
}

// Tenta sincronizar automaticamente quando a conexão volta.
window.addEventListener('online', () => {
  sincronizarFila().then((r) => {
    document.dispatchEvent(new CustomEvent('bram-sync', { detail: r }));
  });
});

window.BramSync = {
  getBackendUrl,
  setBackendUrl,
  testarConexaoBackend,
  sincronizarFila,
  puxarDoServidor,
};
