
function atualizarRelogio(){ 
    const agora = new Date(); 
    const h = agora.getHours().toString().padStart(2,'0'); 
    const m = agora.getMinutes().toString().padStart(2,'0'); 
    const s = agora.getSeconds().toString().padStart(2,'0'); 
    const rel = document.getElementById('relogio');
    if (rel) rel.innerHTML = `${h}:${m}:${s}`; 
} 
setInterval(atualizarRelogio,1000);
atualizarRelogio();

// ========================= CALENDÁRIO ANOTAÇÕES (com troca de mês) =========================
let mesOffset = 0; // 0 = mês atual
let mesAtualState = null; // {ano, mesIndex}
let diaSelecionado = null; // número do dia

function keyDia(dia, ano, mesIndex){
    // mesIndex: 0-11
    return `anot_dia_${dia}_${mesIndex+1}_${ano}`;
}

function keyTarefasDia(dia, ano, mesIndex){
    return `tarefas_dia_${dia}_${mesIndex+1}_${ano}`;
}

function getMonthStateFromOffset(){
    const base = new Date();
    const dt = new Date(base.getFullYear(), base.getMonth() + mesOffset, 1);
    return { ano: dt.getFullYear(), mes: dt.getMonth() };
}

function mudarMes(delta){
    mesOffset += delta;
    diaSelecionado = null;
    gerarCalendarioAnotacoes();
    renderTarefasDoDia(null);
}

function gerarCalendarioAnotacoes() {
    const cal = document.getElementById('calendario');
    const mesInfo = document.getElementById('mes-atual');
    if (!cal || !mesInfo) return;

    mesAtualState = getMonthStateFromOffset();
    const {ano, mes} = mesAtualState;

    const primeiroDia = new Date(ano, mes, 1).getDay();
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();

    const dtMes = new Date(ano, mes, 1);
    mesInfo.innerHTML = dtMes.toLocaleDateString('pt-BR',{month:'long', year:'numeric'});

    let html = '';
    for(let i = 0; i < primeiroDia; i++) html += '<div class="dia-vazio"></div>';

    for(let dia = 1; dia <= diasNoMes; dia++){
        const saved = localStorage.getItem(keyDia(dia, ano, mes));
        const tipo = saved ? JSON.parse(saved).tipo || '' : '';
        const classeTipo = tipo ? `dia-${tipo}` : '';

        const isSelected = diaSelecionado === dia;
        const selectedClass = isSelected ? 'dia-selecionado' : '';

        html += `
            <div class="dia-grid ${classeTipo} ${selectedClass}" 
                 data-dia="${dia}" 
                 onclick="selecionarDia(${dia})" 
                 aria-label="Dia ${dia}">
                <div class="dia-num">${dia}</div>
            </div>
        `;
    }

    cal.innerHTML = html;
}

function selecionarDia(dia){
    if (!mesAtualState) return;
    diaSelecionado = dia;

    // Atualiza visual
    gerarCalendarioAnotacoes();

    // Renderiza tarefas do dia
    renderTarefasDoDia(dia);
}

function ciclarTipoDiaAtual(){
    if (!mesAtualState || !diaSelecionado) return;
    const {ano, mes} = mesAtualState;

    const dataKey = keyDia(diaSelecionado, ano, mes);
    const tipos = ['urgente','prioridade','normal'];

    const atualObj = localStorage.getItem(dataKey);
    const atualTipo = atualObj ? JSON.parse(atualObj).tipo || '' : '';

    const proxIndex = tipos.indexOf(atualTipo) + 1;
    const novoTipo = tipos[proxIndex % tipos.length];

    localStorage.setItem(dataKey, JSON.stringify({tipo: novoTipo}));
    gerarCalendarioAnotacoes();
}

function renderTarefasDoDia(dia){
    const lista = document.getElementById('listaDia');
    const label = document.getElementById('dia-selecionado');

    if (!lista || !label || !mesAtualState || !dia) {
        if (label) label.textContent = 'Clique em um dia do calendário';
        if (lista) lista.innerHTML = '';
        return;
    }

    const {ano, mes} = mesAtualState;
    label.textContent = `Dia ${dia} / ${mes+1} / ${ano}`;

    const key = keyTarefasDia(dia, ano, mes);
    const tarefas = JSON.parse(localStorage.getItem(key) || '[]');

    if (tarefas.length === 0){
        lista.innerHTML = `<li style="opacity:0.75">Nenhuma tarefa para este dia.</li>`;
        return;
    }

    lista.innerHTML = tarefas.map(t => `
        <li class="tarefa-item ${t.completa ? 'completa' : ''}">
            <input type="checkbox" ${t.completa ? 'checked' : ''} onchange="toggleTarefaDia(${t.id})" data-tarefa-id="${t.id}">
            <span>${t.texto}</span>
            <button onclick="deletarTarefaDia(${t.id})" type="button">🗑️</button>
        </li>
    `).join('');
}

function toggleTarefaDia(id){
    if (!mesAtualState || !diaSelecionado) return;
    const {ano, mes} = mesAtualState;
    const key = keyTarefasDia(diaSelecionado, ano, mes);

    let tarefas = JSON.parse(localStorage.getItem(key) || '[]');
    const idx = tarefas.findIndex(t => t.id === id);
    if (idx < 0) return;
    tarefas[idx].completa = !tarefas[idx].completa;
    localStorage.setItem(key, JSON.stringify(tarefas));
    renderTarefasDoDia(diaSelecionado);
}

function deletarTarefaDia(id){
    if (!mesAtualState || !diaSelecionado) return;
    const {ano, mes} = mesAtualState;
    const key = keyTarefasDia(diaSelecionado, ano, mes);

    let tarefas = JSON.parse(localStorage.getItem(key) || '[]');
    tarefas = tarefas.filter(t => t.id !== id);
    localStorage.setItem(key, JSON.stringify(tarefas));
    renderTarefasDoDia(diaSelecionado);
}

// ========================= FINANCEIRO =========================

function calcularFinanceiro(){
    const entradaEl = document.getElementById('entrada');
    const saidaEl = document.getElementById('saida');
    const metaEl = document.getElementById('meta');
    const resEl = document.getElementById('resultado-financeiro');

    if(!entradaEl || !saidaEl || !metaEl || !resEl) return;

    const entrada = Number(entradaEl.value || 0);
    const saida = Number(saidaEl.value || 0);
    const meta = Number(metaEl.value || 0);

    const saldo = entrada - saida;
    const faltaMeta = meta - saldo;
    const faltaMetaAjustada = faltaMeta < 0 ? 0 : faltaMeta;

    // formato BRL
    const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

    resEl.innerHTML = `
        <p style="font-weight:800;">Saldo Atual: ${fmt(saldo)}</p>
        <p>Falta para Meta: ${fmt(faltaMetaAjustada)}</p>
        <p style="opacity:0.85; font-size:14px; margin-top:8px;">(salvo automaticamente)</p>
    `;

    localStorage.setItem('financas', JSON.stringify({ entrada, saida, meta, saldo, faltaMeta: faltaMetaAjustada, atualizadoEm: Date.now() }));
}

function carregarFinanceiro(){
    const dataRaw = localStorage.getItem('financas');
    if(!dataRaw) return;

    const data = JSON.parse(dataRaw);

    const entradaEl = document.getElementById('entrada');
    const saidaEl = document.getElementById('saida');
    const metaEl = document.getElementById('meta');
    const resEl = document.getElementById('resultado-financeiro');

    if(!entradaEl || !saidaEl || !metaEl || !resEl) return;

    entradaEl.value = data.entrada ?? 0;
    saidaEl.value = data.saida ?? 0;
    metaEl.value = data.meta ?? 0;

    const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

    resEl.innerHTML = `
        <p style="font-weight:800;">Saldo Atual: ${fmt(data.saldo ?? 0)}</p>
        <p>Falta para Meta: ${fmt(data.faltaMeta ?? 0)}</p>
        <p style="opacity:0.85; font-size:14px; margin-top:8px;">(carregado do seu dispositivo)</p>
    `;
}


// ========================= TAREFAS (lista) - salva no dia escolhido =========================
function adicionarTarefa() {
    const input = document.getElementById('novaTarefa');
    const dataSel = document.getElementById('dataTarefa');
    const tipoSel = document.getElementById('tipoTarefa');

    if(!input || !dataSel) return;

    const texto = input.value.trim();
    if(texto === '') return;

    const dateStr = dataSel.value; // yyyy-mm-dd
    if(!dateStr) return;

    const [y,m,d] = dateStr.split('-').map(Number);
    const dia = d;
    const mesIndex = m - 1;
    const ano = y;

    const key = keyTarefasDia(dia, ano, mesIndex);

    const tarefas = JSON.parse(localStorage.getItem(key) || '[]');
    tarefas.push({ texto, completa:false, id: Date.now(), tipo: tipoSel ? tipoSel.value : ''});
    localStorage.setItem(key, JSON.stringify(tarefas));

    input.value = '';
    carregarTarefasLista();
}

function carregarTarefasLista(){
    const lista = document.getElementById('listaTarefas');
    const dataSel = document.getElementById('dataTarefa');
    if(!lista || !dataSel) return;

    const dateStr = dataSel.value;
    lista.innerHTML = '';
    if(!dateStr) return;

    const [y,m,d] = dateStr.split('-').map(Number);
    const key = keyTarefasDia(d, y, m-1);
    const tarefas = JSON.parse(localStorage.getItem(key) || '[]');

    lista.innerHTML = tarefas.map(t => `
        <li class="tarefa-item ${t.completa ? 'completa' : ''}">
            <input type="checkbox" ${t.completa ? 'checked' : ''} onchange="toggleTarefaLista(${t.id})">
            <span>${t.texto}</span>
            <button onclick="deletarTarefaLista(${t.id})" type="button">🗑️</button>
        </li>
    `).join('');
}

function toggleTarefaLista(id){
    const dataSel = document.getElementById('dataTarefa');
    if(!dataSel || !dataSel.value) return;
    const [y,m,d] = dataSel.value.split('-').map(Number);
    const key = keyTarefasDia(d, y, m-1);

    let tarefas = JSON.parse(localStorage.getItem(key) || '[]');
    const idx = tarefas.findIndex(t => t.id === id);
    if(idx < 0) return;
    tarefas[idx].completa = !tarefas[idx].completa;
    localStorage.setItem(key, JSON.stringify(tarefas));
    carregarTarefasLista();
}

function deletarTarefaLista(id){
    const dataSel = document.getElementById('dataTarefa');
    if(!dataSel || !dataSel.value) return;
    const [y,m,d] = dataSel.value.split('-').map(Number);
    const key = keyTarefasDia(d, y, m-1);

    let tarefas = JSON.parse(localStorage.getItem(key) || '[]');
    tarefas = tarefas.filter(t => t.id !== id);
    localStorage.setItem(key, JSON.stringify(tarefas));
    carregarTarefasLista();
}

// ========================= INIT =========================

document.addEventListener('DOMContentLoaded', () => {
    if (document.title.includes('Anotações')) {
        mesOffset = 0;
        diaSelecionado = null;
        gerarCalendarioAnotacoes();
    } else if (document.title.includes('Finanças')) {
        carregarFinanceiro();
    } else if (document.title.includes('Lista de Tarefas')) {

        const dataSel = document.getElementById('dataTarefa');
        if (dataSel && !dataSel.value) {
            const now = new Date();
            const yyyy = now.getFullYear();
            const mm = String(now.getMonth()+1).padStart(2,'0');
            const dd = String(now.getDate()).padStart(2,'0');
            dataSel.value = `${yyyy}-${mm}-${dd}`;
        }
        carregarTarefasLista();

        const input = document.getElementById('novaTarefa');
        if (input) input.addEventListener('keypress', (e)=>{
            if(e.key === 'Enter') adicionarTarefa();
        });

        if (dataSel) dataSel.addEventListener('change', carregarTarefasLista);
    }
});

