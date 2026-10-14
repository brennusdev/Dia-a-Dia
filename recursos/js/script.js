/* ============================================================
   PLANNER "DIA A DIA" — SCRIPT PRINCIPAL (100% comentado p/ estudo)
   ------------------------------------------------------------
   Este arquivo é carregado por TODAS as páginas (em ../recursos/js).
   Cada função verifica se os elementos existem (if (!el) return),
   por isso um único arquivo serve para todas as telas.

   Seções:
     1. Relógio ao vivo
     2. Calendário de anotações (com tipos de dia)
     3. Tarefas por dia (via calendário)
     4. Login / Cadastro / Recuperação por SMS (demo)
     5. Financeiro
     6. Lista de tarefas com data
     7. Inicialização (detecta em qual página está)
   ============================================================ */

/* ============================================================
   1. RELÓGIO AO VIVO
   Atualiza o elemento #relogio a cada 1 segundo.
   ============================================================ */
function atualizarRelogio() {
  const agora = new Date(); // data/hora atual do aparelho
  const h = agora.getHours().toString().padStart(2, "0"); // horas com 2 dígitos ("07")
  const m = agora.getMinutes().toString().padStart(2, "0"); // minutos
  const s = agora.getSeconds().toString().padStart(2, "0"); // segundos
  const rel = document.getElementById("relogio");
  if (rel) rel.innerHTML = `${h}:${m}:${s}`; // só escreve se o elemento existir
}
setInterval(atualizarRelogio, 1000); // chama a cada 1 segundo (loop infinito)
atualizarRelogio(); // chama já na carga para não ficar vazio 1s

/* ============================================================
   2. CALENDÁRIO DE ANOTAÇÕES (com troca de mês)
   Cada dia pode ter um "tipo": urgente / prioridade / normal.
   Tudo é salvo no localStorage (persiste no dispositivo).
   ============================================================ */
let mesOffset = 0; // deslocamento: 0 = mês atual, -1 = mês anterior...
let mesAtualState = null; // guardamos {ano, mes} do mês exibido
let diaSelecionado = null; // número do dia clicado (1..31)

// Chave única do localStorage para a anotação de um dia.
// Ex: "anot_dia_14_10_2026"
function keyDia(dia, ano, mesIndex) {
  return `anot_dia_${dia}_${mesIndex + 1}_${ano}`;
}

// Chave única do localStorage para as TAREFAS de um dia.
// Ex: "tarefas_dia_14_10_2026"
function keyTarefasDia(dia, ano, mesIndex) {
  return `tarefas_dia_${dia}_${mesIndex + 1}_${ano}`;
}

// Converte o deslocamento (mesOffset) em {ano, mes} reais.
function getMonthStateFromOffset() {
  const base = new Date(); // hoje
  const dt = new Date(base.getFullYear(), base.getMonth() + mesOffset, 1);
  return { ano: dt.getFullYear(), mes: dt.getMonth() }; // mês: 0..11
}

// Volta/avança um mês (setas ◀ ▶) e redesenha o calendário.
function mudarMes(delta) {
  mesOffset += delta;
  diaSelecionado = null; // ao trocar de mês, desmarca o dia clicado
  gerarCalendarioAnotacoes(); // redesenha a grade de dias
  renderTarefasDoDia(null); // limpa a lista lateral
}

// Desenha o calendário completo do mês exibido.
function gerarCalendarioAnotacoes() {
  const cal = document.getElementById("calendario"); // grade de dias
  const mesInfo = document.getElementById("mes-atual"); // título "outubro de 2026"
  if (!cal || !mesInfo) return; // não é a página de anotações

  mesAtualState = getMonthStateFromOffset();
  const { ano, mes } = mesAtualState;

  // Em que dia da semana cai o dia 1? (0=domingo ... 6=sábado)
  const primeiroDia = new Date(ano, mes, 1).getDay();
  // Quantos dias tem o mês? (dia 0 do mês seguinte = último dia deste mês)
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();

  // Título do mês por extenso, em português
  const dtMes = new Date(ano, mes, 1);
  mesInfo.innerHTML = dtMes.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });

  let html = "";
  // Espaços vazios antes do dia 1 (para alinhar com o dia da semana)
  for (let i = 0; i < primeiroDia; i++) html += '<div class="dia-vazio"></div>';

  // Cria um cartão para cada dia do mês
  for (let dia = 1; dia <= diasNoMes; dia++) {
    const saved = localStorage.getItem(keyDia(dia, ano, mes)); // anotação salva?
    const tipo = saved ? JSON.parse(saved).tipo || "" : ""; // tipo do dia
    const classeTipo = tipo ? `dia-${tipo}` : ""; // classe CSS de cor

    const isSelected = diaSelecionado === dia; // dia clicado?
    const selectedClass = isSelected ? "dia-selecionado" : "";

    html += `
            <div class="dia-grid ${classeTipo} ${selectedClass}"
                 data-dia="${dia}"
                 onclick="selecionarDia(${dia})"
                 aria-label="Dia ${dia}">
                <div class="dia-num">${dia}</div>
            </div>
        `;
  }

  cal.innerHTML = html; // injeta tudo de uma vez (mais rápido que 30 appends)
}

// Marca um dia como selecionado e mostra suas tarefas.
function selecionarDia(dia) {
  if (!mesAtualState) return;
  diaSelecionado = dia;
  gerarCalendarioAnotacoes(); // re-renderiza para destacar o dia
  renderTarefasDoDia(dia); // mostra as tarefas daquele dia
}

// Clica no dia selecionado para CICLAR o tipo: normal → urgente → prioridade...
function ciclarTipoDiaAtual() {
  if (!mesAtualState || !diaSelecionado) return;
  const { ano, mes } = mesAtualState;

  const dataKey = keyDia(diaSelecionado, ano, mes);
  const tipos = ["urgente", "prioridade", "normal"]; // ordem da rotação

  const atualObj = localStorage.getItem(dataKey);
  const atualTipo = atualObj ? JSON.parse(atualObj).tipo || "" : "";

  // indexOf devolve -1 se não achou; +1 e % move para o próximo da lista
  const proxIndex = tipos.indexOf(atualTipo) + 1;
  const novoTipo = tipos[proxIndex % tipos.length];

  localStorage.setItem(dataKey, JSON.stringify({ tipo: novoTipo }));
  gerarCalendarioAnotacoes(); // redesenha com a nova cor
}

/* ============================================================
   3. TAREFAS POR DIA (via calendário de anotações)
   ============================================================ */

// Lista as tarefas salvas para o dia clicado.
function renderTarefasDoDia(dia) {
  const lista = document.getElementById("listaDia");
  const label = document.getElementById("dia-selecionado");

  // Se faltar algo (ou nenhum dia clicado), mostra o texto de ajuda
  if (!lista || !label || !mesAtualState || !dia) {
    if (label) label.textContent = "Clique em um dia do calendário";
    if (lista) lista.innerHTML = "";
    return;
  }

  const { ano, mes } = mesAtualState;
  label.textContent = `Dia ${dia} / ${mes + 1} / ${ano}`;

  const key = keyTarefasDia(dia, ano, mes);
  const tarefas = JSON.parse(localStorage.getItem(key) || "[]");

  if (tarefas.length === 0) {
    lista.innerHTML = `<li style="opacity:0.75">Nenhuma tarefa para este dia.</li>`;
    return;
  }

  // .map() transforma cada tarefa em um <li>; join() junta tudo
  lista.innerHTML = tarefas
    .map(
      (t) => `
        <li class="tarefa-item ${t.completa ? "completa" : ""}">
            <input type="checkbox" ${t.completa ? "checked" : ""} onchange="toggleTarefaDia(${t.id})" data-tarefa-id="${t.id}">
            <span>${t.texto}</span>
            <button onclick="deletarTarefaDia(${t.id})" type="button">🗑️</button>
        </li>
    `,
    )
    .join("");
}

// Marca/desmarca uma tarefa como concluída (checkbox).
function toggleTarefaDia(id) {
  if (!mesAtualState || !diaSelecionado) return;
  const { ano, mes } = mesAtualState;
  const key = keyTarefasDia(diaSelecionado, ano, mes);

  let tarefas = JSON.parse(localStorage.getItem(key) || "[]");
  const idx = tarefas.findIndex((t) => t.id === id);
  if (idx < 0) return; // tarefa não existe (safety)
  tarefas[idx].completa = !tarefas[idx].completa; // inverte o estado
  localStorage.setItem(key, JSON.stringify(tarefas));
  renderTarefasDoDia(diaSelecionado);
}

// Remove uma tarefa do dia (filtro: mantém todas exceto a de id X).
function deletarTarefaDia(id) {
  if (!mesAtualState || !diaSelecionado) return;
  const { ano, mes } = mesAtualState;
  const key = keyTarefasDia(diaSelecionado, ano, mes);

  let tarefas = JSON.parse(localStorage.getItem(key) || "[]");
  tarefas = tarefas.filter((t) => t.id !== id);
  localStorage.setItem(key, JSON.stringify(tarefas));
  renderTarefasDoDia(diaSelecionado);
}

/* ============================================================
   4. LOGIN / CADASTRO / RECUPERAÇÃO POR SMS (DEMO)
   ATENÇÃO: sem backend. Guardamos em localStorage apenas para
   estudar o fluxo de UI. NUNCA faça isso em produção!
   ============================================================ */

// Troca a tela de login pela tela "esqueci minha senha".
function mostrarEsqueciSenha() {
  const loginView = document.getElementById("login-view");
  const forgotView = document.getElementById("forgot-view");
  if (loginView) loginView.style.display = "none";
  if (forgotView) forgotView.style.display = "block";
}

// Volta da tela de recuperação para o login.
function voltarLogin() {
  const loginView = document.getElementById("login-view");
  const forgotView = document.getElementById("forgot-view");
  if (forgotView) forgotView.style.display = "none";
  if (loginView) loginView.style.display = "block";
}

// Login: compara usuário/senha digitados com o que está salvo.
function fazerLogin() {
  const usuario = document.getElementById("loginUsuario");
  const senha = document.getElementById("loginSenha");
  const msg = document.getElementById("login-msg");

  if (!usuario || !senha || !msg) return;

  const user = usuario.value.trim();
  const pass = senha.value;

  // Lê a "base de usuários" do localStorage (demo)
  const raw = localStorage.getItem("users_planner_v1");
  const users = raw ? JSON.parse(raw) : [];

  const encontrado = users.find((u) => u.usuario === user);

  if (!encontrado) {
    msg.style.color = "#ff6b7a";
    msg.textContent = "Usuário não encontrado.";
    return;
  }

  if (encontrado.senha !== pass) {
    msg.style.color = "#ff6b7a";
    msg.textContent = "Senha incorreta.";
    return;
  }

  // Login OK: registramos a sessão (demo) e vamos ao menu
  localStorage.setItem(
    "login_planner_v1",
    JSON.stringify({ usuario: user, logadoEm: Date.now() }),
  );
  msg.style.color = "#2ecc71";
  msg.textContent = "Login efetuado. Prosseguindo...";

  setTimeout(() => {
    window.location.href = "index.html";
  }, 500);
}

// Cadastro: valida campos e salva um novo usuário (demo).
function cadastrarUsuario() {
  const u = document.getElementById("cadUsuario");
  const s = document.getElementById("cadSenha");
  const t = document.getElementById("cadTelefone");
  const msg = document.getElementById("cadastro-msg");
  if (!u || !s || !msg) return;

  const usuario = u.value.trim();
  const senha = s.value;
  const telefone = t ? (t.value || "").trim() : "";

  // Validações simples
  if (usuario.length < 3) {
    msg.style.color = "#ff6b7a";
    msg.textContent = "Usuário deve ter pelo menos 3 caracteres.";
    return;
  }

  if (senha.length < 4) {
    msg.style.color = "#ff6b7a";
    msg.textContent = "Senha deve ter pelo menos 4 caracteres.";
    return;
  }

  const raw = localStorage.getItem("users_planner_v1");
  const users = raw ? JSON.parse(raw) : [];

  // Não pode existir usuário repetido
  const existe = users.some((x) => x.usuario === usuario);
  if (existe) {
    msg.style.color = "#ff6b7a";
    msg.textContent = "Esse usuário já existe.";
    return;
  }

  users.push({ usuario, senha, telefone });
  localStorage.setItem("users_planner_v1", JSON.stringify(users));

  msg.style.color = "#2ecc71";
  msg.textContent = "Cadastro realizado com sucesso! Faça login.";

  setTimeout(() => {
    window.location.href = "login.html";
  }, 800);
}

// Simula o envio de um código SMS (gera 6 dígitos e guarda).
function enviarCodigoSMS() {
  const telEl = document.getElementById("resetTelefone");
  const resetMsg = document.getElementById("reset-msg");

  if (!telEl || !resetMsg) return;

  const telefone = (telEl.value || "").trim();
  const codigo = gerarCodigo();

  // Em um app real, um SERVIDOR enviaria o SMS. Aqui salvamos local (demo).
  localStorage.setItem(
    "sms_demo_codigo",
    JSON.stringify({ telefone, codigo, geradoEm: Date.now() }),
  );

  resetMsg.style.color = "#d7b3ff";
  resetMsg.textContent = "Código enviado (demo). Verifique o campo abaixo.";

  const smsArea = document.querySelector(".sms-area");
  const codigoEl = document.getElementById("resetCodigo");
  if (smsArea) smsArea.style.display = "block";
  if (codigoEl) codigoEl.value = "";

  // Mostra o código no console (F12) porque é só uma demonstração
  console.log("[DEMO SMS] Código:", codigo);
}

// Gera um código de 6 dígitos (100000..999999).
function gerarCodigo() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Confirma o código digitado e "redefine" a senha (demo).
function confirmarRedefinicao() {
  const resetCodigo = document.getElementById("resetCodigo");
  const resetNovaSenha = document.getElementById("resetNovaSenha");
  const resetMsg = document.getElementById("reset-msg");

  if (!resetCodigo || !resetNovaSenha || !resetMsg) return;

  const codigoDigitado = (resetCodigo.value || "").trim();
  const novoSenha = (resetNovaSenha.value || "").trim();

  const raw = localStorage.getItem("sms_demo_codigo");
  if (!raw) {
    resetMsg.style.color = "#ff6b7a";
    resetMsg.textContent = "Nenhum código foi enviado. Tente novamente.";
    return;
  }

  const data = JSON.parse(raw);
  if (data.codigo !== codigoDigitado) {
    resetMsg.style.color = "#ff6b7a";
    resetMsg.textContent = "Código inválido. Verifique e tente novamente.";
    return;
  }

  // Grava a "senha" demo
  localStorage.setItem(
    "senha_demo",
    JSON.stringify({ senha: novoSenha, redefinidoEm: Date.now() }),
  );

  resetMsg.style.color = "#2ecc71";
  resetMsg.textContent = "Senha redefinida com sucesso (demo).";

  setTimeout(() => {
    voltarLogin();
  }, 800);
}

/* ============================================================
   5. FINANCEIRO (entrada, saída e meta)
   ============================================================ */

// Calcula saldo e quanto falta para a meta; salva no localStorage.
function calcularFinanceiro() {
  const entradaEl = document.getElementById("entrada");
  const saidaEl = document.getElementById("saida");
  const metaEl = document.getElementById("meta");
  const resEl = document.getElementById("resultado-financeiro");

  if (!entradaEl || !saidaEl || !metaEl || !resEl) return; // não é esta página

  const entrada = Number(entradaEl.value || 0);
  const saida = Number(saidaEl.value || 0);
  const meta = Number(metaEl.value || 0);

  const saldo = entrada - saida; // quanto sobrou
  const faltaMeta = meta - saldo; // quanto falta p/ meta
  const faltaMetaAjustada = faltaMeta < 0 ? 0 : faltaMeta; // negativo = já bateu

  // Formatador de moeda brasileira (R$ 1.234,56)
  const fmt = (v) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(v);

  resEl.innerHTML = `
        <p style="font-weight:800;">Saldo Atual: ${fmt(saldo)}</p>
        <p>Falta para Meta: ${fmt(faltaMetaAjustada)}</p>
        <p style="opacity:0.85; font-size:14px; margin-top:8px;">(salvo automaticamente)</p>
    `;

  localStorage.setItem(
    "financas",
    JSON.stringify({
      entrada,
      saida,
      meta,
      saldo,
      faltaMeta: faltaMetaAjustada,
      atualizadoEm: Date.now(),
    }),
  );
}

// Reexibe os valores salvos ao reabrir a página.
function carregarFinanceiro() {
  const dataRaw = localStorage.getItem("financas");
  if (!dataRaw) return; // nunca salvou nada ainda

  const data = JSON.parse(dataRaw);

  const entradaEl = document.getElementById("entrada");
  const saidaEl = document.getElementById("saida");
  const metaEl = document.getElementById("meta");
  const resEl = document.getElementById("resultado-financeiro");

  if (!entradaEl || !saidaEl || !metaEl || !resEl) return;

  // ?? = "se for null/undefined, use 0"
  entradaEl.value = data.entrada ?? 0;
  saidaEl.value = data.saida ?? 0;
  metaEl.value = data.meta ?? 0;

  const fmt = (v) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(v);

  resEl.innerHTML = `
        <p style="font-weight:800;">Saldo Atual: ${fmt(data.saldo ?? 0)}</p>
        <p>Falta para Meta: ${fmt(data.faltaMeta ?? 0)}</p>
        <p style="opacity:0.85; font-size:14px; margin-top:8px;">(carregado do seu dispositivo)</p>
    `;
}

/* ============================================================
   6. LISTA DE TAREFAS (página própria, com campo de data)
   ============================================================ */

// Adiciona uma tarefa à data escolhida no formulário.
function adicionarTarefa() {
  const input = document.getElementById("novaTarefa");
  const dataSel = document.getElementById("dataTarefa");
  const tipoSel = document.getElementById("tipoTarefa");

  if (!input || !dataSel) return;

  const texto = input.value.trim();
  if (texto === "") return; // ignora texto vazio

  const dateStr = dataSel.value; // formato "yyyy-mm-dd"
  if (!dateStr) return; // exigimos uma data

  // Quebra "2026-10-14" em números [ano, mes, dia]
  const [y, m, d] = dateStr.split("-").map(Number);

  const key = keyTarefasDia(d, y, m - 1); // mesIndex é 0-based

  const tarefas = JSON.parse(localStorage.getItem(key) || "[]");
  // Date.now() como id: quase único e crescente
  tarefas.push({
    texto,
    completa: false,
    id: Date.now(),
    tipo: tipoSel ? tipoSel.value : "",
  });
  localStorage.setItem(key, JSON.stringify(tarefas));

  input.value = ""; // limpa o campo para a próxima tarefa
  carregarTarefasLista(); // re-renderiza a lista
}

// Renderiza a lista de tarefas da data selecionada.
function carregarTarefasLista() {
  const lista = document.getElementById("listaTarefas");
  const dataSel = document.getElementById("dataTarefa");
  if (!lista || !dataSel) return;

  const dateStr = dataSel.value;
  lista.innerHTML = "";
  if (!dateStr) return;

  const [y, m, d] = dateStr.split("-").map(Number);
  const key = keyTarefasDia(d, y, m - 1);
  const tarefas = JSON.parse(localStorage.getItem(key) || "[]");

  lista.innerHTML = tarefas
    .map(
      (t) => `
        <li class="tarefa-item ${t.completa ? "completa" : ""}">
            <input type="checkbox" ${t.completa ? "checked" : ""} onchange="toggleTarefaLista(${t.id})">
            <span>${t.texto}</span>
            <button onclick="deletarTarefaLista(${t.id})" type="button">🗑️</button>
        </li>
    `,
    )
    .join("");
}

// Conclui/desfaz uma tarefa da lista (por id).
function toggleTarefaLista(id) {
  const dataSel = document.getElementById("dataTarefa");
  if (!dataSel || !dataSel.value) return;
  const [y, m, d] = dataSel.value.split("-").map(Number);
  const key = keyTarefasDia(d, y, m - 1);

  let tarefas = JSON.parse(localStorage.getItem(key) || "[]");
  const idx = tarefas.findIndex((t) => t.id === id);
  if (idx < 0) return;
  tarefas[idx].completa = !tarefas[idx].completa;
  localStorage.setItem(key, JSON.stringify(tarefas));
  carregarTarefasLista();
}

// Exclui uma tarefa da lista (por id).
function deletarTarefaLista(id) {
  const dataSel = document.getElementById("dataTarefa");
  if (!dataSel || !dataSel.value) return;
  const [y, m, d] = dataSel.value.split("-").map(Number);
  const key = keyTarefasDia(d, y, m - 1);

  let tarefas = JSON.parse(localStorage.getItem(key) || "[]");
  tarefas = tarefas.filter((t) => t.id !== id);
  localStorage.setItem(key, JSON.stringify(tarefas));
  carregarTarefasLista();
}

/* ============================================================
   7. INICIALIZAÇÃO
   Um único JS para todas as páginas: detectamos em qual página
   estamos pelo <title> e rodamos só o que for necessário.
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  if (document.title.includes("Anotações")) {
    // Página de calendário/anotações
    mesOffset = 0;
    diaSelecionado = null;
    gerarCalendarioAnotacoes();
  } else if (document.title.includes("Finanças")) {
    // Página financeira: carrega valores salvos
    carregarFinanceiro();
  } else if (document.title.includes("Lista de Tarefas")) {
    // Página de tarefas: data padrão = hoje
    const dataSel = document.getElementById("dataTarefa");
    if (dataSel && !dataSel.value) {
      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      dataSel.value = `${yyyy}-${mm}-${dd}`;
    }
    carregarTarefasLista();

    // Enter no campo adiciona a tarefa
    const input = document.getElementById("novaTarefa");
    if (input)
      input.addEventListener("keypress", (e) => {
        if (e.key === "Enter") adicionarTarefa();
      });

    // Trocar a data recarrega a lista daquele dia
    if (dataSel) dataSel.addEventListener("change", carregarTarefasLista);
  }
});
