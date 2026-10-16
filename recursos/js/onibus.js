/* ============================================================
   ÔNIBUS EM TEMPO REAL — lógica da página (100% comentada)
   ------------------------------------------------------------
   Fluxo geral:
   1) CEP EXATO   -> ViaCEP (API pública). Só aceita CEP que EXISTA
                     e tenha endereço; posição exata vem de tabela
                     de CEPs com coordenadas reais.
   2) HORA        -> filtra partidas a partir do horário digitado.
   3) NÚMERO      -> busca por número da linha (712, SV774, 959...),
                     tolerante (ignora espaços/hífen/maiúsculas).
   4) GPS         -> navigator.geolocation (celular/PC), alta precisão.
   5) MAPA 3D     -> MapLibre GL + OpenStreetMap: RUAS E PRÉDIOS DE VERDADE.
                      Cada ônibus é um marcador que anda pela rua real
                      (rota calculada pelo OSRM, servidor público).
                      Você é um marcador verde no mapa.
                      Câmera inclinada/giratória estilo navegação (Tesla).
   6) TEMPO REAL  -> dois relógios:
                     - relógio rápido (1s): desliza os ônibus pela rota;
                     - relógio lento (15s): refaz a busca/ordenamento.
   ============================================================ */

/* ---------- ESTADO GLOBAL DA PÁGINA ---------- */
const INTERVALO_TEMPORAL_MS = 15000; // atualização lenta (lista/ordenação)

/* Sanitização anti-XSS: todo texto dinâmico que entra em innerHTML
   passa por aqui (converte < > & " ' em entidades HTML). */
function esc(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}
const TICK_DESLIZA_MS = 2000; // desliza os ônibus a cada 2s
let intervaloReal = null; // timer do tempo real (ligar/desligar)
let localizacaoAtual = null; // { lat, lon } do usuário
let nomeRegiaoAtual = ""; // bairro/cidade detectado
let todasLinhas = []; // cache do onibus.json
let ultimaBusca = null; // últimas linhas ordenadas (para o mapa)

/* ---------- MAPA 3D (MapLibre GL) ---------- */
let mapa = null; // objeto do mapa MapLibre
let mapaPronto = false; // estilo do mapa já carregou? (evita addLayer antes do 'load')

/* Executa cb quando o estilo do mapa está pronto (na hora, se já carregou) */
function quandoMapaPronto(cb) {
  if (mapaPronto) cb();
  else mapa.once("load", cb);
}
let modo3D = true; // prédios em 3D ligados?
let marcadorVoce = null; // marcador verde "Você"
let marcadoresOnibus = {}; // { numero: marcador } de cada ônibus
let rotasOnibus = {}; // { numero: [lat,lon, lat,lon...] } rota na rua real

/* ============================================================
   TABELA DE CEPs CONHECIDOS (BUSCA EXATA)
   Coordenadas reais aproximadas do endereço de cada CEP.
   Para produção, troque por geocoding (ex: Nominatim/OSM).
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
  if (todasLinhas.length > 0) return; // cache em memória

  try {
    const resposta = await fetch("../dados/onibus.json");
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    const json = await resposta.json();
    // Validação da estrutura: só aceita se vier como { linhas: [...] }
    if (!json || !Array.isArray(json.linhas)) {
      throw new Error("Estrutura inesperada do onibus.json");
    }
    todasLinhas = json.linhas;
  } catch (erro) {
    const resultados = document.getElementById("resultadosOnibus");
    if (resultados) {
      resultados.innerHTML =
        `<p style="color:#ff6b7a">⚠️ Não foi possível carregar os dados. ` +
        `Abra o projeto por um servidor local (Live Server ou <code>python -m http.server</code>).</p>`;
    }
  }
}

/* ============================================================
   MAPA 3D COM RUAS DE VERDADE (MapLibre GL + OpenStreetMap)
   ------------------------------------------------------------
   - Estilo "osm-bright" da demo da MapLibre (grátis, sem chave):
     inclui CAMADA DE PRÉDIOS 3D (fill-extrusion) — o mesmo tipo
     de visual da tela de navegação da Tesla;
   - Câmera INCLINADA (pitch 55°) como num GPS;
   - Cada ônibus é um marcador HTML que anda pela rua real
     (rota calculada pelo OSRM). Você é um marcador verde.
   ============================================================ */
function inicializarMapa() {
  if (mapa) return; // já criado (evita recriar ao re-buscar)

  // Cria o mapa 3D centrado em São Paulo, inclinado como num GPS.
  // window._mapa fica exposto para depuração no console (F12).
  mapa = new maplibregl.Map({
    container: "mapaReal",
    style: "https://tiles.openfreemap.org/styles/liberty",
    center: [-46.6333, -23.5505],
    zoom: 13,
    pitch: 55, // inclinação da câmera (0 = topo, 85 = quase rasante)
    bearing: -20, // rotação inicial da câmera
    hash: false,
  });
  window._mapa = mapa;

  mapa.addControl(new maplibregl.NavigationControl({ visualizePitch: true }));

  // Quando o estilo terminar de carregar, montamos a camada de PRÉDIOS 3D.
  // O estilo da OpenFreeMap já traz a fonte vetorial "openmaptiles" (OSM);
  // adicionamos por cima um fill-extrusion com os PRÉDIOS em volume.
  mapa.on("load", () => {
    mapaPronto = true; // libera criação de camadas (rotas dos ônibus)
    try {
      if (!mapa.getSource("openmaptiles")) return; // estilo sem fonte vetorial

      mapa.addLayer({
        id: "predios-3d",
        type: "fill-extrusion",
        source: "openmaptiles",
        "source-layer": "building",
        minzoom: 13,
        paint: {
          // Altura real do prédio quando existir; senão 8m padrão
          "fill-extrusion-height": [
            "coalesce",
            ["get", "render_height"],
            ["get", "height"],
            8,
          ],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-color": "#8a7bd8",
          "fill-extrusion-opacity": 0.55,
        },
      });
    } catch (e) {
      // Estilo sem prédios disponível — o mapa continua 2D inclinado
      console.warn("Prédios 3D indisponíveis neste estilo:", e);
    }
  });
}

// Controles da câmera (botões na página)
function girarCamera(delta) {
  if (mapa) mapa.easeTo({ bearing: mapa.getBearing() + delta, duration: 400 });
}
function inclinacaoCamera(delta) {
  if (mapa) {
    const novo = Math.min(75, Math.max(0, mapa.getPitch() + delta));
    mapa.easeTo({ pitch: novo, duration: 400 });
  }
}
// Liga/desliga os prédios em 3D
function alternar3D() {
  if (!mapa) return;
  modo3D = !modo3D;
  const btn = document.getElementById("btnModo3D");
  if (btn) btn.textContent = modo3D ? "🏙️ Prédios 3D: ON" : "🏙️ Prédios 3D: OFF";
  const camada = mapa.getLayer("predios-3d");
  if (camada) mapa.setLayoutProperty("predios-3d", "visibility", modo3D ? "visible" : "none");
}

// Ícone de ônibus: um retângulo roxo com o número da linha dentro (HTML/CSS)
function criarMarcadorOnibus(numero, proximaPartida) {
  const el = document.createElement("div");
  el.className = "placa-onibus";
  el.title = `Linha ${numero} — próxima partida ${proximaPartida}`;
  el.textContent = `🚌 ${numero}`;
  return el;
}

// Ícone de "Você": círculo verde com halo pulsante (HTML/CSS)
function criarMarcadorVoce() {
  const el = document.createElement("div");
  el.className = "ponto-voce";
  el.innerHTML = "<span></span>";
  return el;
}

/* ============================================================
   ROTA NA RUA REAL (OSRM — servidor público de rotas)
   ------------------------------------------------------------
   Pede ao OSRM o caminho de RUAS reais entre dois pontos.
   O servidor responde com a "geometria": uma lista de
   coordenadas [lat, lon] que seguem as ruas da cidade.
   Se o OSRM estiver fora, usamos a linha reta (fallback).
   ============================================================ */
async function calcularRotaReal(latA, lonA, latB, lonB) {
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${lonA},${latA};${lonB},${latB}` +
      `?overview=full&geometries=geojson`;

    const resposta = await fetch(url);
    const dados = await resposta.json();

    if (dados.code === "Ok" && dados.routes.length > 0) {
      // GeoJSON vem como [lon, lat] — invertemos para [lat, lon]
      return dados.routes[0].geometry.coordinates.map(([lon, lat]) => [
        lat,
        lon,
      ]);
    }
  } catch (e) {
    // Sem internet ou OSRM fora -> fallback abaixo
  }

  // FALLBACK: linha reta entre os dois pontos (ainda mostra algo no mapa)
  return [
    [latA, lonA],
    [latB, lonB],
  ];
}

/* ============================================================
   MOVIMENTO EM TEMPO REAL PEAS RUAS
   ------------------------------------------------------------
   Cada ônibus tem uma rota (lista de pontos de rua). O marcador
   anda de ponto em ponto a cada "tick" (2s), como um ônibus real.
   ============================================================ */
function criarOuAtualizarOnibusNoMapa(linha) {
  inicializarMapa();

  const posInicial = [linha.lat, linha.lon];

  // Ainda não tem marcador para essa linha? Cria.
  if (!marcadoresOnibus[linha.numero]) {
    const el = criarMarcadorOnibus(linha.numero, linha.partidas[0]);
    const marcador = new maplibregl.Marker(el)
      .setLngLat(posInicial)
      .addTo(mapa);
    marcadoresOnibus[linha.numero] = marcador;

    // Clique no ônibus: popup com as informações da linha
    marcador.setPopup(
      new maplibregl.Popup({ offset: 20 }).setHTML(
        `<strong>🚌 Linha ${linha.numero}</strong><br>${linha.nome}<br>` +
          `Partidas: ${linha.partidas.join(" · ")}`,
      ),
    );

    // Calcula a ROTA NA RUA REAL entre VOCÊ e a parada do ônibus
    calcularRotaReal(
      localizacaoAtual.lat,
      localizacaoAtual.lon,
      linha.lat,
      linha.lon,
    ).then((rota) => {
      rotasOnibus[linha.numero] = rota;
      linha._pontoRota = 0; // começa no início da rota

      // Só mexemos em camadas quando o ESTILO do mapa está pronto
      // (evita erro "Style is not done loading" em buscas muito rápidas)
      quandoMapaPronto(() => {
        // Desenha a linha da rota no mapa (tracejada roxa)
        mapa.addSource(`rota-${linha.numero}`, {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: {
              type: "LineString",
              coordinates: rota.map(([lat, lon]) => [lon, lat]),
            },
          },
        });
        mapa.addLayer({
          id: `rota-${linha.numero}`,
          type: "line",
          source: `rota-${linha.numero}`,
          layout: { "line-join": "round", "line-cap": "round" },
          paint: {
            "line-color": "#9b5cff",
            "line-width": 3,
            "line-opacity": 0.7,
          },
        });
      }); // fim quandoMapaPronto
    });
  } else {
    // Já existe: só atualiza o popup (partidas podem ter mudado)
    marcadoresOnibus[linha.numero].setPopup(
      new maplibregl.Popup({ offset: 20 }).setHTML(
        `<strong>🚌 Linha ${linha.numero}</strong><br>${linha.nome}<br>` +
          `Partidas: ${linha.partidas.join(" · ")}`,
      ),
    );
  }
}

// Move todos os ônibus UM passo à frente na sua rota (chamado a cada 2s)
function deslizarOnibus() {
  Object.keys(rotasOnibus).forEach((numero) => {
    const rota = rotasOnibus[numero];
    const marcador = marcadoresOnibus[numero];
    if (!rota || rota.length < 2 || !marcador) return;

    // Avança o índice do ponto na rota (loop infinito: volta ao início).
    // Procura na FROTA DA REGIÃO (que tem a posição local), não no JSON modelo.
    const linha = (frotaRegiaoAtual ? frotaRegiaoAtual.linhas : todasLinhas)
      .find((l) => l.numero === numero);
    if (linha) {
      linha._pontoRota = ((linha._pontoRota ?? 0) + 1) % rota.length;
    }

    const idx = linha ? linha._pontoRota : 0;
    const novoPonto = rota[idx];
    marcador.setLngLat([novoPonto[1], novoPonto[0]]); // move o ônibus pela rua real
  });
}

/* ============================================================
   BARRA 1: BUSCA POR CEP EXATO
   ------------------------------------------------------------
   1) ViaCEP valida o CEP e devolve o endereço (rua, bairro, cidade, UF);
   2) Nominatim (OpenStreetMap) GEOCODIFICA esse endereço -> lat/lon EXATAS.
      Assim qualquer CEP do Brasil é posicionado corretamente no mapa
      (não apenas os da tabela CEP_CONHECIDOS);
   3) Fallback: tabela estática -> centro da cidade.
   O estado (UF) selecionado na página é usado para desambiguar
   (ex: mesma cidade existe em estados diferentes).
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

  // CACHE (10 min): mesmo CEP re-buscado no "tempo real" não repete
  // consultas ao ViaCEP/Nominatim (evita rate limit/ban do Nominatim)
  const doCache = lerCacheGeocoding(cep);
  if (doCache) {
    localizacaoAtual = doCache.localizacao;
    nomeRegiaoAtual = doCache.regiao;
    infoCep.textContent = doCache.mensagem + " (em cache, 10 min)";
    return localizacaoAtual;
  }

  try {
    // ViaCEP: se o CEP não existir, responde { erro: true }
    const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const dados = await resposta.json();

    if (dados.erro) {
      infoCep.textContent = "❌ Este CEP não existe. Confira os 8 números.";
      return null;
    }

    const endereco = [
      dados.logradouro,
      dados.bairro,
      `${dados.localidade}/${dados.uf}`,
    ]
      .filter(Boolean)
      .join(", ");

    nomeRegiaoAtual = `${dados.bairro || dados.localidade}, ${dados.localidade}`;

    // O ESTADO escolhido na página manda na desambiguação:
    // se o usuário trocar a UF, avisamos caso o CEP seja de outro estado.
    const ufSelecionada = document.getElementById("buscaEstado")?.value;
    if (ufSelecionada && ufSelecionada !== dados.uf) {
      infoCep.textContent =
        `⚠️ Este CEP é de ${dados.localidade}/${dados.uf}, mas você selecionou ` +
        `${ufSelecionada}. Vamos mostrar o endereço real do CEP (${dados.uf}).`;
    }

    // 1ª tentativa: TABELA DE CEPs CONHECIDOS (instantânea)
    const conhecido = CEP_CONHECIDOS[cep];
    if (conhecido) {
      localizacaoAtual = { lat: conhecido.lat, lon: conhecido.lon };
      const mensagem =
        `✅ CEP exato: ${endereco} — 🎯 posição exata (${conhecido.rotulo})`;
      gravarCacheGeocoding(cep, {
        localizacao: { ...localizacaoAtual },
        regiao: nomeRegiaoAtual,
        mensagem,
      });
      infoCep.textContent = mensagem;
      return localizacaoAtual;
    }

    // 2ª tentativa: GEOCODIFICAÇÃO REAL (Nominatim / OpenStreetMap).
    // Busca pelo CEP; se falhar, busca pelo endereço completo do ViaCEP.
    infoCep.textContent = "🛰️ Localizando endereço no mapa...";
    const coord = await geocodificarCep(dados, ufSelecionada);
    if (coord) {
      localizacaoAtual = coord;
      const mensagem =
        `✅ CEP: ${endereco} — 🎯 localizado no mapa (rua real, coordenadas precisas)`;
      gravarCacheGeocoding(cep, {
        localizacao: { ...localizacaoAtual },
        regiao: nomeRegiaoAtual,
        mensagem,
      });
      infoCep.textContent = mensagem;
      return localizacaoAtual;
    }

    // 3ª tentativa: FALLBACK — centro da cidade do CEP (via Nominatim)
    infoCep.textContent = "🛰️ Localizando cidade...";
    const centroCidade = await geocodificar(
      `${dados.localidade}, ${dados.uf}, Brasil`,
    );
    if (centroCidade) {
      localizacaoAtual = centroCidade;
      const mensagem =
        `✅ CEP: ${endereco} — ⚠️ posição aproximada (centro de ${dados.localidade}/${dados.uf}); ` +
        `o número exato não foi encontrado no mapa aberto.`;
      gravarCacheGeocoding(cep, {
        localizacao: { ...localizacaoAtual },
        regiao: nomeRegiaoAtual,
        mensagem,
      });
      infoCep.textContent = mensagem;
      return localizacaoAtual;
    }

    infoCep.textContent =
      "❌ Não foi possível localizar este CEP no mapa. Tente novamente em instantes.";
    return null;
  } catch (erro) {
    infoCep.textContent = "❌ Erro de rede ao consultar o CEP.";
    return null;
  }
}

/* ============================================================
   GEOCODIFICAÇÃO (Nominatim — OpenStreetMap, gratuito)
   ------------------------------------------------------------
   Converte um TEXTO de endereço em coordenadas reais.
   Exige um header User-Agent identificando a aplicação.
   ============================================================ */
async function geocodificar(texto) {
  try {
    const url =
      `https://nominatim.openstreetmap.org/search?format=json&limit=1` +
      `&countrycodes=br&addressdetails=1&q=${encodeURIComponent(texto)}`;

    const resposta = await fetch(url, {
      headers: { "User-Agent": "ProjetoDiaADia/1.0 (uso pessoal)" },
    });
    const lista = await resposta.json();

    if (Array.isArray(lista) && lista.length > 0) {
      return {
        lat: parseFloat(lista[0].lat),
        lon: parseFloat(lista[0].lon),
      };
    }
  } catch (e) {
    // sem internet ou Nominatim fora -> fallback do chamador
  }
  return null;
}

/* ============================================================
   GEOCODIFICA UM CEP (com o ESTADO para desambiguar)
   ------------------------------------------------------------
   1ª passada: "<CEP>, <UF>, Brasil" — Nominatim entende CEP direto;
   2ª passada: endereço completo do ViaCEP (rua, número, bairro, cidade, UF).
   ============================================================ */
async function geocodificarCep(viaCep, ufSelecionada) {
  const uf = ufSelecionada || viaCep.uf;

  // Passada 1: o próprio CEP como texto
  const porCep = await geocodificar(`${viaCep.cep}, ${uf}, Brasil`);
  if (porCep) return porCep;

  // Passada 2: endereço completo (rua + bairro + cidade + UF)
  const enderecoCompleto = [
    viaCep.logradouro,
    viaCep.bairro,
    viaCep.localidade,
    uf,
    "Brasil",
  ]
    .filter(Boolean)
    .join(", ");
  return await geocodificar(enderecoCompleto);
}

/* ============================================================
   BARRA 2: FILTRO POR HORA
   ============================================================ */
function filtraPorPartida(linha, horaMinima) {
  if (!horaMinima) return true;
  return linha.partidas.some((p) => p >= horaMinima);
}

/* ============================================================
   BARRA 3: FILTRO POR NÚMERO (tolerante)
   "sv 774" / "SV-774" / "sv774" = "SV774"; "774" acha "SV774".
   ============================================================ */
function normalizaNumero(texto) {
  return (texto || "").toUpperCase().replace(/[\s\-\.]/g, "");
}

function filtraPorNumero(linha, numeroDigitado) {
  if (!numeroDigitado) return true;
  const alvo = normalizaNumero(numeroDigitado);
  const numero = normalizaNumero(linha.numero);
  return numero.includes(alvo) || alvo.includes(numero);
}

/* ============================================================
   DISTÂNCIA (fórmula de Haversine)
   ============================================================ */
function distanciaKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ============================================================
   VÍNCULO REGIÃO → ÔNIBUS DA REGIÃO
   ------------------------------------------------------------
   As linhas do onibus.json são "modelos" (número, nome, partidas).
   Quando você busca um CEP (ou usa o GPS), GERAMOS a frota daquela
   região: cada linha é posicionada ao redor do LOCAL BUSCADO
   (espalhadas em raios de 0.5 a 6 km, em ângulos variados).
   Assim o mapa vincula automaticamente os ônibus ao local exato.

   Em produção, troque esta função pela API oficial da cidade
   (ex: Olho Vivo/SPTrans para SP) que devolve os ônibus reais
   daquela latitude/longitude — a estrutura já está pronta.
   ============================================================ */
let frotaRegiaoAtual = null; // linhas posicionadas na região buscada

/* ============================================================
   CACHE DE LOCALIZAÇÃO POR CEP (memória, ~10 min)
   ------------------------------------------------------------
   O Nominatim (OpenStreetMap) tem política de rate limit e pode
   BLOQUEAR IPs que repetem consultas rápido. Como o modo "tempo
   real" refaz a busca a cada 15s, guardamos o resultado do
   geocoding por 10 minutos — o mesmo CEP não é geocodificado
   de novo dentro desse prazo.
   ============================================================ */
const CACHE_GEO_MS = 10 * 60 * 1000; // 10 minutos
const cacheGeocoding = {}; // { cep: { valor, expiraEm } }

function lerCacheGeocoding(cep) {
  const item = cacheGeocoding[cep];
  if (item && item.expiraEm > Date.now()) return item.valor;
  delete cacheGeocoding[cep]; // expirou
  return null;
}

function gravarCacheGeocoding(cep, valor) {
  cacheGeocoding[cep] = { valor, expiraEm: Date.now() + CACHE_GEO_MS };
}

// Gera (ou reaproveita) a frota da região em torno de {lat, lon}
function gerarFrotaDaRegiao(local) {
  // Já geramos a frota desta mesma região? Reaproveita (evita os
  // ônibus "teletransportarem" a cada re-busca).
  if (
    frotaRegiaoAtual &&
    Math.abs(frotaRegiaoAtual.centro.lat - local.lat) < 0.001 &&
    Math.abs(frotaRegiaoAtual.centro.lon - local.lon) < 0.001
  ) {
    return frotaRegiaoAtual.linhas;
  }

  // Ângulos fixos (graus) para espalhar as linhas em volta do local
  const ANGULOS = [0, 40, 80, 120, 160, 200, 240, 280, 320, 350];
  // Raios em km: metade das linhas perto (até 3km), metade mais longe
  const RAIOS = [0.6, 1.2, 2.0, 2.8, 3.5, 4.2, 5.0, 5.8, 6.5, 7.2];

  const grausParaKm = 111;
  const cosLat = Math.cos(local.lat * (Math.PI / 180));

  const linhas = todasLinhas.slice(0, ANGULOS.length).map((modelo, i) => {
    const ang = (ANGULOS[i] * Math.PI) / 180;     // ângulo em radianos
    const raio = RAIOS[i];                         // distância em km

    // Converte "km ao norte" e "km a leste" em graus de lat/lon
    const deltaLat = (raio * Math.sin(ang)) / grausParaKm;
    const deltaLon = (raio * Math.cos(ang)) / (grausParaKm * cosLat);

    return {
      ...modelo,
      lat: local.lat + deltaLat,
      lon: local.lon + deltaLon,
    };
  });

  frotaRegiaoAtual = { centro: { ...local }, linhas };
  return linhas;
}

/* ============================================================
   FUNÇÃO PRINCIPAL: BUSCAR ÔNIBUS
   ============================================================ */
async function buscarOnibus() {
  await carregarLinhas();

  const resultados = document.getElementById("resultadosOnibus");
  if (!resultados) return;

  // CEP digitado? SEMPRE revalida (busca honesta a cada clique)
  const campoCepInit = document.getElementById("buscaCep");
  const digitouCep =
    campoCepInit && campoCepInit.value.replace(/\D/g, "").length > 0;

  if (digitouCep) {
    const viaCep = await buscarCepExato();
    if (!viaCep) {
      resultados.innerHTML = `<p style="color:#ff6b7a">📍 Corrija o CEP (8 números, exato) ou limpe o campo para usar o GPS.</p>`;
      return;
    }
  } else if (!localizacaoAtual) {
    resultados.innerHTML = `<p style="color:#ffd166">📍 Informe um CEP válido (8 números, exato) ou ative a localização do aparelho.</p>`;
    return;
  }

  // VÍNCULO COM A REGIÃO: gera/posiciona os ônibus ao redor do
  // local exato buscado (CEP ou GPS). Daqui pra frente, "todasLinhas"
  // usadas na busca são as da REGIÃO, não as de SP fixas.
  const linhasRegiao = gerarFrotaDaRegiao(localizacaoAtual);

  // Filtros da barra de hora e do número
  const campoHora = document.getElementById("buscaHora");
  const campoNum = document.getElementById("buscaNumero");
  const hora = campoHora ? campoHora.value : "";
  const numero = campoNum ? campoNum.value : "";

  let filtradas = linhasRegiao
    .filter((l) => filtraPorPartida(l, hora))
    .filter((l) => filtraPorNumero(l, numero));

  if (filtradas.length === 0) {
    const motivo = numero
      ? `nenhuma linha com o número "${numero}" e partida${hora ? ` a partir de ${hora}` : ""}`
      : `nenhuma partida${hora ? ` a partir de ${hora}` : ""}`;
    resultados.innerHTML = `<p style="color:#ffd166">🕐 ${motivo}. Tente limpar um dos filtros.</p>`;
    return;
  }

  // Ordena do mais próximo ao mais longe
  const ordenadas = filtradas
    .map((l) => ({
      ...l,
      distancia: distanciaKm(
        localizacaoAtual.lat,
        localizacaoAtual.lon,
        l.lat,
        l.lon,
      ),
    }))
    .sort((a, b) => a.distancia - b.distancia);

  ultimaBusca = ordenadas;

  // Lista de resultados (com NÚMERO em destaque)
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

  atualizarTemposReais(ordenadas, hora);
  atualizarMapa(ordenadas); // põe tudo no mapa real
}

/* ============================================================
   ATUALIZA O MAPA REAL (marcadores + rotas + você)
   ============================================================ */
function atualizarMapa(ordenadas) {
  inicializarMapa();

  // Limpa marcadores/rotas da região ANTERIOR (novo CEP = nova frota)
  Object.values(marcadoresOnibus).forEach((m) => m.remove());
  Object.keys(rotasOnibus).forEach((numero) => {
    if (mapa.getLayer(`rota-${numero}`)) mapa.removeLayer(`rota-${numero}`);
    if (mapa.getSource(`rota-${numero}`)) mapa.removeSource(`rota-${numero}`);
  });
  marcadoresOnibus = {};
  rotasOnibus = {};

  // Centraliza a câmera NO LOCAL EXATO buscado (CEP ou GPS)
  mapa.flyTo({
    center: [localizacaoAtual.lon, localizacaoAtual.lat],
    zoom: 14,
    pitch: 55,
    duration: 1200,
  });

  // Marcador verde "Você" (cria ou move)
  if (!marcadorVoce) {
    marcadorVoce = new maplibregl.Marker({ element: criarMarcadorVoce() })
      .setLngLat([localizacaoAtual.lon, localizacaoAtual.lat])
      .setPopup(
        new maplibregl.Popup({ offset: 20 }).setHTML(
          "<strong>🟢 Você está aqui</strong>",
        ),
      )
      .addTo(mapa);
  } else {
    marcadorVoce.setLngLat([localizacaoAtual.lon, localizacaoAtual.lat]);
  }

  // Cria (ou atualiza) cada ônibus do resultado
  ordenadas.forEach((linha) => criarOuAtualizarOnibusNoMapa(linha));
}

/* ============================================================
   TEMPO REAL: contagem regressiva das partidas
   ============================================================ */
function atualizarTemposReais(linhas, horaMinima) {
  const agora = new Date();
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();

  linhas.forEach((linha) => {
    const el = document.querySelector(
      `.onibus-status[data-linha="${linha.numero}"]`,
    );
    if (!el) return;

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
          ? "🟢 Em circulação agora"
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
   FAVORITOS DE CEP (localStorage — ficam no aparelho)
   ------------------------------------------------------------
   Estrutura: [{ cep, rotulo, criadoEm }]
   ============================================================ */
function lerFavoritos() {
  try {
    return JSON.parse(localStorage.getItem("cepsFavoritos")) || [];
  } catch (e) {
    return [];
  }
}

function escreverFavoritos(lista) {
  localStorage.setItem("cepsFavoritos", JSON.stringify(lista));
  renderizarFavoritos();
}

// Salva o CEP atualmente digitado no campo (com o rótulo do ViaCEP
// se já buscamos; senão o CEP puro)
async function salvarFavoritoDoCampo() {
  const campo = document.getElementById("buscaCep");
  const info = document.getElementById("cepInfo");
  if (!campo) return;

  const cep = campo.value.replace(/\D/g, "");
  if (cep.length !== 8) {
    if (info) info.textContent = "❌ Digite um CEP válido (8 números) antes de salvar.";
    return;
  }

  const favoritos = lerFavoritos();
  if (favoritos.some((f) => f.cep === cep)) {
    if (info) info.textContent = "ℹ️ Este CEP já está nos favoritos.";
    return;
  }

  // Busca o endereço no ViaCEP para dar um RÓTULO amigável
  let rotulo = cep;
  try {
    const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const dados = await resposta.json();
    if (!dados.erro) {
      rotulo = [dados.logradouro, dados.bairro, `${dados.localidade}/${dados.uf}`]
        .filter(Boolean)
        .join(", ");
    }
  } catch (e) {
    // sem internet: salva com o CEP puro mesmo
  }

  favoritos.push({ cep, rotulo, criadoEm: Date.now() });
  escreverFavoritos(favoritos);
  if (info) info.textContent = `⭐ Favorito salvo: ${rotulo}`;
}

// Remove um favorito pelo CEP
function removerFavorito(cep) {
  escreverFavoritos(lerFavoritos().filter((f) => f.cep !== cep));
}

// Busca direto um favorito (1 clique: preenche o campo e dispara a busca)
function usarFavorito(cep) {
  const campo = document.getElementById("buscaCep");
  if (campo) campo.value = cep;
  buscarOnibus();
}

// Desenha a lista de favoritos na página
function renderizarFavoritos() {
  const caixa = document.getElementById("listaFavoritos");
  if (!caixa) return;

  const favoritos = lerFavoritos();
  if (favoritos.length === 0) {
    caixa.innerHTML = `<p style="opacity:0.6; font-size:13px">Nenhum favorito ainda — busque um CEP e clique em “Salvar como favorito”.</p>`;
    return;
  }

  caixa.innerHTML = favoritos
    .map(
      (f) => `
      <div class="favorito-item">
        <button type="button" class="favorito-usar" onclick="usarFavorito('${f.cep}')"
          title="Buscar ônibus neste CEP">
          ⭐ <strong>${f.cep}</strong> — ${esc(f.rotulo)}
        </button>
        <button type="button" class="favorito-remover" onclick="removerFavorito('${f.cep}')"
          title="Remover dos favoritos">🗑️</button>
      </div>`,
    )
    .join("");
}

/* ============================================================
   BOTÃO "TEMPO REAL": liga/desliga os dois relógios
   - lento (15s): refaz a busca (ordenamento/lista)
   - rápido (2s): desliza os ônibus pela rota nas ruas reais
   ============================================================ */
let intervaloDesliza = null;

function iniciarTempoReal() {
  const status = document.getElementById("statusLocalizacao");
  const botao = document.getElementById("btnTempoReal");
  if (!status) return;

  if (intervaloReal) {
    // já ligado -> desligar os dois relógios
    clearInterval(intervaloReal);
    clearInterval(intervaloDesliza);
    intervaloReal = null;
    intervaloDesliza = null;
    status.textContent = "⏸️ Tempo real desligado.";
    if (botao) botao.textContent = "▶️ Ativar atualização em tempo real (15s)";
    return;
  }

  // Relógio lento: refaz a busca
  intervaloReal = setInterval(buscarOnibus, INTERVALO_TEMPORAL_MS);
  // Relógio rápido: move os ônibus pelas ruas
  intervaloDesliza = setInterval(deslizarOnibus, TICK_DESLIZA_MS);

  status.textContent =
    `🔄 Tempo real ATIVO — ônibus deslizando pelas ruas a cada ${TICK_DESLIZA_MS / 1000}s ` +
    `e busca geral a cada ${INTERVALO_TEMPORAL_MS / 1000}s.`;
  if (botao) botao.textContent = "⏸️ Parar tempo real";
  buscarOnibus();
}

/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */
document.addEventListener("DOMContentLoaded", async () => {
  await carregarLinhas();
  inicializarMapa(); // mapa já aparece com as ruas de SP

  // FAVORITOS: desenha a lista salva no aparelho
  renderizarFavoritos();

  // Hora padrão = agora
  const campoHora = document.getElementById("buscaHora");
  if (campoHora) {
    const agora = new Date();
    campoHora.value = `${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`;
  }

  // Enter em CEP e número busca direto
  const campoCep = document.getElementById("buscaCep");
  if (campoCep)
    campoCep.addEventListener("keypress", (e) => {
      if (e.key === "Enter") buscarOnibus();
    });
  const campoNum = document.getElementById("buscaNumero");
  if (campoNum)
    campoNum.addEventListener("keypress", (e) => {
      if (e.key === "Enter") buscarOnibus();
    });
});
