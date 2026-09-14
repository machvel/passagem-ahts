// scanner.js — leitura de código de barras pela câmera.
//
// Sempre usa a API padrão BarcodeDetector do navegador. Em navegadores que
// já têm isso embutido (Chrome/Android), usa direto — rápido e 100% offline.
// Em navegadores sem essa leitura embutida (Safari/iPhone), carrega uma
// biblioteca ("barcode-detector", baseada em ZXing) que registra sozinha
// o mesmo window.BarcodeDetector, então o resto do código nem precisa saber
// a diferença. É a biblioteca mais usada e mais bem mantida pra isso hoje.
//
// Precisa de internet só na primeira vez que usar a câmera nesse
// aparelho — depois disso o app guarda em cache sozinho (veja sw.js).

const BARCODE_LIB_URL = 'https://cdn.jsdelivr.net/npm/barcode-detector@2/dist/es/side-effects.min.js';
let carregandoPolyfill = null;

// Exige a MESMA leitura se repetir algumas vezes seguidas antes de aceitar
// como certa — evita que um quadro isolado com ruído confunda a leitura e
// registre um código errado.
const LEITURAS_PARA_CONFIRMAR = 3;

function suportaLeituraCamera() {
  return 'mediaDevices' in navigator; // câmera em si — o método de leitura é escolhido depois
}

function carregarScriptModulo_(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Não foi possível carregar o leitor de código de barras (precisa de internet na primeira vez).'));
    document.head.appendChild(script);
  });
}

// Garante que window.BarcodeDetector exista — usa a nativa se o navegador
// já tiver, senão carrega o substituto uma vez só. Se o arquivo carregar
// "com sucesso" mas vier incompleto (ex: cache quebrado no meio do
// caminho), tenta de novo uma vez, ignorando qualquer cache antigo.
function garantirBarcodeDetector() {
  if ('BarcodeDetector' in window) return Promise.resolve();
  if (carregandoPolyfill) return carregandoPolyfill;

  carregandoPolyfill = carregarScriptModulo_(BARCODE_LIB_URL)
    .then(() => {
      if ('BarcodeDetector' in window) return;
      // Veio incompleto — tenta de novo forçando ignorar cache antigo.
      return carregarScriptModulo_(BARCODE_LIB_URL + '?v=' + Date.now());
    })
    .then(() => {
      if (!('BarcodeDetector' in window)) {
        throw new Error('O leitor de código de barras não carregou corretamente. Verifique sua internet e tente de novo.');
      }
    })
    .catch((e) => {
      carregandoPolyfill = null; // permite tentar de novo na próxima vez que abrir o scanner
      throw e;
    });
  return carregandoPolyfill;
}

function criarOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'scanner-overlay';
  overlay.innerHTML = `
    <div class="scanner-caixa">
      <div class="scanner-camera-area">
        <video class="scanner-video" autoplay playsinline muted webkit-playsinline="true"></video>
      </div>
      <p class="scanner-dica">Aponte a câmera para o código de barras</p>
      <button class="botao scanner-fechar">Cancelar</button>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

// Recebe cada leitura "crua" da câmera; só chama aoConfirmar(codigo) depois
// da mesma leitura se repetir LEITURAS_PARA_CONFIRMAR vezes seguidas.
function criarConfirmadorLeitura(aoConfirmar, aoProgredir) {
  let ultimoCodigo = null;
  let contagem = 0;
  return function (codigo) {
    if (!codigo) return;
    if (codigo === ultimoCodigo) {
      contagem += 1;
    } else {
      ultimoCodigo = codigo;
      contagem = 1;
    }
    if (aoProgredir) aoProgredir(contagem, LEITURAS_PARA_CONFIRMAR);
    if (contagem >= LEITURAS_PARA_CONFIRMAR) {
      aoConfirmar(codigo);
    }
  };
}

async function abrirScanner(aoLer) {
  if (!('mediaDevices' in navigator)) {
    alert('Este navegador não tem acesso à câmera. Digite o código manualmente.');
    return;
  }

  const overlay = criarOverlay();
  const video = overlay.querySelector('.scanner-video');
  const dica = overlay.querySelector('.scanner-dica');
  const botaoFechar = overlay.querySelector('.scanner-fechar');
  let stream = null;
  let intervalo = null;
  let encerrado = false;

  function encerrar() {
    if (encerrado) return;
    encerrado = true;
    if (intervalo) clearInterval(intervalo);
    if (stream) stream.getTracks().forEach((t) => t.stop());
    overlay.remove();
  }
  botaoFechar.addEventListener('click', encerrar);

  const mostrarProgresso = (contagem, necessarias) => {
    if (encerrado) return;
    dica.textContent = contagem >= necessarias
      ? 'Código confirmado!'
      : `Confirmando leitura… (${contagem}/${necessarias})`;
  };
  const confirmar = criarConfirmadorLeitura((codigo) => {
    encerrar();
    aoLer(codigo);
  }, mostrarProgresso);

  // Liga a câmera JÁ, ainda no mesmo toque que abriu o scanner — importante
  // pro iOS aceitar o play() automático sem precisar de um botão extra.
  // A biblioteca de leitura (quando precisa) carrega em paralelo, não antes.
  const promessaCarregarLeitor = garantirBarcodeDetector();
  let cameraOk = false;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('webkit-playsinline', 'true');
    await video.play().catch(() => {});
    cameraOk = true;
  } catch (e) {
    dica.textContent = 'Não foi possível acessar a câmera. Verifique a permissão do navegador.';
  }
  if (encerrado) return;

  if (!('BarcodeDetector' in window)) {
    dica.textContent = cameraOk ? 'Carregando leitor de código de barras…' : dica.textContent;
  }
  try {
    await promessaCarregarLeitor;
  } catch (e) {
    dica.textContent = e.message;
    return;
  }
  if (encerrado || !cameraOk) return;
  dica.textContent = 'Aponte a câmera para o código de barras';

  const detector = new BarcodeDetector({
    formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code'],
  });
  intervalo = setInterval(async () => {
    try {
      const codigos = await detector.detect(video);
      if (codigos.length > 0 && !encerrado) {
        confirmar(codigos[0].rawValue);
      }
    } catch (e) {
      // ignora falha pontual de um frame, tenta de novo no próximo
    }
  }, 250);
}

window.BramScanner = { abrirScanner, suportaLeituraCamera };
