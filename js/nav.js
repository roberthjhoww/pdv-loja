import { qs } from './utils.js';

export const TITLES = {
  pdv:        'PDV — Ponto de Venda',
  fechamento: 'Fechamento Diário',
  estoque:    'Estoque',
  fiado:      'Controle de Fiado',
  financeiro: 'Financeiro',
  relatorios: 'Relatórios',
  produtos:   'Cadastro de Produtos',
  combos:     'Combos',
  config:     'Configurações',
};

const loadedPages = new Set();

export async function ensurePage(pg) {
  if (loadedPages.has(pg)) return;
  const resp = await fetch(`pages/${pg}.html`);
  const html = await resp.text();
  qs('main-content').insertAdjacentHTML('beforeend', html);
  loadedPages.add(pg);
}

export async function loadAllPages() {
  const pages = ['pdv', 'fechamento', 'estoque', 'fiado', 'financeiro', 'relatorios', 'produtos', 'combos', 'config'];
  await Promise.all(pages.map(pg => ensurePage(pg)));
}
