// app.js — regras de negócio (estoque + requisições) e renderização da tela.

const fmtData = (iso) => new Date(iso).toLocaleString('pt-BR');
const uid = () => Date.now() + '-' + Math.random().toString(36).slice(2, 8);

function paraInteiro(valor) {
  const n = Number(valor);
  if (!Number.isInteger(n)) throw new Error('A quantidade precisa ser um número inteiro (sem vírgula ou ponto).');
  return n;
}

// ---------- ESTOQUE ----------

function contarCamposPreenchidos(item) {
  const campos = ['local', 'prateleira', 'coluna', 'linha', 'pn', 'marca', 'foto', 'obs'];
  return campos.reduce((total, campo) => total + (item[campo] ? 1 : 0), 0);
}

// Corrige duplicados criados pelo bug de código vindo como número da
// planilha (ex: 10603901 vs "10603901") — mesmo item, chaves diferentes.
// Junta tudo numa única linha, com chave sempre em texto, mantendo os
// dados mais completos e somando a quantidade de todas as cópias.
// Ação manual (só quando o usuário pedir): reenfileira pra sincronizar
// todos os itens de estoque que já têm foto salva neste aparelho, mas que
// podem ter sido adicionadas antes da coluna "Foto" existir na planilha.
async function reenviarFotos() {
  const todos = await BramDB.getAll('estoque');
  const comFoto = todos.filter((item) => item.foto);
  for (const item of comFoto) {
    await BramDB.enfileirar('estoque', 'upsert', item);
  }
  return comFoto.length;
}

async function migrarDuplicadosEstoque() {
  // Corrige SÓ um problema bem específico e seguro: um item cujo código
  // ficou guardado como número (ex: 10718853) em vez de texto (ex:
  // "10.718.853"), por causa de como o Google Sheets às vezes entende
  // números com ponto. Aqui só convertemos o TIPO do mesmo valor — nunca
  // juntamos itens que tenham códigos diferentes, por mais parecidos que
  // sejam, pra nunca correr o risco de misturar dois itens diferentes.
  const todos = await BramDB.getAll('estoque');
  for (const item of todos) {
    if (typeof item.idFluig === 'string') continue;
    const chaveTexto = String(item.idFluig);
    const jaExisteComoTexto = await BramDB.get('estoque', chaveTexto);

    await BramDB.del('estoque', item.idFluig);
    if (jaExisteComoTexto) {
      // Mesmo valor exato guardado duas vezes (uma como número, outra já
      // como texto) — mantém a versão com mais campos preenchidos.
      const vencedor = contarCamposPreenchidos(jaExisteComoTexto) >= contarCamposPreenchidos(item) ? jaExisteComoTexto : { ...item, idFluig: chaveTexto };
      await BramDB.put('estoque', vencedor);
      await BramDB.enfileirar('estoque', 'upsert', vencedor);
    } else {
      const itemCorrigido = { ...item, idFluig: chaveTexto };
      await BramDB.put('estoque', itemCorrigido);
      await BramDB.enfileirar('estoque', 'upsert', itemCorrigido);
    }
  }
}

// Usada só pra SUGERIR um possível item parecido antes de criar um novo —
// nunca pra decidir sozinho que dois itens são o mesmo (isso é sempre a
// pessoa que confirma).
function normalizarParaComparar_(codigo) {
  return String(codigo || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

// O ID Fluig de verdade sempre tem ponto (ex: 10.508822). Exige isso na
// hora de cadastrar/trocar o código, pra nunca salvar um código sem ponto
// por engano (esquecimento, ou número "cru" copiado de algum lugar).
function validarPontoNoIdFluig_(idFluig) {
  if (!String(idFluig).includes('.')) {
    throw new Error(`O código "${idFluig}" precisa ter ponto (ex: 10.508822). Confira e digite de novo.`);
  }
}

async function obterOuCriarEstoque(idFluig, nome, unidade) {
  idFluig = String(idFluig);
  // Correspondência SEMPRE exata pelo código — nunca "aproximada". Juntar
  // itens por código parecido já causou o item errado ganhar dados de
  // outro item (ex: uma arruela) por engano. É mais seguro criar um item
  // "novo" que não existia (você pode corrigir/apagar depois) do que
  // arriscar misturar dois itens diferentes que só têm código parecido.
  let item = await BramDB.get('estoque', idFluig);
  if (!item) {
    item = { idFluig, nome: nome || idFluig, quantidade: 0, unidade: unidade || 'un', local: '', prateleira: '', coluna: '', linha: '', foto: '', pn: '', marca: '', obs: '', itemCritico: '' };
  }
  return item;
}

async function registrarMovimento({ idFluig, nome, tipo, quantidade, unidade, local, prateleira, coluna, linha, responsavel, observacao, foto, pn, marca, itemCritico, confirmadoComoNovo }) {
  quantidade = paraInteiro(quantidade);
  if (!idFluig || !quantidade || quantidade <= 0) {
    throw new Error('Informe o item e uma quantidade maior que zero.');
  }

  // Lançar entrada/saída pelo botão + É a forma certa de cadastrar um item
  // novo (com uma quantidade inicial). Editar item é diferente — só altera
  // um item que já existe, nunca cria.
  const jaExistia = !!(await BramDB.get('estoque', String(idFluig)));

  if (!jaExistia && !confirmadoComoNovo) {
    // Antes de criar um item novo, procura se já existe algo com o código
    // bem parecido (só formatado diferente, com/sem ponto etc) — mas NUNCA
    // junta sozinho. Só avisa, pra pessoa decidir: é o mesmo item (usa o
    // código certo) ou é mesmo um item novo (confirma e cria)?
    const normalizado = normalizarParaComparar_(idFluig);
    if (normalizado) {
      const todos = await BramDB.getAll('estoque');
      const parecido = todos.find((i) => normalizarParaComparar_(i.idFluig) === normalizado);
      if (parecido) {
        const erro = new Error('ITEM_PARECIDO');
        erro.itemParecido = parecido;
        throw erro;
      }
    }
  }

  if (!jaExistia) validarPontoNoIdFluig_(idFluig);
  const item = await obterOuCriarEstoque(idFluig, nome, unidade);
  if (tipo === 'saida' && item.quantidade < quantidade) {
    throw new Error(`Estoque insuficiente: há ${item.quantidade} ${item.unidade} de "${item.nome}".`);
  }

  item.quantidade = tipo === 'entrada' ? item.quantidade + quantidade : item.quantidade - quantidade;
  if (local) item.local = local;
  if (prateleira) item.prateleira = prateleira;
  if (coluna) item.coluna = coluna;
  if (linha) item.linha = linha;
  if (foto) item.foto = foto;
  if (pn) item.pn = pn;
  if (marca) item.marca = marca;
  if (itemCritico) item.itemCritico = itemCritico === 'Sim';
  if (observacao) item.obs = observacao;
  if (nome) item.nome = nome;

  await BramDB.put('estoque', item);
  await BramDB.enfileirar('estoque', 'upsert', item);

  const mov = {
    id: uid(),
    idFluig,
    nome: item.nome,
    tipo,
    quantidade,
    unidade: item.unidade,
    local: item.local,
    responsavel: responsavel || '',
    observacao: observacao || '',
    data: new Date().toISOString(),
  };
  await BramDB.put('movimentos', mov);
  await BramDB.enfileirar('movimentos', 'upsert', mov);

  return { item, mov, jaExistia };
}

// Exclui um item de estoque por completo (não é uma saída — some da lista).
// Atualiza só os dados cadastrais do item (local, prateleira, coluna, linha,
// foto, P/N, marca, observação) — não mexe na quantidade nem gera movimento.
async function atualizarDadosItem({ idFluigOriginal, idFluig, nome, local, prateleira, coluna, linha, foto, pn, marca, observacao, itemCritico, quantidade }) {
  // "Editar item" só ALTERA um item que já existe — quem cria item novo é
  // o botão + (Lançar movimento). Busca sempre pelo código ORIGINAL (o que
  // já estava salvo), não pelo que a pessoa está digitando agora — assim
  // dá pra corrigir o próprio código sem o app achar que "não existe".
  const codigoOriginal = String(idFluigOriginal || idFluig);
  const item = await BramDB.get('estoque', codigoOriginal);
  if (!item) {
    throw new Error(`Nenhum item encontrado com o código "${codigoOriginal}". Pra cadastrar um item novo, use o botão + (Lançar movimento).`);
  }

  const novoCodigo = String(idFluig);
  const mudandoCodigo = novoCodigo !== codigoOriginal;
  if (mudandoCodigo) {
    validarPontoNoIdFluig_(novoCodigo);
    // Só permite trocar o código se o novo código ainda não pertencer a
    // outro item — nunca deixamos dois itens ficarem com o mesmo código.
    const jaExisteOutro = await BramDB.get('estoque', novoCodigo);
    if (jaExisteOutro) {
      throw new Error(`Já existe outro item com o código "${novoCodigo}" ("${jaExisteOutro.nome}"). Escolha um código diferente.`);
    }
  }

  if (quantidade !== undefined && quantidade !== '') item.quantidade = paraInteiro(quantidade);
  if (nome) item.nome = nome;
  if (local) item.local = local;
  if (prateleira) item.prateleira = prateleira;
  if (coluna) item.coluna = coluna;
  if (linha) item.linha = linha;
  if (foto) item.foto = foto;
  if (pn) item.pn = pn;
  if (marca) item.marca = marca;
  if (itemCritico) item.itemCritico = itemCritico === 'Sim';
  if (observacao) item.obs = observacao;
  item.idFluig = novoCodigo;

  if (mudandoCodigo) {
    await BramDB.del('estoque', codigoOriginal);
    await BramDB.enfileirar('estoque', 'delete', { idFluig: codigoOriginal });
  }
  await BramDB.put('estoque', item);
  await BramDB.enfileirar('estoque', 'upsert', item);
  return item;
}

async function excluirItemEstoque(idFluig) {
  idFluig = String(idFluig);
  const item = await BramDB.get('estoque', idFluig);
  if (!item) throw new Error('Item não encontrado.');
  await BramDB.del('estoque', idFluig);
  await BramDB.enfileirar('estoque', 'delete', { idFluig });
}

// ---------- REQUISIÇÕES ----------
// tipoReq: 'Pedido' | 'Desembarque' | 'Cadastro'
// tipo (só relevante quando tipoReq === 'Pedido'): 'OPERAÇÃO' | 'MANUTENÇÃO'

async function criarRequisicao({ solicitante, tipoReq, tipo, helm, reqNumero, obs }) {
  const ehPedidoManutencao = tipoReq === 'Pedido' && tipo === 'MANUTENÇÃO';
  const req = {
    id: uid(),
    reqNumero: reqNumero || '',
    solicitante: solicitante || '',
    tipoReq: tipoReq || 'Pedido',
    tipo: tipoReq === 'Pedido' ? (tipo || 'OPERAÇÃO') : '',
    helm: ehPedidoManutencao ? (helm || '') : '',
    obs: obs || '',
    data: new Date().toISOString(),
    status: 'Aberta',
  };
  await BramDB.put('requisicoes', req);
  await BramDB.enfileirar('requisicoes', 'upsert', req);
  return req;
}

// Corrige os dados de uma requisição já existente (ex: número digitado
// errado), sem precisar excluir e criar de novo.
async function editarRequisicao({ id, reqNumero, solicitante, tipoReq, tipo, helm, obs }) {
  const req = await BramDB.get('requisicoes', id);
  if (!req) throw new Error('Requisição não encontrada.');
  const ehPedidoManutencao = tipoReq === 'Pedido' && tipo === 'MANUTENÇÃO';
  req.reqNumero = reqNumero || '';
  req.solicitante = solicitante || '';
  req.tipoReq = tipoReq || 'Pedido';
  req.tipo = tipoReq === 'Pedido' ? (tipo || 'OPERAÇÃO') : '';
  req.helm = ehPedidoManutencao ? (helm || '') : '';
  req.obs = obs || '';
  await BramDB.put('requisicoes', req);
  await BramDB.enfileirar('requisicoes', 'upsert', req);
  return req;
}

// Ação rápida: marca a requisição inteira como concluída ou cancelada
// diretamente (sem mexer nos itens um por um).
async function definirStatusRequisicao(requisicaoId, novoStatus) {
  const requisicao = await BramDB.get('requisicoes', requisicaoId);
  if (!requisicao) throw new Error('Requisição não encontrada.');
  requisicao.status = novoStatus;
  requisicao.dataFinalizada = new Date().toISOString();
  await BramDB.put('requisicoes', requisicao);
  await BramDB.enfileirar('requisicoes', 'upsert', requisicao);
}

async function excluirRequisicao(requisicaoId) {
  const requisicao = await BramDB.get('requisicoes', requisicaoId);
  if (!requisicao) throw new Error('Requisição não encontrada.');
  const itens = (await BramDB.getAll('itensStatus')).filter((i) => i.requisicaoId === requisicaoId);

  for (const item of itens) {
    await BramDB.del('itensStatus', item.id);
    await BramDB.enfileirar('itensStatus', 'delete', { id: item.id });
  }

  await BramDB.del('requisicoes', requisicaoId);
  await BramDB.enfileirar('requisicoes', 'delete', { id: requisicaoId });
}

async function adicionarItemRequisicao({ requisicaoId, idFluig, nomeItem, quantidadeSolicitada }) {
  const requisicao = await BramDB.get('requisicoes', requisicaoId);
  if (!requisicao) throw new Error('Requisição não encontrada.');
  quantidadeSolicitada = paraInteiro(quantidadeSolicitada);

  // Nunca cria um item de estoque sozinho — só quem cadastra item novo é
  // você, pelo "Cadastrar item novo" (ou "Editar item"). Aqui só aceitamos
  // um item que já exista de verdade no Estoque.
  const itemEstoque = await BramDB.get('estoque', String(idFluig));
  if (!itemEstoque) {
    throw new Error(`Nenhum item encontrado com o código "${idFluig}". Toque em "Não achou o item? Cadastrar item novo" primeiro.`);
  }

  const item = {
    id: uid(),
    requisicaoId,
    idFluig,
    nomeItem: nomeItem || itemEstoque.nome,
    quantidadeSolicitada,
    qtdeRecebida: 0,
    quantidadeAgora: 0,
    status: 'Aberto', // Aberto | Parc. | Concluído | Cancelado
    dataFinalizada: '',
  };
  await BramDB.put('itensStatus', item);
  await BramDB.enfileirar('itensStatus', 'upsert', item);
  return item;
}

// Corrige um item já adicionado (código, descrição ou quantidade errados),
// sem precisar cancelar/excluir e criar de novo.
async function editarItemRequisicao({ itemId, idFluig, nomeItem, quantidadeSolicitada }) {
  const item = await BramDB.get('itensStatus', itemId);
  if (!item) throw new Error('Item não encontrado.');
  quantidadeSolicitada = paraInteiro(quantidadeSolicitada);
  if (quantidadeSolicitada < item.qtdeRecebida) {
    throw new Error(`Não é possível colocar uma quantidade menor que a já recebida (${item.qtdeRecebida}).`);
  }

  const itemEstoque = await BramDB.get('estoque', String(idFluig));
  if (!itemEstoque) {
    throw new Error(`Nenhum item encontrado com o código "${idFluig}". Cadastre esse item primeiro.`);
  }

  item.idFluig = idFluig;
  item.nomeItem = nomeItem || itemEstoque.nome;
  item.quantidadeSolicitada = quantidadeSolicitada;
  item.status = item.qtdeRecebida >= quantidadeSolicitada && item.qtdeRecebida > 0 ? 'Concluído' : item.qtdeRecebida > 0 ? 'Parc.' : 'Aberto';
  await BramDB.put('itensStatus', item);
  await BramDB.enfileirar('itensStatus', 'upsert', item);
  return item;
}

// Recebimento (total ou parcial) de um item de requisição.
async function receberItemRequisicao({ itemId, quantidadeAgora, local, prateleira, coluna, linha }) {
  const item = await BramDB.get('itensStatus', itemId);
  if (!item) throw new Error('Item não encontrado.');
  const requisicao = await BramDB.get('requisicoes', item.requisicaoId);

  quantidadeAgora = paraInteiro(quantidadeAgora);
  if (!quantidadeAgora || quantidadeAgora <= 0) throw new Error('Informe uma quantidade maior que zero.');

  const restante = item.quantidadeSolicitada - item.qtdeRecebida;
  if (quantidadeAgora > restante) {
    throw new Error(`Só falta receber ${restante}. Quantidade informada é maior que o pendente.`);
  }

  item.qtdeRecebida += quantidadeAgora;
  item.quantidadeAgora = quantidadeAgora;
  item.status = item.qtdeRecebida >= item.quantidadeSolicitada ? 'Concluído' : 'Parc.';
  if (item.status === 'Concluído') item.dataFinalizada = new Date().toISOString();

  // Só Pedido mexe no estoque. Desembarque/Cadastro são só registro.
  if (requisicao.tipoReq === 'Pedido' && requisicao.tipo === 'OPERAÇÃO') {
    // Operação: ao concluir/receber, o item vai direto pro estoque.
    const itemEstoque = await BramDB.get('estoque', String(item.idFluig));
    if (!itemEstoque) {
      throw new Error(`Nenhum item encontrado com o código "${item.idFluig}" no Estoque. Cadastre esse item primeiro.`);
    }
    if (!itemEstoque.local && !local) {
      throw new Error('LOCAL_NECESSARIO'); // sinalizador especial para a UI pedir o local
    }
    itemEstoque.quantidade += quantidadeAgora;
    if (local) itemEstoque.local = local;
    if (prateleira) itemEstoque.prateleira = prateleira;
    if (coluna) itemEstoque.coluna = coluna;
    if (linha) itemEstoque.linha = linha;
    await BramDB.put('estoque', itemEstoque);
    await BramDB.enfileirar('estoque', 'upsert', itemEstoque);

    const mov = {
      id: uid(),
      idFluig: item.idFluig,
      nome: item.nomeItem,
      tipo: 'entrada',
      quantidade: quantidadeAgora,
      unidade: itemEstoque.unidade,
      local: itemEstoque.local,
      responsavel: requisicao.solicitante,
      observacao: `Recebido da requisição ${requisicao.id}`,
      data: new Date().toISOString(),
    };
    await BramDB.put('movimentos', mov);
    await BramDB.enfileirar('movimentos', 'upsert', mov);
  }
  // Pedido de Manutenção: material já foi reservado na criação; concluir não mexe no estoque.
  // Desembarque / Cadastro: nunca mexem no estoque.

  await BramDB.put('itensStatus', item);
  await BramDB.enfileirar('itensStatus', 'upsert', item);
  await atualizarStatusRequisicao(requisicao.id);
  return item;
}

async function cancelarItemRequisicao(itemId) {
  const item = await BramDB.get('itensStatus', itemId);
  if (!item) throw new Error('Item não encontrado.');
  const requisicao = await BramDB.get('requisicoes', item.requisicaoId);

  item.status = 'Cancelado';
  item.dataFinalizada = new Date().toISOString();
  await BramDB.put('itensStatus', item);
  await BramDB.enfileirar('itensStatus', 'upsert', item);
  await atualizarStatusRequisicao(requisicao.id);
}

async function atualizarStatusRequisicao(requisicaoId) {
  const requisicao = await BramDB.get('requisicoes', requisicaoId);
  if (!requisicao) return;
  const todos = (await BramDB.getAll('itensStatus')).filter((i) => i.requisicaoId === requisicaoId);
  if (todos.length === 0) return;
  const relevantes = todos.filter((i) => i.status !== 'Cancelado');
  const status = relevantes.length > 0 && relevantes.every((i) => i.status === 'Concluído')
    ? 'Concluída'
    : relevantes.some((i) => i.status === 'Parc.' || i.status === 'Concluído')
    ? 'Em andamento'
    : 'Aberta';
  if (status === requisicao.status) return; // nada mudou — não enfileira de novo
  requisicao.status = status;
  await BramDB.put('requisicoes', requisicao);
  await BramDB.enfileirar('requisicoes', 'upsert', requisicao);
}

window.BramApp = {
  registrarMovimento,
  atualizarDadosItem,
  excluirItemEstoque,
  migrarDuplicadosEstoque,
  reenviarFotos,
  criarRequisicao,
  editarRequisicao,
  excluirRequisicao,
  definirStatusRequisicao,
  adicionarItemRequisicao,
  editarItemRequisicao,
  receberItemRequisicao,
  cancelarItemRequisicao,
  atualizarStatusRequisicao,
};
