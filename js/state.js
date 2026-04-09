// Estado compartilhado entre todos os módulos
export const state = {
  db: null,

  // Dados do Firebase
  PRODS: [],
  VENDAS: [],
  LANCS: [],
  FIADOS: [],
  MOVS: [],
  COMBOS: [],
  CFG: {},
  FAVS: new Set(),

  // PDV
  carrinho: [],
  formaPag: 'dinheiro',
  favMode: false,
  _ultimaVenda: null,

  // Fiado
  fiadoClienteAtual: null,

  // Painel Caixa
  caixaCarrinho: [],
  caixaFormaPag: 'dinheiro',
  caixaHoraInterval: null,

  // Fechamento
  CAIXA_ABERTO: null,
  SANGRIAS: [],

  // Produtos
  editId: null,
  _codigos_temp: [],

  // Combos
  editComboId: null,
  combosItensTemp: [],
};
