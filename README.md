# 📅 Projeto Dia a Dia

Planner de produtividade + ônibus em tempo real. Feito em HTML/CSS/JS puro (sem frameworks), todo comentado para estudo.

## 🗂️ Árvore do projeto (arquitetura limpa)

```
Projeto Dia a Dia/
├── paginas/                  ← TODAS as telas (HTML)
│   ├── index.html            ← menu principal
│   ├── lista_tarefas.html    ← lista de afazeres por data
│   ├── financas.html         ← controle financeiro (entrada/saída/meta)
│   ├── anotacoes.html        ← calendário de anotações/tipos de dia
│   ├── relogio.html          ← relógio & horários
│   ├── login.html            ← login + recuperação por SMS (demo)
│   ├── cadastro.html         ← criar conta (demo)
│   └── onibus.html           ← 🚌 ônibus em tempo real (CEP + hora + GPS)
│
├── recursos/                 ← arquivos compartilhados por todas as páginas
│   ├── css/
│   │   └── style.css         ← único CSS do site (glassmorphism + responsivo)
│   └── js/
│       ├── script.js         ← lógica do planner (relógio, tarefas, finanças, login)
│       └── onibus.js         ← lógica da página de ônibus (busca, GPS, tempo real)
│
├── dados/
│   └── onibus.json           ← linhas/paradas de ônibus DEMO (troque por API real)
│
├── calendario_plano.md       ← notas de planejamento
├── README.md                 ← este arquivo
└── LICENSE
```

**Regra da arquitetura:** páginas só falam com `recursos/`; `recursos/` nunca aponta para `paginas/`. Isso evita caminhos quebrados e facilita crescer (novas páginas só entram em `paginas/`).

## 🚌 Página de Ônibus em Tempo Real

Como funciona (tudo em `recursos/js/onibus.js`, comentado):

1. **Barra de REGIÃO (CEP)** — consulta a [API ViaCEP](https://viacep.com.br) (grátis, sem chave) para identificar bairro/cidade e localizar a região.
2. **Barra de HORA** — filtra apenas as linhas com partida a partir do horário escolhido.
3. **Localização do aparelho** — botão "Usar minha localização" usa a API `navigator.geolocation` (funciona em celular, tablet, notebook e PC; o navegador pede permissão).
4. **Resultado** — ônibus ordenados do mais próximo ao mais longe (fórmula de Haversine), com contagem regressiva da próxima partida.
5. **Tempo real** — botão "Ativar atualização" refaz a busca a cada 15 s com `setInterval`.

> ⚠️ A geolocalização só funciona em HTTPS ou `localhost`. Use a extensão Live Server do VS Code (ou `python -m http.server`) para abrir o projeto.

> ℹ️ As posições das linhas são dados demo (`dados/onibus.json`). Para dados reais, substitua por uma API de mobilidade (GTFS / SPTrans / Open Data).

## ▶️ Como rodar

Não abra o HTML direto do arquivo (file://) — o `fetch` do JSON e a geolocalização falham. Use um servidor local:

```powershell
# opção 1 (Python)
python -m http.server 8000
# depois: http://localhost:8000/paginas/index.html

# opção 2: extensão "Live Server" no VS Code
```

## 📚 O que dá para estudar neste projeto

- **DOM e eventos** — `getElementById`, `innerHTML`, `addEventListener`, delegação de eventos.
- **localStorage** — persistência local (tarefas, finanças, login demo).
- **Datas** — `Date`, `toLocaleDateString`, cálculo de calendário (dia 1, dias no mês).
- **APIs** — `fetch` para ViaCEP e JSON local; `navigator.geolocation` (GPS).
- **Matemática** — fórmula de Haversine (distância entre coordenadas).
- **Timers** — `setInterval`/`clearInterval` (relógio e tempo real dos ônibus).
- **Responsividade** — CSS Grid, `clamp()`, media queries.

## 🔐 Aviso de segurança

O login/cadastro/SMS deste projeto é **didático** (dados no `localStorage`, senha em texto puro). Em produção, use um backend de verdade com hash de senha (ex: bcrypt) e um provedor de SMS.
