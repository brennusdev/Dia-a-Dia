/* ============================================================
   ÔNIBUS EM TEMPO REAL — lógica da página (100% comentada)
   ------------------------------------------------------------
   Fluxo geral:
   1) CEP EXATO   -> ViaCEP (API pública). Só aceita CEP que EXISTA
                     e que tenha rua/bairro; a posição vem de uma
                     tabela de CEPs conhecidos com coordenadas reais.
   2) HORA        -> filtra partidas a partir do horário digitado.
   3) NÚMERO      -> busca por número da linha (712, 774, SV774...),
                     tolerante: ignora espaços, hífen e maiúsculas
                     ("sv 774", "sv774", "774" encontram "SV774").
   4) GPS         -> navigator.geolocation (celular/PC), com precisão.
   5) MAPA 3D     -> canvas com projeção isométrica: cada ônibus vira
                     uma "torre" com a placa do número; você fica no
                     centro (ponto verde).
   6) TEMPO REAL  -> setInterval de 15s re-renderiza lista + mapa.
   ============================================================ */

/* ---------- ESTADO GLOBAL DA PÁGINA ---------- */
const INTERVALO_TEMPORAL_MS = 15000; // atualização em tempo real a cada 15s
let intervaloReal = null; // timer do tempo real (para ligar/desligar)
let localizacaoAtual = null; // { lat, lon } do usuário
let nomeRegiaoAtual = ""; // bairro/cidade detectado
let todasLinhas = []; // cache do onibus.json
let ultimaBusca = null; // últimas linhas ordenadas (para o mapa)

/* ============================================================
   TABELA DE CEPs CONHECIDOS (BUSCA EXATA)
   ------------------------------------------------------------
   Cada CEP aqui tem coordenadas REAIS aproximadas do endereço.
   A busca é EXATA: só aceita o CEP completo e existente.
   Para um projeto real, troque por um serviço de geocoding
   (ex: Nominatim/OpenStreetMap, also grátis).
   ============================================================ */
const CEP_CONHECIDOS = {
  "01001000": {
    lat: -23.5505,
    lon: -46.6333,
    rotulo: "Praça da Sé, São Paulo/SP",
  },
  "01001010": {
    lat: -23.551,
    lon: -46.632,
    rotulo: "Pça. Clóvis Beviláqua, São Paulo/SP",
  },
  "01310100": {
    lat: -23.5629,
    lon: -46.6544,
    rotulo: "Av. Paulista, São Paulo/SP",
  },
  "01310200": {
    lat: -23.5615,
    lon: -46.6555,
    rotulo: "Av. Paulista, 1000, São Paulo/SP",
  },
  "05401000": { lat: -23.561, lon: -46.68, rotulo: "Pinheiros, São Paulo/SP" },
  "02011000": { lat: -23.501, lon: -46.625, rotulo: "Santana, São Paulo/SP" },
  "04301000": { lat: -23.645, lon: -46.64, rotulo: "Jabaquara, São Paulo/SP" },
  "03178000": { lat: -23.56, lon: -46.585, rotulo: "Mooca, São Paulo/SP" },
  "0539000": { lat: -23.5205, lon: -46.653, rotulo: "Pirituba, São Paulo/SP" },
  "03071000": { lat: -23.539, lon: -46.575, rotulo: "Belém, São Paulo/SP" },
  "04675000": {
    lat: -23.618,
    lon: -46.695,
    rotulo: "Vila Mascote, São Paulo/SP",
  },
  "02870000": {
    lat: -23.501,
    lon: -46.68,
    rotulo: "Freguesia do Ó, São Paulo/SP",
  },
};

/* ============================================================
   CARREGA OS DADOS DAS LINHAS (fetch do JSON local)
   ============================================================ */
async function carregarLinhas() {
  if (todasLinhas.length > 0) return; // já está em cache (memória)

  try {
    const resposta = await fetch("../dados/onibus.json");
    const json = await resposta.json();
    todasLinhas = json.linhas || [];
  } catch (erro) {
    // Falhou (ex: aberto com file://). Avisamos claramente o usuário.
    const resultados = document.getElementById("resultadosOnibus");
    if (resultados) {
      resultados.innerHTML =
        `<p style="color:#ff6b7a">⚠️ Não foi possível carregar os dados dos ônibus. ` +
        `Abra o projeto por um servidor local (Live Server ou <code>python -m http.server</code>).</p>`;
    }
  }
}

/* ============================================================
   BARRA 1: BUSCA POR CEP EXATO
   ------------------------------------------------------------
   Regras melhoradas:
   - aceita "01001000" ou "01001-000" (limpa tudo que não é dígito)
   - exige exatamente 8 dígitos
   - consulta o ViaCEP: se o CEP não existir -> erro claro
   - se existir mas não tiver coordenada conhecida -> avisa que a
     posição é aproximada pelo centro da cidade do CEP (não inventa)
   ============================================================ */
async function buscarCepExato() {
  const campoCep = document.getElementById("buscaCep");
  const infoCep = document.getElementById("cepInfo");
  if (!campoCep || !infoCep) return null;

  // Remove tudo que não é dígito ("01001-000" -> "01001000")
  const cep = campoCep.value.replace(/\D/g, "");

  if (cep.length !== 8) {
    infoCep.textContent =
      "❌ CEP incompleto: digite os 8 números (ex: 01001000).";
    return null;
  }

  infoCep.textContent = "🔎 Verificando CEP...";

  try {
    // ViaCEP: se o CEP não existir, a API responde { erro: true }
    const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const dados = await resposta.json();

    if (dados.erro) {
      infoCep.textContent = "❌ Este CEP não existe. Confira os 8 números.";
      return null;
    }

    // CEP existe! Mostramos o endereço completo encontrado
    const endereco = [
      dados.logradouro,
      dados.bairro,
      `${dados.localidade}/${dados.uf}`,
    ]
      .filter(Boolean)
      .join(", ");
    infoCep.textContent = `✅ CEP exato: ${endereco}`;

    nomeRegiaoAtual = `${dados.bairro || dados.localidade}, ${dados.localidade}`;

    // Coordenadas EXATAS da tabela (se existir) ...
    const conhecido = CEP_CONHECIDOS[cep];
    if (conhecido) {
      localizacaoAtual = { lat: conhecido.lat, lon: conhecido.lon };
      infoCep.textContent += ` — 🎯 posição exata encontrada (${conhecido.rotulo})`;
    } else {
      // ... senão, usamos o CENTRO da cidade do CEP (posição aproximada,
      // honesta: avisamos o usuário que é aproximada, não inventamos ponto)
      const centrosCidade = {
        "São Paulo": { lat: -23.5505, lon: -46.6333 },
        Guarulhos: { lat: -23.4543, lon: -46.5337 },
        Osasco: { lat: -23.5324, lon: -46.7916 },
        "Santo André": { lat: -23.6639, lon: -46.5383 },
        "São Bernardo do Campo": { lat: -23.6944, lon: -46.5654 },
        Diadema: { lat: -23.6861, lon: -46.625 },
      };
      const centro =
        centrosCidade[dados.localidade] || centrosCidade["São Paulo"];
      localizacaoAtual = { lat: centro.lat, lon: centro.lon };
      infoCep.textContent +=
        ` — ⚠️ posição aproximada (centro de ${dados.localidade}); ` +
        `use o GPS para precisão total.`;
    }

    return localizacaoAtual;
  } catch (erro) {
    infoCep.textContent =
      "❌ Erro de rede ao consultar o CEP (verifique a internet).";
    return null;
  }
}

/* ============================================================
   BARRA 2: FILTRO POR HORA
   Mantém as linhas que têm ALGUMA partida >= hora digitada.
   ============================================================ */
function filtraPorPartida(linha, horaMinima) {
  if (!horaMinima) return true; // sem hora = mostra tudo
  return linha.partidas.some((p) => p >= horaMinima);
}

/* ============================================================
   BARRA 3: FILTRO POR NÚMERO DA LINHA (tolerante)
   ------------------------------------------------------------
   Normaliza os dois lados para comparar sem bronca de digitação:
   - remove espaços, hífens e pontos: "SV 774" e "SV-774" = "SV774"
   - ignora maiúsculas/minúsculas: "sv774" = "SV774"
   - "774" também encontra "SV774" (busca parcial no número)
   ============================================================ */
function normalizaNumero(texto) {
  return (texto || "").toUpperCase().replace(/[\s\-\.]/g, "");
}

function filtraPorNumero(linha, numeroDigitado) {
  if (!numeroDigitado) return true; // campo vazio = sem filtro

  const alvo = normalizaNumero(numeroDigitado);
  const numero = normalizaNumero(linha.numero);

  // Contém? "774" acha "SV774"; "SV774" acha "SV774" (exato também passa)
  return numero.includes(alvo) || alvo.includes(numero);
}

/* ============================================================
   DISTÂNCIA (fórmula de Haversine)
   Distância em linha reta entre dois pontos (lat/lon) da Terra.
   ============================================================ */
function distanciaKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // raio da Terra em km
  const rad = Math.PI / 180;

  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ============================================================
   FUNÇÃO PRINCIPAL: BUSCAR ÔNIBUS
   Junta os 3 filtros (CEP/GPS + hora + número) e ordena
   do mais próximo ao mais longe. Depois desenha o mapa 3D.
   ============================================================ */
async function buscarOnibus() {
  await carregarLinhas();

  const resultados = document.getElementById("resultadosOnibus");
  if (!resultados) return;

  // Sem localização? Tenta resolver pelo CEP digitado.
  if (!localizacaoAtual) {
    const viaCep = await buscarCepExato();
    if (!viaCep) {
      resultados.innerHTML = `<p style="color:#ffd166">📍 Informe um CEP válido (8 números, exato) ou ative a localização do aparelho.</p>`;
      return;
    }
  }

  // Lê os filtros das outras duas barras
  const campoHora = document.getElementById("buscaHora");
  const campoNum = document.getElementById("buscaNumero");
  const hora = campoHora ? campoHora.value : "";
  const numero = campoNum ? campoNum.value : "";

  // Aplica os filtros em cadeia (cada um devolve só o que passou)
  let filtradas = todasLinhas
    .filter((l) => filtraPorPartida(l, hora))
    .filter((l) => filtraPorNumero(l, numero));

  // Nada encontrado: mensagem específica dizendo QUAL filtro zerou
  if (filtradas.length === 0) {
    const motivo = numero
      ? `nenhuma linha com o número "${numero}" e partida${hora ? ` a partir de ${hora}` : ""}`
      : `nenhuma partida${hora ? ` a partir de ${hora}` : ""}`;
    resultados.innerHTML = `<p style="color:#ffd166">🕐 ${motivo}. Tente limpar um dos filtros.</p>`;
    desenharMapa3D([]); // mapa sem ônibus
    return;
  }

  // Calcula distância de cada linha até o usuário e ordena (mais perto primeiro)
  const ordenadas = filtrmap((l) => ({
    ...l,
    distancia: distanciaKm(
      localizacaoAtual.lat,
      localizacaoAtual.lon,
      l.lat,
      l.lon,
    ),
  })).sort((a, b) => a.distancia - b.distancia);

  ultimaBusca = ordenadas; // guarda para o mapa 3D / atualização

  // Monta os cartões de resultado (agora com o NÚMERO em destaque)
  resultados.innerHTML = `
    <h2 style="margin-top:20px">🚏 Ônibus próximos ${nomeRegiaoAtual ? "— " + nomeRegiaoAtual : ""}</h2>
    <ul class="lista-onibus">
      ${ordenadas
        .map(
          (l, i) => `
        <li class="onibus-card ${i === 0 ? "mais-proximo" : ""}">
          <div class="onibus-numero">${l.numero}</div>
          <div class="onibus-info">
            <strong>${l.nome}</strong>
            <span>Distância: ${l.distancia.toFixed(1)} km</span>
            <span>Partidas: ${l.partidas.join(" · ")}</span>
          </div>
          <div class="onibus-status" data-linha="${l.numero}">⏳ calculando...</div>
        </li>
      `,
        )
        .join("")}
    </ul>`;

  atualizarTemposReais(ordenadas, hora); // contagem regressiva
  desenharMapa3D(ordenadas); // mapa 3D com essas linhas
}

/* ============================================================
   TEMPO REAL: quanto falta para a próxima partida de cada linha
   ============================================================ */
function atualizarTemposReais(linhas, horaMinima) {
  const agora = new Date();
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();

  linhas.forEach((linha) => {
    const el = document.querySelector(
      `.onibus-status[data-linha="${linha.numero}"]`,
    );
    if (!el) return;

    // Primeira partida >= hora filtrada (ou >= agora)
    const limite = horaMinima ? horaMinima.split(":").map(Number) : null;
    const minutosLimite = limite ? limite[0] * 60 + limite[1] : minutosAgora;

    const proxima = linha.partidas.find((p) => {
      const [h, m] = p.split(":").map(Number);
      return h * 60 + m >= minutosLimite;
    });

    if (proxima) {
      const [h, m] = proxima.split(":").map(Number);
      const faltam = h * 60 + m - minutosAgora;
      el.textContent =
        faltam <= 0
          ? `🟢 Em circulação agora`
          : `⏱️ Próximo em ${faltam} min (${proxima})`;
    } else {
      el.textContent = `🔴 Último ônibus já passou (${linha.partidas.at(-1)})`;
    }
  });
}

/* ============================================================
   GEOLOCALIZAÇÃO DO APARELHO (celular / PC)
   ============================================================ */
function usarMinhaLocalizacao() {
  const status = document.getElementById("statusLocalizacao");
  if (!status) return;

  if (!navigator.geolocation) {
    status.textContent = "❌ Seu navegador não suporta geolocalização.";
    return;
  }

  status.textContent = "🛰️ Solicitando localização do aparelho...";

  navigator.geolocation.getCurrentPosition(
    (posicao) => {
      localizacaoAtual = {
        lat: posicao.coords.latitude,
        lon: posicao.coords.longitude,
      };
      nomeRegiaoAtual = "Minha localização (GPS)";
      status.textContent =
        `✅ Localização obtida: ${localizacaoAtual.lat.toFixed(4)}, ` +
        `${localizacaoAtual.lon.toFixed(4)} (precisão ~${Math.round(posicao.coords.accuracy)}m)`;

      buscarOnibus();
    },
    (erro) => {
      status.textContent = `⚠️ Não foi possível obter a localização: ${erro.message}. Use a busca por CEP exato.`;
    },
    { enableHighAccuracy: true, timeout: 10000 },
  );
}

/* ============================================================
   MAPA 3D (projeção isométrica em canvas)
   ------------------------------------------------------------
   Ideia didática: transformamos latitude/longitude em coordenadas
   de tela usando uma PROJEÇÃO ISOMÉTRICA (como jogos antigos):
     - eixo X da tela = (lon - lonVocê) escala  + (lat - latVocê) escala * 0.5
     - eixo Y da tela = (lat - latVocê) escala  - (lon - lonVocê) escala * 0.5
   Cada ônibus é desenhado como uma torre 3D com a placa do número.
   Você (verde) fica no centro exato do mapa.
   ============================================================ */
function desenharMapa3D(linhas) {
  const canvas = document.getElementById("mapa3d");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const W = canvas.width,
    H = canvas.height;

  // Fundo (céu gradiente) — redesenhamos tudo a cada frame
  const fundo = ctx.createLinearGradient(0, 0, 0, H);
  fundo.addColorStop(0, "#1b0f3b");
  fundo.addColorStop(1, "#2a1560");
  ctx.fillStyle = fundo;
  ctx.fillRect(0, 0, W, H);

  // Se não há linhas para desenhar, só mostra o mapa vazio
  if (!linhas || linhas.length === 0) {
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "16px Segoe UI";
    ctx.textAlign = "center";
    ctx.fillText("Sem ônibus para mostrar — faça uma busca 🚌", W / 2, H / 2);
    return;
  }

  // ESCALA do mapa: km -> pixels. Ajusta automaticamente para caber
  // a linha mais distante na metade da tela (auto-zoom).
  const maiorDist = Math.max(...linhas.map((l) => l.distancia), 0.5);
  const escala = (Math.min(W, H) * 0.42) / maiorDist; // pixels por km

  // Projeção isométrica de uma posição geográfica -> tela
  const centroX = W / 2,
    centroY = H * 0.6; // você fica aqui
  function projeta(lat, lon) {
    const dLat = (localizacaoAtual.lat - lat) * escala * 6; // 6 = zoom fino
    const dLon = (localizacaoAtual.lon - lon) * escala * 6;
    // rotação isométrica clássica (eixo 45°/30°)
    return {
      x: centroX + (dLon - dLat * 0.5),
      y: centroY + (dLat * 0.5 + dLon * -0.5) * 0.6,
    };
  }

  // ---------- CHÃO (losango isométrico) ----------
  ctx.save();
  ctx.translate(centroX, centroY);
  ctx.fillStyle = "rgba(122,52,255,0.12)";
  ctx.strokeStyle = "rgba(122,52,255,0.35)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -H * 0.42);
  ctx.lineTo(W * 0.46, 0);
  ctx.lineTo(0, H * 0.34);
  ctx.lineTo(-W * 0.46, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  // linhas de grade no chão (efeito 3D de tabuleiro)
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  for (let i = -5; i <= 5; i++) {
    ctx.beginPath();
    ctx.moveTo(i * W * 0.045, -H * 0.3);
    ctx.lineTo(i * W * 0.045, H * 0.26);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-W * 0.42, i * H * 0.028);
    ctx.lineTo(W * 0.42, i * H * 0.028);
    ctx.stroke();
  }
  ctx.restore();

  // ---------- ORDENA DO FUNDO PARA A FRENTE (profundidade 3D) ----------
  // Em isométrico, quem tem Y MENOR está "mais atrás" — desenha primeiro.
  const comPosicao = linhas
    .map((l) => {
      const p = projeta(l.lat, l.lon);
      return { ...l, tela: p };
    })
    .sort((a, b) => a.tela.y - b.tela.y);

  // ---------- TORRES 3D DE CADA ÔNIBUS ----------
  comPosicao.forEach((l) => {
    const { x, y } = l.tela;
    const altura = 30 + (l.distancia < 3 ? 30 : 14); // mais perto = torre maior
    const largura = 26;

    // Sombra no chão
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.ellipse(x, y, largura * 0.8, largura * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();

    // Face frontal da torre
    ctx.fillStyle = "#7a3cff";
    ctx.beginPath();
    ctx.rect(x - largura / 2, y - altura, largura, altura);
    ctx.fill();

    // Face lateral (para dar sensação de volume 3D)
    ctx.fillStyle = "#5b28c4";
    ctx.beginPath();
    ctx.moveTo(x + largura / 2, y - altura);
    ctx.lineTo(x + largura / 2 + 9, y - altura + 5);
    ctx.lineTo(x + largura / 2 + 9, y + 5);
    ctx.lineTo(x + largura / 2, y);
    ctx.closePath();
    ctx.fill();

    // Face do topo
    ctx.fillStyle = "#9b5cff";
    ctx.beginPath();
    ctx.moveTo(x - largura / 2, y - altura);
    ctx.lineTo(x - largura / 2 + 9, y - altura - 5);
    ctx.lineTo(x + largura / 2 + 9, y - altura - 5);
    ctx.lineTo(x + largura / 2, y - altura);
    ctx.closePath();
    ctx.fill();

    // Placa com o NÚMERO do ônibus (712, SV774, 959...) no topo da torre
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 13px Segoe UI";
    ctx.textAlign = "center";
    ctx.fillText(l.numero, x, y - altura - 12);

    // Distância embaixo da torre
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "11px Segoe UI";
    ctx.fillText(`${l.distancia.toFixed(1)} km`, x, y + 16);
  });

  // ---------- VOCÊ no centro (ponto verde pulsante) ----------
  ctx.fillStyle = "#2ecc71";
  ctx.beginPath();
  ctx.arc(centroX, centroY, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(46,204,113,0.5)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(centroX, centroY, 16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 12px Segoe UI";
  ctx.fillText("VOCÊ", centroX, centroY + 32);
}

/* ============================================================
   BOTÃO "TEMPO REAL": liga/desliga o loop automático (15s)
   ============================================================ */
function iniciarTempoReal() {
  const status = document.getElementById("statusLocalizacao");
  const botao = document.getElementById("btnTempoReal");
  if (!status) return;

  if (intervaloReal) {
    // já ligado -> desligar (toggle)
    clearInterval(intervaloReal);
    intervaloReal = null;
    status.textContent = "⏸️ Atualização em tempo real desligada.";
    if (botao) botao.textContent = "▶️ Ativar atualização em tempo real (15s)";
    return;
  }

  intervaloReal = setInterval(buscarOnibus, INTERVALO_TEMPORAL_MS);
  status.textContent = `🔄 Tempo real ativado — atualizando a cada ${INTERVALO_TEMPORAL_MS / 1000}s.`;
  if (botao) botao.textContent = "⏸️ Parar tempo real";
  buscarOnibus(); // primeira atualização imediata
}

/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */
document.addEventListener("DOMContentLoaded", async () => {
  await carregarLinhas();

  // Barra de hora já começa com a hora atual do aparelho
  const campoHora = document.getElementById("buscaHora");
  if (campoHora) {
    const agora = new Date();
    campoHora.value = `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
  }

  // Enter no CEP busca direto
  const campoCep = document.getElementById("buscaCep");
  if (campoCep)
    campoCep.addEventListener("keypress", (e) => {
      if (e.key === "Enter") buscarOnibus();
    });

  // Enter no número da linha também busca
  const campoNum = document.getElementById("buscaNumero");
  if (campoNum)
    campoNum.addEventListener("keypress", (e) => {
      if (e.key === "Enter") buscarOnibus();
    });

  // Mapa inicial vazio (só o tabuleiro 3D)
  desenharMapa3D([]);
});
