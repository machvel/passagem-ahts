// ui.js — liga a interface (estilo AppSheet: listas + FAB + bottom sheets)
// às regras de negócio de app.js/db.js/sync.js.

const NOME_TELA = { estoque: 'Estoque', requisicoes: 'Requisições', movimentos: 'Últimos movimentos', sincronizar: 'Sincronizar' };

function irParaAba(aba) {
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('ativo', b.dataset.aba === aba));
  document.querySelectorAll('.tela').forEach((t) => t.classList.add('oculta'));
  document.getElementById('tela-' + aba).classList.remove('oculta');
  document.getElementById('tituloTela').textContent = NOME_TELA[aba];

  // Fecha o painel de detalhe do item (Estoque), se estiver aberto — senão
  // ele fica flutuando por cima da tela nova, já que é um overlay fixo.
  document.getElementById('modalDetalheItem').classList.add('oculta');
  document.querySelector('.app-shell').classList.remove('detalhe-aberto');

  const fab = document.getElementById('fabAdicionar');
  fab.classList.toggle('oculto', aba === 'sincronizar' || aba === 'movimentos');
  // No celular, Sincronizar e Últimos movimentos só são acessíveis pelo menu
  // ☰ (somem da barra de baixo). No computador, o CSS mostra tudo sempre.

  if (aba === 'requisicoes') renderRequisicoes();
  if (aba === 'estoque') renderEstoque();
  if (aba === 'movimentos') renderMovimentos();
}

document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => irParaAba(btn.dataset.aba));
});

// ---------- Menu lateral (drawer) ----------

function abrirDrawer() {
  document.getElementById('drawer').classList.remove('oculto');
  document.getElementById('drawerFundo').classList.remove('oculta');
}
function fecharDrawer() {
  document.getElementById('drawer').classList.add('oculto');
  document.getElementById('drawerFundo').classList.add('oculta');
}
document.getElementById('btnMenu').addEventListener('click', abrirDrawer);
document.getElementById('drawerFundo').addEventListener('click', fecharDrawer);
document.querySelectorAll('.drawer-item').forEach((btn) => {
  btn.addEventListener('click', () => { irParaAba(btn.dataset.aba); fecharDrawer(); });
});

function abaAtiva() {
  return document.getElementById('tela-sincronizar').classList.contains('oculta')
    ? (document.getElementById('tela-requisicoes').classList.contains('oculta') ? 'estoque' : 'requisicoes')
    : 'sincronizar';
}

function mostrarMensagem(elId, texto, tipo) {
  const el = document.getElementById(elId);
  el.textContent = texto;
  el.className = 'mensagem' + (tipo ? ' ' + tipo : '');
}

function abrirSheet(id) { document.getElementById(id).classList.remove('oculta'); }
function fecharSheet(id) { document.getElementById(id).classList.add('oculta'); }

let modoEdicaoItem = false;
function definirModoFormMovimento(edicao) {
  modoEdicaoItem = edicao;
  document.getElementById('segmentoTipoMov').classList.toggle('oculto-flex', edicao);
  document.getElementById('campoQuantidadeMov').classList.toggle('oculto-flex', edicao);
  document.getElementById('campoQuantidadeAtual').classList.toggle('oculto-flex', !edicao);
  document.getElementById('movQuantidade').required = !edicao;
  document.getElementById('tituloFormMovimento').textContent = edicao ? 'Editar item' : 'Registrar movimento';
  document.getElementById('sheetCaixaMovimento').classList.toggle('sheet-caixa-escura', edicao);
}

document.getElementById('fabAdicionar').addEventListener('click', () => {
  if (abaAtiva() === 'estoque') { definirModoFormMovimento(false); abrirSheet('modalMovimento'); }
  else if (abaAtiva() === 'requisicoes') abrirSheet('modalRequisicao');
});
document.getElementById('btnCancelarMovimento').addEventListener('click', () => fecharSheet('modalMovimento'));
document.getElementById('btnCancelarRequisicao').addEventListener('click', () => {
  fecharSheet('modalRequisicao');
  delete document.getElementById('formRequisicao').dataset.editando;
  document.getElementById('tituloFormRequisicao').textContent = 'Nova requisição';
  document.getElementById('btnCriarOuSalvarRequisicao').textContent = 'Criar requisição';
  document.getElementById('formRequisicao').reset();
  atualizarVisibilidadeTipo();
});

// ---------- Foto do item (captura + compressão) ----------
// Reduzida pra caber com folga no limite de ~50.000 caracteres de uma
// célula do Google Sheets (a foto agora sincroniza com a planilha).
const LIMITE_SEGURO_FOTO = 45000;

let fotoAtualBase64 = '';

function comprimirImagem(arquivo, maxLado = 320, qualidade = 0.5) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxLado) { height = Math.round(height * (maxLado / width)); width = maxLado; }
        else if (height > maxLado) { width = Math.round(width * (maxLado / height)); height = maxLado; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        let dataUrl = canvas.toDataURL('image/jpeg', qualidade);
        // Se ainda estiver grande demais, comprime mais uma vez, bem mais agressivo.
        if (dataUrl.length > LIMITE_SEGURO_FOTO) {
          dataUrl = canvas.toDataURL('image/jpeg', 0.3);
        }
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = leitor.result;
    };
    leitor.onerror = reject;
    leitor.readAsDataURL(arquivo);
  });
}

document.getElementById('movFoto').addEventListener('change', async (evt) => {
  const arquivo = evt.target.files[0];
  if (!arquivo) return;
  mostrarMensagem('msgFoto', 'Processando foto…');
  try {
    fotoAtualBase64 = await comprimirImagem(arquivo);
    const preview = document.getElementById('fotoPreview');
    preview.src = fotoAtualBase64;
    preview.classList.remove('oculto-flex');
    document.getElementById('btnRemoverFoto').classList.remove('oculto-flex');
    const kb = Math.round((fotoAtualBase64.length * 0.75) / 1024);
    mostrarMensagem('msgFoto', `Foto pronta (~${kb} KB).`, 'ok');
  } catch (e) {
    mostrarMensagem('msgFoto', 'Não foi possível processar a foto.', 'erro');
  }
});

document.getElementById('btnRemoverFoto').addEventListener('click', () => {
  if (!confirm('Remover esta foto?')) return;
  fotoAtualBase64 = '';
  document.getElementById('movFoto').value = '';
  document.getElementById('fotoPreview').classList.add('oculto-flex');
  document.getElementById('btnRemoverFoto').classList.add('oculto-flex');
  mostrarMensagem('msgFoto', '');
});

function limparFoto() {
  fotoAtualBase64 = '';
  document.getElementById('fotoPreview').classList.add('oculto-flex');
  document.getElementById('btnRemoverFoto').classList.add('oculto-flex');
  mostrarMensagem('msgFoto', '');
}

// ---------- Seletor de cores (Prateleira) ----------

document.querySelectorAll('.seletor-cores').forEach((grupo) => {
  const alvo = document.getElementById(grupo.dataset.alvo);
  grupo.querySelectorAll('.cor-bolinha').forEach((bolinha) => {
    bolinha.addEventListener('click', () => {
      grupo.querySelectorAll('.cor-bolinha').forEach((b) => b.classList.remove('selecionada'));
      bolinha.classList.add('selecionada');
      alvo.value = bolinha.dataset.cor;
    });
  });
});

function limparSeletorCor(grupoEl) {
  grupoEl.querySelectorAll('.cor-bolinha').forEach((b) => b.classList.remove('selecionada'));
  document.getElementById(grupoEl.dataset.alvo).value = '';
}

// ---------- Status de conexão + fila ----------

let sincronizandoAgora = false;

async function atualizarStatusConexao() {
  const luz = document.getElementById('luzConexao');
  const texto = document.getElementById('textoConexao');
  const pendentes = await BramDB.tamanhoFila();
  const contador = document.getElementById('contadorFila');
  if (contador) contador.textContent = pendentes;

  if (!navigator.onLine) {
    luz.className = 'dot offline';
    texto.textContent = 'offline';
  } else if (pendentes > 0) {
    luz.className = 'dot pendente';
    texto.textContent = 'sincronizando…';
  } else {
    luz.className = 'dot online';
    texto.textContent = 'sincronizado';
  }

  // Tenta sincronizar sozinho sempre que há conexão e algo pendente,
  // sem precisar a pessoa tocar em nada.
  if (navigator.onLine && pendentes > 0 && !sincronizandoAgora && BramSync.getBackendUrl()) {
    sincronizandoAgora = true;
    try {
      await BramSync.sincronizarFila();
    } finally {
      sincronizandoAgora = false;
      const restam = await BramDB.tamanhoFila();
      const luz2 = document.getElementById('luzConexao');
      const texto2 = document.getElementById('textoConexao');
      if (restam > 0) {
        luz2.className = 'dot pendente';
        texto2.textContent = restam + ' pendente(s)';
      } else {
        luz2.className = 'dot online';
        texto2.textContent = 'sincronizado';
      }
      if (contador) contador.textContent = restam;
    }
  }
}

window.addEventListener('online', atualizarStatusConexao);
window.addEventListener('offline', atualizarStatusConexao);
document.addEventListener('bram-sync', atualizarStatusConexao);

// ---------- ESTOQUE ----------

let tipoMovimentoSelecionado = 'entrada';
document.querySelectorAll('.seg-tipo').forEach((btn) => {
  btn.addEventListener('click', () => {
    tipoMovimentoSelecionado = btn.dataset.tipo;
    document.querySelectorAll('.seg-tipo').forEach((b) => b.classList.remove('selecionado-entrada', 'selecionado-saida'));
    btn.classList.add(tipoMovimentoSelecionado === 'entrada' ? 'selecionado-entrada' : 'selecionado-saida');
  });
});

function inicial(nome) {
  return (nome || '?').trim().charAt(0).toUpperCase();
}

const CORES_PRATELEIRA = {
  Green: '#34A853', Yellow: '#FBBC04', Orange: '#FA7B17', Red: '#EA4335',
  Purple: '#9C27B0', Blue: '#4285F4', White: '#FFFFFF', Black: '#202124',
};

function localCompleto(i) {
  const bolinhaPrateleira = i.prateleira
    ? `<span class="bolinha-inline" style="background:${CORES_PRATELEIRA[i.prateleira] || '#ccc'}"></span>`
    : '';
  const endereco = [bolinhaPrateleira, i.coluna && `Col. ${i.coluna}`, i.linha && `Lin. ${i.linha}`].filter(Boolean).join(' · ');
  return [i.local, endereco].filter(Boolean).join(' · ') || 'sem local';
}

function avatarItem(i) {
  if (i.foto) return `<img class="card-avatar-img" src="${i.foto}" alt="${i.nome}" />`;
  return `<div class="card-avatar">${inicial(i.nome)}</div>`;
}

async function renderEstoque() {
  const filtro = (document.getElementById('buscaEstoque').value || '').toLowerCase();
  const bate = (i) => !filtro
    || String(i.nome || '').toLowerCase().includes(filtro)
    || String(i.idFluig || '').toLowerCase().includes(filtro)
    || String(i.pn || '').toLowerCase().includes(filtro)
    || String(i.marca || '').toLowerCase().includes(filtro)
    || String(i.obs || '').toLowerCase().includes(filtro);
  const itens = (await BramDB.getAll('estoque'))
    .filter(bate)
    .sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || '')));
  const container = document.getElementById('listaEstoqueCards');
  container.innerHTML = itens.map((i) => `
    <div class="card-item card-item--clicavel" data-idfluig="${i.idFluig}">
      ${avatarItem(i)}
      <div class="card-item-info">
        <div class="card-item-nome">${i.nome}</div>
        <div class="card-item-sub"><span>${i.idFluig}</span><span>${localCompleto(i)}</span></div>
      </div>
      <div class="card-item-qtd">${i.quantidade}</div>
    </div>`).join('') || '<div class="lista-vazia">Nenhum item encontrado. Toque em + para lançar.</div>';
  container.querySelectorAll('.card-item--clicavel').forEach((card) => {
    card.addEventListener('click', () => abrirDetalheItem(card.dataset.idfluig));
  });

  const datalist = document.getElementById('listaEstoque');
  datalist.innerHTML = itens.map((i) => `<option value="${i.idFluig}">${i.nome}</option>`).join('');
}

async function renderMovimentos() {
  const movs = (await BramDB.getAll('movimentos')).sort((a, b) => (a.data < b.data ? 1 : -1)).slice(0, 30);
  document.getElementById('listaMovimentosCards').innerHTML = movs.map((m) => `
    <div class="card-item ${m.tipo === 'entrada' ? 'mov-entrada-borda' : 'mov-saida-borda'}">
      <div class="card-avatar">${inicial(m.nome)}</div>
      <div class="card-item-info">
        <div class="card-item-nome"><span class="icone-mov ${m.tipo === 'entrada' ? 'mov-entrada' : 'mov-saida'}">${m.tipo === 'entrada' ? '↓' : '↑'}</span>${m.nome}</div>
        <div class="card-item-sub"><span>${fmtData(m.data)}</span><span>${m.responsavel || '—'}</span></div>
      </div>
      <div class="card-item-qtd" style="background:none;color:var(--texto-fraco)">${m.quantidade}</div>
    </div>`).join('') || '<div class="lista-vazia">Nenhum movimento ainda.</div>';
}

document.getElementById('buscaEstoque').addEventListener('input', renderEstoque);

document.getElementById('btnScanBusca').addEventListener('click', () => {
  BramScanner.abrirScanner((codigo) => {
    const campo = document.getElementById('buscaEstoque');
    campo.value = codigo;
    renderEstoque();
  });
});

document.getElementById('btnScanBuscaReq').addEventListener('click', () => {
  BramScanner.abrirScanner((codigo) => {
    const campo = document.getElementById('buscaRequisicoes');
    campo.value = codigo;
    renderRequisicoes();
  });
});

// ---------- Detalhe do item + ajuste rápido de quantidade ----------

let itemDetalheAtual = null;

async function abrirDetalheItem(idFluig) {
  const item = await BramDB.get('estoque', idFluig);
  if (!item) return;
  itemDetalheAtual = item;
  renderDetalheItem();
  document.getElementById('modalDetalheItem').classList.remove('oculta');
  document.querySelector('.app-shell').classList.add('detalhe-aberto');
}

function renderDetalheItem() {
  const item = itemDetalheAtual;
  document.getElementById('detalheNome').textContent = item.nome;
  document.getElementById('detalheCodigo').textContent = item.idFluig;

  const foto = document.getElementById('detalheFoto');
  const avatar = document.getElementById('detalheAvatar');
  if (item.foto) {
    foto.src = item.foto; foto.classList.remove('oculto-flex');
    avatar.classList.add('oculto-flex');
  } else {
    avatar.textContent = inicial(item.nome); avatar.classList.remove('oculto-flex');
    foto.classList.add('oculto-flex');
  }

  document.getElementById('detalhePn').textContent = item.pn || '—';
  document.getElementById('detalheItemCritico').textContent = item.itemCritico === true ? 'Sim' : item.itemCritico === false ? 'Não' : '—';
  document.getElementById('detalheMarca').textContent = item.marca || '—';
  document.getElementById('detalheLocal').textContent = item.local || '—';
  const corBolinha = item.prateleira
    ? `<span class="bolinha-inline" style="background:${CORES_PRATELEIRA[item.prateleira] || '#ccc'}"></span> ${item.prateleira}`
    : '—';
  document.getElementById('detalhePrateleira').innerHTML = corBolinha;
  document.getElementById('detalheColuna').textContent = item.coluna || '—';
  document.getElementById('detalheLinha').textContent = item.linha || '—';
  document.getElementById('detalheObs').textContent = item.obs || '—';
  document.getElementById('detalheQuantidade').textContent = item.quantidade;
  document.getElementById('btnDiminuir').disabled = item.quantidade <= 0;
}

document.getElementById('btnAumentar').addEventListener('click', async () => {
  try {
    await BramApp.registrarMovimento({ idFluig: itemDetalheAtual.idFluig, nome: itemDetalheAtual.nome, tipo: 'entrada', quantidade: 1 });
    itemDetalheAtual = await BramDB.get('estoque', itemDetalheAtual.idFluig);
    renderDetalheItem();
    await renderEstoque();
    await atualizarStatusConexao();
  } catch (e) {
    mostrarMensagem('msgDetalheItem', e.message, 'erro');
  }
});

document.getElementById('btnDiminuir').addEventListener('click', async () => {
  try {
    await BramApp.registrarMovimento({ idFluig: itemDetalheAtual.idFluig, nome: itemDetalheAtual.nome, tipo: 'saida', quantidade: 1 });
    itemDetalheAtual = await BramDB.get('estoque', itemDetalheAtual.idFluig);
    renderDetalheItem();
    await renderEstoque();
    await atualizarStatusConexao();
  } catch (e) {
    mostrarMensagem('msgDetalheItem', e.message, 'erro');
  }
});

document.getElementById('detalheFoto').addEventListener('click', () => {
  const src = document.getElementById('detalheFoto').src;
  if (!src) return;
  document.getElementById('fotoAmpliadaImg').src = src;
  document.getElementById('modalFotoAmpliada').classList.remove('oculta');
});
document.getElementById('btnFecharFotoAmpliada').addEventListener('click', () => {
  document.getElementById('modalFotoAmpliada').classList.add('oculta');
});
document.getElementById('modalFotoAmpliada').addEventListener('click', (evt) => {
  if (evt.target.id === 'modalFotoAmpliada') evt.currentTarget.classList.add('oculta');
});

document.getElementById('btnVoltarDetalheItem').addEventListener('click', () => {
  document.getElementById('modalDetalheItem').classList.add('oculta');
  document.querySelector('.app-shell').classList.remove('detalhe-aberto');
  mostrarMensagem('msgDetalheItem', '');
});

document.getElementById('btnEditarDetalhes').addEventListener('click', () => {
  document.getElementById('modalDetalheItem').classList.add('oculta');
  document.querySelector('.app-shell').classList.remove('detalhe-aberto');
  const item = itemDetalheAtual;
  definirModoFormMovimento(true);
  document.getElementById('formMovimento').dataset.idFluigOriginal = item.idFluig;
  document.getElementById('movQuantidadeAtual').value = item.quantidade;
  document.getElementById('movIdFluig').value = item.idFluig;
  document.getElementById('movNome').value = item.nome;
  document.getElementById('movPn').value = item.pn || '';
  document.getElementById('movMarca').value = item.marca || '';
  document.getElementById('movItemCritico').value = item.itemCritico === true ? 'Sim' : item.itemCritico === false ? 'Não' : '';
  document.getElementById('movLocal').value = item.local || '';
  document.getElementById('movColuna').value = item.coluna || '';
  document.getElementById('movLinha').value = item.linha || '';
  document.getElementById('movObservacao').value = item.obs || '';
  if (item.foto) {
    const preview = document.getElementById('fotoPreview');
    preview.src = item.foto; preview.classList.remove('oculto-flex');
    document.getElementById('btnRemoverFoto').classList.remove('oculto-flex');
    fotoAtualBase64 = item.foto;
  }
  if (item.prateleira) {
    const bolinha = document.querySelector(`#modalMovimento .cor-bolinha[data-cor="${item.prateleira}"]`);
    if (bolinha) bolinha.classList.add('selecionada');
    document.getElementById('movPrateleira').value = item.prateleira;
  }
  abrirSheet('modalMovimento');
});

document.getElementById('btnExcluirItemEstoque').addEventListener('click', async () => {
  if (!confirm(`Excluir "${itemDetalheAtual.nome}" do estoque? Essa ação não pode ser desfeita.`)) return;
  try {
    await BramApp.excluirItemEstoque(itemDetalheAtual.idFluig);
    document.getElementById('modalDetalheItem').classList.add('oculta');
    document.querySelector('.app-shell').classList.remove('detalhe-aberto');
    await renderEstoque();
    await atualizarStatusConexao();
  } catch (e) {
    mostrarMensagem('msgDetalheItem', e.message, 'erro');
  }
});

document.getElementById('formMovimento').addEventListener('submit', async (evt) => {
  evt.preventDefault();
  const dadosComuns = {
    idFluig: document.getElementById('movIdFluig').value.trim(),
    nome: document.getElementById('movNome').value.trim(),
    pn: document.getElementById('movPn').value.trim(),
    marca: document.getElementById('movMarca').value.trim(),
    itemCritico: document.getElementById('movItemCritico').value,
    local: document.getElementById('movLocal').value.trim(),
    prateleira: document.getElementById('movPrateleira').value.trim(),
    coluna: document.getElementById('movColuna').value.trim(),
    linha: document.getElementById('movLinha').value.trim(),
    observacao: document.getElementById('movObservacao').value.trim(),
    foto: fotoAtualBase64,
  };
  try {
    if (modoEdicaoItem) {
      const qtdEditada = document.getElementById('movQuantidadeAtual').value;
      const idFluigOriginal = document.getElementById('formMovimento').dataset.idFluigOriginal;
      await BramApp.atualizarDadosItem({ ...dadosComuns, idFluigOriginal, quantidade: qtdEditada });
      mostrarMensagem('msgMovimento', 'Item atualizado.', 'ok');
    } else {
      const resultado = await BramApp.registrarMovimento({
        ...dadosComuns,
        tipo: tipoMovimentoSelecionado,
        quantidade: document.getElementById('movQuantidade').value,
        responsavel: document.getElementById('movResponsavel').value.trim(),
      });
      const acao = tipoMovimentoSelecionado === 'entrada' ? 'Entrada registrada.' : 'Saída registrada.';
      mostrarMensagem('msgMovimento', resultado.jaExistia ? `Item já existente. ${acao}` : `Item novo cadastrado. ${acao}`, 'ok');
    }
    evt.target.reset();
    limparSeletorCor(document.querySelector('#modalMovimento .seletor-cores'));
    limparFoto();
    await renderEstoque();
    await atualizarStatusConexao();
    setTimeout(() => { fecharSheet('modalMovimento'); mostrarMensagem('msgMovimento', ''); definirModoFormMovimento(false); }, 500);
  } catch (e) {
    if (e.message === 'ITEM_PARECIDO' && e.itemParecido) {
      const p = e.itemParecido;
      const usarExistente = confirm(
        `Não achei o código "${dadosComuns.idFluig}" exatamente, mas encontrei um item bem parecido:\n\n"${p.nome}" (código ${p.idFluig}, ${p.quantidade} ${p.unidade || 'un'} em estoque)\n\nÉ esse mesmo item? Toque OK pra usar ele, ou Cancelar se for um item realmente diferente.`
      );
      try {
        if (usarExistente) {
          const resultado = await BramApp.registrarMovimento({
            ...dadosComuns,
            idFluig: p.idFluig,
            tipo: tipoMovimentoSelecionado,
            quantidade: document.getElementById('movQuantidade').value,
            responsavel: document.getElementById('movResponsavel').value.trim(),
          });
          mostrarMensagem('msgMovimento', `Item já existente. ${tipoMovimentoSelecionado === 'entrada' ? 'Entrada registrada.' : 'Saída registrada.'}`, 'ok');
        } else {
          const resultado = await BramApp.registrarMovimento({
            ...dadosComuns,
            tipo: tipoMovimentoSelecionado,
            quantidade: document.getElementById('movQuantidade').value,
            responsavel: document.getElementById('movResponsavel').value.trim(),
            confirmadoComoNovo: true,
          });
          mostrarMensagem('msgMovimento', `Item novo cadastrado. ${tipoMovimentoSelecionado === 'entrada' ? 'Entrada registrada.' : 'Saída registrada.'}`, 'ok');
        }
        evt.target.reset();
        limparSeletorCor(document.querySelector('#modalMovimento .seletor-cores'));
        limparFoto();
        await renderEstoque();
        await atualizarStatusConexao();
        setTimeout(() => { fecharSheet('modalMovimento'); mostrarMensagem('msgMovimento', ''); definirModoFormMovimento(false); }, 500);
      } catch (e2) {
        mostrarMensagem('msgMovimento', e2.message, 'erro');
      }
      return;
    }
    mostrarMensagem('msgMovimento', e.message, 'erro');
  }
});

document.getElementById('btnScanMovimento').addEventListener('click', () => {
  BramScanner.abrirScanner((codigo) => { document.getElementById('movIdFluig').value = codigo; preencherNomePorCodigo(); });
});

async function preencherNomePorCodigo() {
  const idFluig = document.getElementById('movIdFluig').value.trim();
  const nomeCampo = document.getElementById('movNome');
  if (!idFluig || nomeCampo.value.trim()) return;
  const item = await BramDB.get('estoque', idFluig);
  if (!item) return;
  nomeCampo.value = item.nome;
  const pnCampo = document.getElementById('movPn');
  const marcaCampo = document.getElementById('movMarca');
  if (!pnCampo.value.trim() && item.pn) pnCampo.value = item.pn;
  if (!marcaCampo.value.trim() && item.marca) marcaCampo.value = item.marca;
}
document.getElementById('movIdFluig').addEventListener('change', preencherNomePorCodigo);
document.getElementById('movIdFluig').addEventListener('input', preencherNomePorCodigo);

// ---------- REQUISIÇÕES ----------

function atualizarVisibilidadeTipo() {
  const mostra = document.getElementById('reqTipoReq').value === 'Pedido';
  document.getElementById('campoReqTipo').style.display = mostra ? '' : 'none';
  atualizarVisibilidadeHelm();
}
function atualizarVisibilidadeHelm() {
  const ehPedidoManutencao = document.getElementById('reqTipoReq').value === 'Pedido' && document.getElementById('reqTipo').value === 'MANUTENÇÃO';
  document.getElementById('campoReqHelm').style.display = ehPedidoManutencao ? '' : 'none';
}
document.getElementById('reqTipoReq').addEventListener('change', atualizarVisibilidadeTipo);
document.getElementById('reqTipo').addEventListener('change', atualizarVisibilidadeHelm);
atualizarVisibilidadeTipo();

document.getElementById('formRequisicao').addEventListener('submit', async (evt) => {
  evt.preventDefault();
  const idEditando = evt.target.dataset.editando;
  const dadosForm = {
    reqNumero: document.getElementById('reqNumero').value.trim(),
    solicitante: document.getElementById('reqSolicitante').value.trim(),
    tipoReq: document.getElementById('reqTipoReq').value,
    tipo: document.getElementById('reqTipo').value,
    helm: document.getElementById('reqHelm').value.trim(),
    obs: document.getElementById('reqObs').value.trim(),
  };
  try {
    if (idEditando) {
      await BramApp.editarRequisicao({ id: idEditando, ...dadosForm });
      delete evt.target.dataset.editando;
      document.getElementById('tituloFormRequisicao').textContent = 'Nova requisição';
      document.getElementById('btnCriarOuSalvarRequisicao').textContent = 'Criar requisição';
      mostrarMensagem('msgRequisicao', 'Requisição atualizada.', 'ok');
      evt.target.reset();
      atualizarVisibilidadeTipo();
      await renderRequisicoes();
      await atualizarStatusConexao();
      setTimeout(() => { fecharSheet('modalRequisicao'); mostrarMensagem('msgRequisicao', ''); }, 500);
      return;
    }

    const novaReq = await BramApp.criarRequisicao(dadosForm);
    mostrarMensagem('msgRequisicao', 'Requisição criada.', 'ok');
    evt.target.reset();
    atualizarVisibilidadeTipo();
    await renderRequisicoes();
    await atualizarStatusConexao();
    setTimeout(() => {
      fecharSheet('modalRequisicao');
      mostrarMensagem('msgRequisicao', '');
      const card = document.querySelector(`.card-requisicao[data-req="${novaReq.id}"]`);
      if (card) {
        card.querySelector('.req-cabecalho--clicavel').click();
        card.scrollIntoView({ block: 'nearest' });
      }
    }, 500);
  } catch (e) {
    mostrarMensagem('msgRequisicao', e.message, 'erro');
  }
});

function chipStatus(status) {
  if (status === 'Concluído' || status === 'Concluída') return 'chip-ok';
  if (status === 'Parc.' || status === 'Em andamento') return 'chip-alerta';
  if (status === 'Cancelado') return 'chip-perigo';
  return 'chip-neutro';
}

function bordaRequisicao(status) {
  if (status === 'Concluída') return 'borda-ok';
  if (status === 'Em andamento') return 'borda-alerta';
  return '';
}

async function preencherNomePorCodigoRequisicao(card) {
  const idFluig = card.querySelector('.in-idfluig').value.trim();
  const nomeCampo = card.querySelector('.in-nome');
  const linkCadastrar = card.querySelector('.link-cadastrar-item');
  const item = idFluig ? await BramDB.get('estoque', idFluig) : null;

  if (item && !nomeCampo.value.trim()) nomeCampo.value = item.nome;
  linkCadastrar.classList.toggle('oculto-flex', !idFluig || !!item);
}

function grupoStatusRequisicao(status) {
  const s = (status || '').toLowerCase();
  if (s.indexOf('cancel') !== -1) return 'canceladas';
  if (s.indexOf('conclu') !== -1) return 'concluidas';
  return 'abertas';
}


const LINK_FLUIG_SOLICITACOES = 'https://fluig.bramoffshore.com.br/portal/p/001/wMinhasSolicitacoes';
let filtroStatusAtual = 'abertas';
let requisicaoAbertaId = null; // qual card continua expandido entre re-renderizações
let formItemAbertoId = null; // em qual card o formulário de +item continua visível
let ordenacaoManual = null; // { campo: 'reqNumero' | 'data', direcao: 'asc' | 'desc' } — null = ordenação padrão por tipo
const NOMES_FILTRO = { todas: 'Todas', abertas: 'Abertas', concluidas: 'Concluídas', canceladas: 'Canceladas' };

async function renderRequisicoes() {
  const filtro = (document.getElementById('buscaRequisicoes').value || '').toLowerCase();
  const todosItens = await BramDB.getAll('itensStatus');

  const bateFiltro = (r) => {
    if (!filtro) return true;
    if (String(r.reqNumero || '').toLowerCase().includes(filtro)) return true;
    if (String(r.solicitante || '').toLowerCase().includes(filtro)) return true;
    if (String(r.obs || '').toLowerCase().includes(filtro)) return true;
    const itensDaReq = todosItens.filter((i) => i.requisicaoId === r.id);
    return itensDaReq.some((i) =>
      String(i.nomeItem || '').toLowerCase().includes(filtro) ||
      String(i.idFluig || '').toLowerCase().includes(filtro)
    );
  };

  const todasRequisicoes = (await BramDB.getAll('requisicoes')).filter(bateFiltro);

  const contagens = { todas: todasRequisicoes.length, abertas: 0, concluidas: 0, canceladas: 0 };
  todasRequisicoes.forEach((r) => { contagens[grupoStatusRequisicao(r.status)]++; });
  document.querySelectorAll('.filtro-status-item').forEach((btn) => {
    const chave = btn.dataset.filtro;
    btn.textContent = `${NOMES_FILTRO[chave]} (${contagens[chave]})`;
    btn.classList.toggle('ativo', chave === filtroStatusAtual);
  });
  document.getElementById('tituloFiltroReq').textContent = NOMES_FILTRO[filtroStatusAtual];

  const ORDEM_TIPO_REQ = { Pedido: 0, Desembarque: 1, Cadastro: 2 };
  const requisicoes = todasRequisicoes
    .filter((r) => filtroStatusAtual === 'todas' || grupoStatusRequisicao(r.status) === filtroStatusAtual)
    .sort((a, b) => {
      if (ordenacaoManual) {
        const { campo, direcao } = ordenacaoManual;
        let valorA = campo === 'reqNumero' ? Number(a.reqNumero) || 0 : a.data;
        let valorB = campo === 'reqNumero' ? Number(b.reqNumero) || 0 : b.data;
        if (valorA === valorB) return 0;
        const maior = valorA > valorB ? 1 : -1;
        return direcao === 'asc' ? maior : -maior;
      }
      const ordemA = ORDEM_TIPO_REQ[a.tipoReq] ?? 99;
      const ordemB = ORDEM_TIPO_REQ[b.tipoReq] ?? 99;
      if (ordemA !== ordemB) return ordemA - ordemB;
      return a.data < b.data ? 1 : -1;
    });
  const container = document.getElementById('listaRequisicoes');

  if (requisicoes.length === 0) {
    container.innerHTML = '<div class="lista-vazia">Nenhuma requisição encontrada. Toque em + para criar.</div>';
    return;
  }

  const NOMES_TIPO_REQ = { Pedido: 'Pedido', Desembarque: 'Desembarque', Cadastro: 'Cadastro' };
  let tipoAnterior = null;
  const linhasComCabecalho = requisicoes.map((r) => {
    const tipoAtual = r.tipoReq || 'Pedido';
    let cabecalhoTipo = '';
    if (!ordenacaoManual && tipoAtual !== tipoAnterior) {
      const quantos = requisicoes.filter((x) => (x.tipoReq || 'Pedido') === tipoAtual).length;
      cabecalhoTipo = `<div class="subcabecalho-tipo-req">${NOMES_TIPO_REQ[tipoAtual] || tipoAtual} (${quantos})</div>`;
      tipoAnterior = tipoAtual;
    }
    return cabecalhoTipo + renderCardRequisicao(r, todosItens);
  }).join('');

  const setaOrdenacao = (campo) => {
    if (!ordenacaoManual || ordenacaoManual.campo !== campo) return '';
    return ordenacaoManual.direcao === 'asc' ? ' ▲' : ' ▼';
  };

  container.innerHTML = `
    <div class="req-linha-tabela req-linha-tabela--cabecalho oculto-mobile">
      <button type="button" class="req-col req-col-num req-col-ordenavel" data-ordenar="reqNumero">REQ${setaOrdenacao('reqNumero')}</button>
      <span class="req-col req-col-nome">Solicitante</span>
      <span class="req-col req-col-tipo">Tipo</span>
      <button type="button" class="req-col req-col-data req-col-ordenavel" data-ordenar="data">Data${setaOrdenacao('data')}</button>
      <span class="req-col req-col-itens">Itens</span>
    </div>
    ${linhasComCabecalho}
  `;

  ligarEventosRequisicoes(container, todosItens);
}

function renderCardRequisicao(r, todosItens) {
  const itens = todosItens.filter((i) => i.requisicaoId === r.id);
  const tituloTipo = r.tipoReq === 'Pedido' ? `Pedido · ${r.tipo === 'MANUTENÇÃO' ? 'Manutenção' : 'Operação'}` : (r.tipoReq || 'Pedido');
  const numero = r.reqNumero ? `REQ ${r.reqNumero}` : '';
  const estaAberta = requisicaoAbertaId === r.id;
  const formAberto = formItemAbertoId === r.id;
  return `
    <div class="card-requisicao ${bordaRequisicao(r.status)}" data-req="${r.id}">
      <button type="button" class="req-cabecalho req-cabecalho--clicavel">
        <div class="oculto-desktop">
          <div class="req-titulo">${[numero, r.solicitante || '(sem nome)', tituloTipo].filter(Boolean).join(' · ')}</div>
          <div class="req-data">${fmtData(r.data)}${r.helm ? ` · HELM ${r.helm}` : ''} · ${itens.length} ${itens.length === 1 ? 'item' : 'itens'}</div>
        </div>
        <div class="req-linha-tabela oculto-mobile">
          <span class="req-col req-col-num">${r.reqNumero || '—'}</span>
          <span class="req-col req-col-nome">${r.solicitante || '(sem nome)'}</span>
          <span class="req-col req-col-tipo">${tituloTipo}</span>
          <span class="req-col req-col-data">${fmtData(r.data)}</span>
          <span class="req-col req-col-itens">${itens.length} ${itens.length === 1 ? 'item' : 'itens'}</span>
        </div>
        <span class="chip ${chipStatus(r.status)}">${r.status}</span>
      </button>
      <div class="req-corpo sheet-caixa-escura ${estaAberta ? '' : 'oculto-flex'}">
        <button type="button" class="botao btn-fechar-req-corpo botao-linha-inteira-desktop">Fechar</button>

        <div class="detalhe-acoes-topo">
          <button type="button" class="detalhe-acao-grande btn-concluir-req" data-req="${r.id}">
            <span class="detalhe-acao-icone">👍</span>
            <span class="detalhe-acao-rotulo">CONCLUIR<br>${(r.tipoReq || 'PEDIDO').toUpperCase()}</span>
          </button>
          <button type="button" class="detalhe-acao-grande btn-cancelar-req" data-req="${r.id}">
            <span class="detalhe-acao-icone">🚫</span>
            <span class="detalhe-acao-rotulo">CANCELAR<br>${(r.tipoReq || 'PEDIDO').toUpperCase()}</span>
          </button>
        </div>

        <div class="campo-detalhe-vertical"><span class="rotulo">REQ</span><strong class="valor">${r.reqNumero || '—'}</strong></div>
        <div class="campo-detalhe-vertical"><span class="rotulo">Solicitante</span><strong class="valor">${r.solicitante || '(sem nome)'}</strong></div>
        <div class="campo-detalhe-vertical"><span class="rotulo">Tipo de req.</span><strong class="valor">${tituloTipo}</strong></div>
        <div class="campo-detalhe-vertical"><span class="rotulo">Data</span><strong class="valor">${fmtData(r.data)}</strong></div>
        <div class="campo-detalhe-vertical"><span class="rotulo">Pedido status</span><strong class="valor">${r.status}</strong></div>
        ${r.helm ? `<div class="campo-detalhe-vertical"><span class="rotulo">HELM</span><strong class="valor">${r.helm}</strong></div>` : ''}
        <div class="campo-detalhe-vertical"><span class="rotulo">Observação</span><strong class="valor">${r.obs || '—'}</strong></div>
        <button type="button" class="botao botao-texto btn-editar-requisicao" data-req="${r.id}" style="margin-top:8px">Editar requisição</button>
        <a href="${LINK_FLUIG_SOLICITACOES}" target="_blank" rel="noopener" class="botao botao-texto" style="display:block; text-align:left">Ver status no Fluig ↗</a>

        <div class="lista-cabecalho" style="margin-top:16px"><h2>Itens relacionados (${itens.length})</h2></div>
        <div class="tabela-itens-req">
          <div class="tabela-itens-req-linha tabela-itens-req-cabecalho">
            <span>Fluig</span><span>Qtde</span><span>Item</span><span>Status</span>
          </div>
          ${itens.map((i) => `
            <div class="tabela-itens-req-linha" data-item="${i.id}">
              <span>${i.idFluig}</span>
              <span>${i.qtdeRecebida}/${i.quantidadeSolicitada}</span>
              <span>${i.nomeItem}</span>
              <span class="chip ${chipStatus(i.status)}">${i.status}</span>
            </div>
            <div class="tabela-itens-req-acoes">
              <button class="botao botao-texto btn-editar-item" data-item="${i.id}">Editar</button>
              ${i.status !== 'Concluído' && i.status !== 'Cancelado' ? `
                <button class="botao botao-texto btn-receber" data-item="${i.id}">Receber</button>
                <button class="botao botao-perigo-texto btn-cancelar" data-item="${i.id}">Cancelar</button>` : ''}
            </div>
          `).join('')}
        </div>

        <button type="button" class="botao btn-abrir-add-item" style="width:100%; margin-top:6px">+ Adicionar item</button>

        <div class="form-item-inline ${formAberto ? '' : 'oculto-flex'}">
          <span class="campo-com-scan campo-linha-inteira">
            <input type="text" class="in-idfluig" placeholder="Código" />
            <button type="button" class="botao-scan btn-scan-item" aria-label="Ler código de barras">📷</button>
          </span>
          <input type="text" class="in-nome campo-linha-inteira" placeholder="Descrição" />
          <button type="button" class="link-cadastrar-item oculto-flex campo-linha-inteira">Item não encontrado no estoque — toque aqui para cadastrar</button>
          <input type="number" class="in-qtd" placeholder="Qtd." min="1" step="1" inputmode="numeric" />
          <button class="botao botao-primario btn-add-item">Salvar</button>
          <button type="button" class="link-cadastrar-item-sempre campo-linha-inteira">Não achou o item? Cadastrar item novo</button>
        </div>
        <button type="button" class="botao botao-perigo-texto btn-excluir-requisicao" style="width:100%; margin-top:8px">Excluir requisição</button>
      </div>
    </div>`;
}

function ligarEventosRequisicoes(container, todosItens) {
  // Deslizar o dedo pro lado, dentro do detalhe aberto, pula pra
  // requisição anterior/seguinte da lista, sem precisar fechar e abrir de novo.
  container.querySelectorAll('.req-corpo').forEach((corpo) => {
    let inicioX = null, inicioY = null;
    corpo.addEventListener('touchstart', (evt) => {
      inicioX = evt.touches[0].clientX;
      inicioY = evt.touches[0].clientY;
    }, { passive: true });
    corpo.addEventListener('touchend', (evt) => {
      if (inicioX === null) return;
      const deltaX = evt.changedTouches[0].clientX - inicioX;
      const deltaY = evt.changedTouches[0].clientY - inicioY;
      inicioX = null;
      if (Math.abs(deltaX) < 70 || Math.abs(deltaX) < Math.abs(deltaY) * 1.5) return; // só gestos bem horizontais
      const cardAtual = corpo.closest('.card-requisicao');
      const todosCards = Array.from(document.querySelectorAll('#listaRequisicoes .card-requisicao'));
      const indiceAtual = todosCards.indexOf(cardAtual);
      const proximoCard = deltaX < 0 ? todosCards[indiceAtual + 1] : todosCards[indiceAtual - 1];
      if (proximoCard) proximoCard.querySelector('.req-cabecalho--clicavel').click();
    }, { passive: true });
  });

  container.querySelectorAll('.req-col-ordenavel').forEach((btn) => {
    btn.addEventListener('click', () => {
      const campo = btn.dataset.ordenar;
      if (ordenacaoManual && ordenacaoManual.campo === campo) {
        ordenacaoManual = ordenacaoManual.direcao === 'asc' ? { campo, direcao: 'desc' } : null;
      } else {
        ordenacaoManual = { campo, direcao: 'asc' };
      }
      renderRequisicoes();
    });
  });

  container.querySelectorAll('.req-cabecalho--clicavel').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.card-requisicao');
      const corpo = btn.nextElementSibling;
      const vaiAbrir = corpo.classList.contains('oculto-flex');
      container.querySelectorAll('.req-corpo').forEach((c) => c.classList.add('oculto-flex'));
      requisicaoAbertaId = null;
      formItemAbertoId = null;
      if (vaiAbrir) {
        corpo.classList.remove('oculto-flex');
        requisicaoAbertaId = card.dataset.req;
      }
    });
  });

  container.querySelectorAll('.btn-fechar-req-corpo').forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.closest('.req-corpo').classList.add('oculto-flex');
      requisicaoAbertaId = null;
      formItemAbertoId = null;
    });
  });

  container.querySelectorAll('.btn-editar-requisicao').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const req = await BramDB.get('requisicoes', btn.dataset.req);
      if (!req) return;
      const form = document.getElementById('formRequisicao');
      form.dataset.editando = req.id;
      document.getElementById('tituloFormRequisicao').textContent = 'Editar requisição';
      document.getElementById('btnCriarOuSalvarRequisicao').textContent = 'Salvar alterações';
      document.getElementById('reqNumero').value = req.reqNumero || '';
      document.getElementById('reqSolicitante').value = req.solicitante || '';
      document.getElementById('reqTipoReq').value = req.tipoReq || 'Pedido';
      atualizarVisibilidadeTipo();
      document.getElementById('reqTipo').value = req.tipo || 'OPERAÇÃO';
      atualizarVisibilidadeHelm();
      document.getElementById('reqHelm').value = req.helm || '';
      document.getElementById('reqObs').value = req.obs || '';
      abrirSheet('modalRequisicao');
    });
  });

  container.querySelectorAll('.btn-concluir-req').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Marcar esta requisição inteira como concluída?')) return;
      await BramApp.definirStatusRequisicao(btn.dataset.req, 'Concluído');
      await renderRequisicoes();
      await atualizarStatusConexao();
    });
  });
  container.querySelectorAll('.btn-cancelar-req').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Cancelar esta requisição inteira?')) return;
      await BramApp.definirStatusRequisicao(btn.dataset.req, 'Cancelado');
      await renderRequisicoes();
      await atualizarStatusConexao();
    });
  });

  container.querySelectorAll('.btn-scan-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.card-requisicao');
      const campo = btn.closest('.campo-com-scan').querySelector('.in-idfluig');
      BramScanner.abrirScanner((codigo) => {
        campo.value = codigo;
        preencherNomePorCodigoRequisicao(card);
      });
    });
  });

  container.querySelectorAll('.in-idfluig').forEach((campo) => {
    campo.addEventListener('input', () => preencherNomePorCodigoRequisicao(campo.closest('.card-requisicao')));
    campo.addEventListener('change', () => preencherNomePorCodigoRequisicao(campo.closest('.card-requisicao')));
  });

  container.querySelectorAll('.link-cadastrar-item').forEach((link) => {
    link.addEventListener('click', () => {
      const card = link.closest('.card-requisicao');
      const idFluig = card.querySelector('.in-idfluig').value.trim();
      const nome = card.querySelector('.in-nome').value.trim();
      if (!idFluig) return;
      definirModoFormMovimento(false);
      document.getElementById('movIdFluig').value = idFluig;
      document.getElementById('movNome').value = nome;
      abrirSheet('modalMovimento');
    });
  });

  container.querySelectorAll('.btn-abrir-add-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.card-requisicao');
      const form = btn.nextElementSibling;
      form.classList.toggle('oculto-flex');
      const abriu = !form.classList.contains('oculto-flex');
      formItemAbertoId = abriu ? card.dataset.req : null;
      if (abriu && !form.dataset.editando) {
        form.querySelector('.in-idfluig').value = '';
        form.querySelector('.in-nome').value = '';
        form.querySelector('.in-qtd').value = '';
        form.querySelector('.btn-add-item').textContent = 'Salvar';
      }
    });
  });

  container.querySelectorAll('.btn-editar-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.card-requisicao');
      const item = todosItens.find((i) => i.id === btn.dataset.item);
      if (!item) return;
      const form = card.querySelector('.form-item-inline');
      form.dataset.editando = item.id;
      form.classList.remove('oculto-flex');
      formItemAbertoId = card.dataset.req;
      form.querySelector('.in-idfluig').value = item.idFluig;
      form.querySelector('.in-nome').value = item.nomeItem;
      form.querySelector('.in-qtd').value = item.quantidadeSolicitada;
      form.querySelector('.btn-add-item').textContent = 'Salvar edição';
      form.scrollIntoView({ block: 'nearest' });
    });
  });

  container.querySelectorAll('.link-cadastrar-item-sempre').forEach((link) => {
    link.addEventListener('click', () => {
      const card = link.closest('.card-requisicao');
      const idFluig = card.querySelector('.in-idfluig').value.trim();
      const nome = card.querySelector('.in-nome').value.trim();
      definirModoFormMovimento(false);
      document.getElementById('movIdFluig').value = idFluig;
      document.getElementById('movNome').value = nome;
      abrirSheet('modalMovimento');
    });
  });

  container.querySelectorAll('.btn-add-item').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.card-requisicao');
      const form = btn.closest('.form-item-inline');
      const requisicaoId = card.dataset.req;
      const idFluig = card.querySelector('.in-idfluig').value.trim();
      const nome = card.querySelector('.in-nome').value.trim();
      const qtd = card.querySelector('.in-qtd').value;
      const editandoItemId = form.dataset.editando;
      try {
        if (editandoItemId) {
          await BramApp.editarItemRequisicao({ itemId: editandoItemId, idFluig, nomeItem: nome, quantidadeSolicitada: qtd });
          delete form.dataset.editando;
        } else {
          await BramApp.adicionarItemRequisicao({ requisicaoId, idFluig, nomeItem: nome, quantidadeSolicitada: qtd });
        }
        formItemAbertoId = null; // fecha o formulário — precisa apertar "+ Adicionar item" de novo pro próximo
        await renderRequisicoes();
        await renderEstoque();
        await atualizarStatusConexao();
      } catch (e) {
        alert(e.message);
      }
    });
  });

  container.querySelectorAll('.btn-receber').forEach((btn) => {
    btn.addEventListener('click', () => abrirFluxoRecebimento(btn.dataset.item));
  });
  container.querySelectorAll('.btn-cancelar').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Cancelar este item da requisição?')) return;
      await BramApp.cancelarItemRequisicao(btn.dataset.item);
      await renderRequisicoes();
      await renderEstoque();
      await atualizarStatusConexao();
    });
  });
  container.querySelectorAll('.btn-excluir-requisicao').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.card-requisicao');
      if (!confirm('Excluir esta requisição e todos os seus itens? Essa ação não pode ser desfeita.')) return;
      try {
        await BramApp.excluirRequisicao(card.dataset.req);
        await renderRequisicoes();
        await renderEstoque();
        await atualizarStatusConexao();
      } catch (e) {
        alert(e.message);
      }
    });
  });
}

document.getElementById('buscaRequisicoes').addEventListener('input', renderRequisicoes);

document.getElementById('filtroStatusReq').addEventListener('click', (evt) => {
  const btn = evt.target.closest('.filtro-status-item');
  if (!btn) return;
  filtroStatusAtual = btn.dataset.filtro;
  renderRequisicoes();
});

async function renderItensAvulsos() {
  const filtro = (document.getElementById('buscaAvulsos').value || '').trim().toLowerCase();
  const container = document.getElementById('listaItensAvulsos');

  if (!filtro) {
    container.innerHTML = '<div class="lista-vazia">Digite algo acima para buscar no histórico (são muitos itens para listar todos de uma vez).</div>';
    return;
  }

  const todosItens = await BramDB.getAll('itensStatus');
  const avulsos = todosItens
    .filter((i) => !i.requisicaoId)
    .filter((i) => String(i.nomeItem || '').toLowerCase().includes(filtro) || String(i.idFluig || '').toLowerCase().includes(filtro))
    .slice(0, 60);

  if (avulsos.length === 0) {
    container.innerHTML = '<div class="lista-vazia">Nenhum item avulso encontrado com esse termo.</div>';
    return;
  }

  container.innerHTML = avulsos.map((i) => `
    <div class="item-req-linha" data-item="${i.id}" style="background:var(--superficie); border-radius:8px; padding:10px 12px; border-top:none; box-shadow:0 1px 2px rgba(0,0,0,0.08); margin-bottom:6px;">
      <span>${i.nomeItem || '(sem nome)'} — ${i.idFluig || 's/ código'} · ${i.qtdeRecebida || 0}/${i.quantidadeSolicitada || '?'}</span>
      <span class="chip ${chipStatus(i.status)}">${i.status}</span>
      <span class="acoes">
        ${i.status !== 'Concluído' && i.status !== 'Cancelado' ? `
          <button class="botao botao-texto btn-receber-avulso" data-item="${i.id}">Receber</button>
          <button class="botao botao-perigo-texto btn-cancelar-avulso" data-item="${i.id}">Cancelar</button>` : ''}
      </span>
    </div>`).join('');

  container.querySelectorAll('.btn-receber-avulso').forEach((btn) => {
    btn.addEventListener('click', () => abrirFluxoRecebimento(btn.dataset.item, renderItensAvulsos));
  });
  container.querySelectorAll('.btn-cancelar-avulso').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Cancelar este item?')) return;
      await BramApp.cancelarItemRequisicao(btn.dataset.item);
      await renderItensAvulsos();
      await renderEstoque();
      await atualizarStatusConexao();
    });
  });
}

document.getElementById('buscaAvulsos').addEventListener('input', renderItensAvulsos);

async function abrirFluxoRecebimento(itemId, aoAtualizar) {
  aoAtualizar = aoAtualizar || renderRequisicoes;
  const qtd = prompt('Quantidade recebida agora:');
  if (qtd === null) return;
  try {
    await BramApp.receberItemRequisicao({ itemId, quantidadeAgora: qtd });
    await aoAtualizar();
    await renderEstoque();
    await atualizarStatusConexao();
  } catch (e) {
    if (e.message === 'LOCAL_NECESSARIO') {
      abrirModalLocal(async (local, prateleira, coluna, linha) => {
        try {
          await BramApp.receberItemRequisicao({ itemId, quantidadeAgora: qtd, local, prateleira, coluna, linha });
          await aoAtualizar();
          await renderEstoque();
          await atualizarStatusConexao();
        } catch (e2) {
          alert(e2.message);
        }
      });
    } else {
      alert(e.message);
    }
  }
}

function abrirModalLocal(aoConfirmar) {
  const modal = document.getElementById('modalLocal');
  const input = document.getElementById('modalLocalInput');
  const inputPrateleira = document.getElementById('modalPrateleiraInput');
  const inputColuna = document.getElementById('modalColunaInput');
  const inputLinha = document.getElementById('modalLinhaInput');
  input.value = ''; inputColuna.value = ''; inputLinha.value = '';
  limparSeletorCor(modal.querySelector('.seletor-cores'));
  modal.classList.remove('oculta');

  const fechar = () => modal.classList.add('oculta');
  document.getElementById('modalLocalConfirmar').onclick = () => {
    const valor = input.value.trim();
    if (!valor) return;
    fechar();
    aoConfirmar(valor, inputPrateleira.value.trim(), inputColuna.value.trim(), inputLinha.value.trim());
  };
  document.getElementById('modalLocalCancelar').onclick = fechar;
}

// ---------- SINCRONIZAÇÃO ----------

document.getElementById('backendUrl').value = BramSync.getBackendUrl();

document.getElementById('formBackend').addEventListener('submit', (evt) => {
  evt.preventDefault();
  BramSync.setBackendUrl(document.getElementById('backendUrl').value);
  mostrarMensagem('msgBackend', 'Endereço salvo.', 'ok');
  atualizarStatusConexao();
});

document.getElementById('btnSincronizarAgora').addEventListener('click', async () => {
  mostrarMensagem('msgSync', 'Sincronizando…');
  const r = await BramSync.sincronizarFila((feitos, total) => {
    mostrarMensagem('msgSync', `Enviando… ${feitos}/${total}`);
  });
  if (r.erro === 'sem-url') mostrarMensagem('msgSync', 'Configure o endereço do backend primeiro.', 'erro');
  else if (r.erro === 'interrompido') mostrarMensagem('msgSync', `Enviado ${r.enviados}, mas a conexão caiu. Restam ${r.restantes}.`, 'erro');
  else mostrarMensagem('msgSync', `Tudo sincronizado (${r.enviados} enviados).`, 'ok');
  await atualizarStatusConexao();
});

document.getElementById('btnPuxarServidor').addEventListener('click', async () => {
  if (!confirm('Isso vai trazer os dados da planilha para este aparelho. Continuar?')) return;
  mostrarMensagem('msgSync', 'Puxando dados da planilha…');
  try {
    await BramSync.puxarDoServidor();
    await BramApp.migrarDuplicadosEstoque();
    mostrarMensagem('msgSync', 'Dados atualizados a partir da planilha.', 'ok');
    await renderEstoque();
    await renderRequisicoes();
  } catch (e) {
    mostrarMensagem('msgSync', e.message, 'erro');
  }
});

document.getElementById('btnLimparFila').addEventListener('click', async () => {
  const quantos = await BramDB.tamanhoFila();
  if (quantos === 0) { mostrarMensagem('msgSync', 'A fila já está vazia.', 'ok'); return; }
  if (!confirm(`Isso vai apagar ${quantos} alteração(ões) pendente(s) de envio, sem tentar enviar pra planilha. Use isso só se a fila estiver travada. Continuar?`)) return;
  await BramDB.limparFila();
  mostrarMensagem('msgSync', 'Fila pendente limpa.', 'ok');
  await atualizarStatusConexao();
});

document.getElementById('btnReenviarFotos').addEventListener('click', async () => {
  if (!confirm('Isso vai reenviar pra planilha todas as fotos de itens já salvas neste aparelho (útil só uma vez, depois de adicionar a coluna "Foto" na planilha). Continuar?')) return;
  mostrarMensagem('msgSync', 'Reenviando fotos…');
  const quantas = await BramApp.reenviarFotos();
  mostrarMensagem('msgSync', quantas === 0 ? 'Nenhuma foto encontrada neste aparelho.' : `${quantas} foto(s) adicionada(s) à fila de envio.`, 'ok');
  await atualizarStatusConexao();
});

// ---------- Inicialização ----------

// Puxa dados da planilha automaticamente, sem perguntar nada — só quando
// tiver internet configurada. Falha em silêncio (tenta de novo no próximo ciclo).
async function puxarAutomaticamente() {
  if (!navigator.onLine || !BramSync.getBackendUrl()) return;
  try {
    await BramSync.puxarDoServidor();
    await BramApp.migrarDuplicadosEstoque();
    const abaAtual = document.querySelector('.nav-item.ativo')?.dataset.aba;
    if (abaAtual === 'estoque') await renderEstoque();
    if (abaAtual === 'requisicoes') await renderRequisicoes();
    await atualizarStatusConexao();
  } catch (e) {
    // Sem sorte dessa vez — tenta de novo no próximo ciclo automático.
  }
}

(async function iniciar() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  await BramDB.abrirDB();
  await BramApp.migrarDuplicadosEstoque();
  await renderEstoque();
  await atualizarStatusConexao();

  if (navigator.onLine && BramSync.getBackendUrl()) {
    BramSync.sincronizarFila().then(atualizarStatusConexao);
  }
  setInterval(atualizarStatusConexao, 5000);

  // Sincronização automática: puxa dados da planilha pouco depois de abrir
  // o app, e depois a cada 5 minutos — sem precisar apertar nada.
  setTimeout(puxarAutomaticamente, 4000);
  setInterval(puxarAutomaticamente, 5 * 60 * 1000);
})();
