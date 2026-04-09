# PDV Loja

Sistema de ponto de venda com Firebase Firestore como banco de dados.

## Como rodar

O projeto precisa ser servido via HTTP (não funciona abrindo o arquivo diretamente pelo navegador, pois usa ES Modules e `fetch`).

```bash
# Opção 1 — npx serve
npx serve .

# Opção 2 — Live Server (extensão VS Code)
# Clique com botão direito em index.html → "Open with Live Server"
```

## Estrutura do projeto

```
pdv-loja/
├── index.html          # Shell principal: CSS, sidebar, topbar, modais
├── pages/              # Fragmentos HTML — um por seção
│   ├── pdv.html
│   ├── fechamento.html
│   ├── estoque.html
│   ├── fiado.html
│   ├── financeiro.html
│   ├── relatorios.html
│   ├── produtos.html
│   ├── combos.html
│   └── config.html
└── js/                 # Módulos JavaScript
    ├── state.js        # Estado compartilhado (db, PRODS, carrinho…)
    ├── utils.js        # Utilitários reutilizáveis (fmt, hoje, toast…)
    ├── firebase.js     # Inicialização do Firebase e carregamento de dados
    ├── nav.js          # Navegação e carregamento dinâmico de páginas
    ├── pdv.js          # PDV, carrinho, cupom, favoritos
    ├── caixa.js        # Painel caixa (reutiliza lógica do PDV)
    ├── fechamento.js   # Abertura/fechamento de caixa, sangrias
    ├── estoque.js      # Estoque, movimentações, histórico de custo
    ├── fiado.js        # Controle de fiado
    ├── financeiro.js   # Lançamentos financeiros, gráfico por categoria
    ├── relatorios.js   # Relatórios e gráficos de vendas
    ├── produtos.js     # CRUD de produtos, múltiplos códigos de barras
    ├── combos.js       # CRUD de combos
    ├── config.js       # Configurações da loja e backup
    └── main.js         # Ponto de entrada — orquestra inicialização
```

## Seções do sistema

| Seção | Descrição |
|---|---|
| **PDV** | Ponto de venda com grid de produtos, carrinho e pagamento |
| **Painel caixa** | Visão em tela cheia para o operador de caixa |
| **Fechamento** | Abertura/fechamento diário, sangrias e conferência de caixa |
| **Estoque** | Entrada de produtos, posição atual e histórico de movimentações |
| **Fiado** | Controle de crédito por cliente |
| **Financeiro** | Lançamentos de receitas e despesas, gráficos mensais |
| **Relatórios** | Faturamento, lucro, ticket médio e produtos mais vendidos |
| **Produtos** | Cadastro de produtos com suporte a múltiplos códigos de barras |
| **Combos** | Criação de combos compostos por produtos/insumos |
| **Configurações** | Dados da loja, backup JSON e configuração do Firebase |

## Como funciona a navegação

O `index.html` é o shell da aplicação (sidebar, topbar, CSS e modais). O conteúdo de cada seção fica em `pages/*.html` como fragmentos HTML.

Ao iniciar, o `main.js` carrega todos os fragmentos em paralelo via `fetch` e os injeta em `#main-content`. A navegação mostra/esconde as `div.page` correspondentes sem recarregar a página.

## Firebase

As credenciais do projeto estão em `js/main.js`. Para usar com outro projeto Firebase, substitua o objeto `FB_CONFIG` com as credenciais do seu projeto.
