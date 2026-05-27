// RELÓGIO
function atualizarRelogio(){ 
    let agora = new Date(); 
    let h = agora.getHours().toString().padStart(2,'0'); 
    let m = agora.getMinutes().toString().padStart(2,'0'); 
    let s = agora.getSeconds().toString().padStart(2,'0'); 
    document.getElementById("relogio") && (document.getElementById("relogio").innerHTML = `${h}:${m}:${s}`); 
} 
setInterval(atualizarRelogio,1000); atualizarRelogio();


// CALENDÁRIO ANOTAÇÕES
function gerarCalendarioAnotacoes() {
    const cal = document.getElementById('calendario');
    const mesInfo = document.getElementById('mes-atual');
    const hoje = new Date();
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth();
    const primeiroDia = new Date(ano, mes, 1).getDay();
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();
    
    mesInfo.innerHTML = `${hoje.toLocaleDateString('pt-BR',{month:'long', year:'numeric'})}`;
    
    let html = '';
    // Dias vazios
    for(let i = 0; i < primeiroDia; i++) html += '<div class="dia-vazio"></div>';
    
    // Dias
    for(let dia = 1; dia <= diasNoMes; dia++) {
        const dataKey = `anot_dia_${dia}_${mes+1}_${ano}`;
        const saved = localStorage.getItem(dataKey);
        const tipo = saved ? JSON.parse(saved).tipo || '' : '';
        const classeTipo = tipo ? `dia-${tipo}` : '';
        html += `<div class="dia-grid ${classeTipo}" onclick="toggleDia(${dia})" data-dia="${dia}">
            <div class="dia-num">${dia}</div>
        </div>`;
    }
    
    cal.innerHTML = html;
    
    // Load tipos salvos
    for(let dia = 1; dia <= diasNoMes; dia++) {
        const saved = localStorage.getItem(`anot_dia_${dia}_${mes+1}_${ano}`);
        if (saved) {
            const {tipo} = JSON.parse(saved);
            document.querySelector(`[data-dia="${dia}"]`).classList.add(`dia-${tipo}`);
        }
    }
}

function toggleDia(dia) {
    const cell = event.target.closest('.dia-grid');
    const dataKey = `anot_dia_${dia}_${mesAtual()}`;
    const tipos = ['urgente', 'prioridade', 'normal'];
    const atual = localStorage.getItem(dataKey) ? JSON.parse(localStorage.getItem(dataKey)).tipo : '';
    const proxIndex = tipos.indexOf(atual) + 1;
    const novoTipo = tipos[proxIndex % tipos.length];
    
    localStorage.setItem(dataKey, JSON.stringify({tipo: novoTipo}));
    gerarCalendarioAnotacoes(); // refresh
}

// Util
let mesGlobal;
function mesAtual() { 
    const hoje = new Date();
    mesGlobal = `${hoje.getDate()}_${hoje.getMonth()+1}_${hoje.getFullYear()}`;
    return mesGlobal; 
}

// FINANCEIRO & TAREAS unchanged...
function calcularFinanceiro() { /* existing */ }
function adicionarTarefa() { /* existing */ }
// ... all other functions

document.addEventListener('DOMContentLoaded', () => {
    if (document.title.includes('Anotações')) gerarCalendarioAnotacoes();
    // other inits
});

