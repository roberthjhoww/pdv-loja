import { initFirebase, loadAll, setConn, atualizarData } from './firebase.js';
import { state } from './state.js';
import { qs, hoje } from './utils.js';
import { loadAllPages, ensurePage, TITLES } from './nav.js';

// Importa todos os módulos para registrar os window.xxx handlers
import './pdv.js';
import './caixa.js';
import './fechamento.js';
import './estoque.js';
import './fiado.js';
import './financeiro.js';
import './relatorios.js';
import './produtos.js';
import './combos.js';
import './config.js';

// Importa funções de render necessárias no carregarTudo
import { renderPDV, atualizarAlertaEstoque } from './pdv.js';
import { carregarCaixa }                     from './fechamento.js';
import { renderEstoque, atualizarMetricasEstoque, atualizarSelectProd, renderMov } from './estoque.js';
import { renderFiado, renderFiadoHist, atualizarMetricasFiado } from './fiado.js';
import { renderLancamentos, atualizarMetricasFinanceiro, preencherMeses, renderChartCat } from './financeiro.js';
import { renderRelatorios } from './relatorios.js';
import { renderProdutos, renderCodigosChips } from './produtos.js';
import { renderCombos, atualizarSelectCombo } from './combos.js';

// ── Navegação ──────────────────────────────────────────────────────────────────
window.goTo = async function (pg, el) {
  await ensurePage(pg);
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  if (el) el.classList.add('active');
  const pageEl = qs('page-' + pg);
  if (pageEl) pageEl.classList.add('active');
  if (qs('page-title')) qs('page-title').textContent = TITLES[pg] || '';

  if (pg === 'pdv')        renderPDV();
  if (pg === 'fechamento') carregarCaixa();
  if (pg === 'estoque')    { renderEstoque(); renderMov(); atualizarMetricasEstoque(); }
  if (pg === 'fiado')      { renderFiado(); renderFiadoHist(); atualizarMetricasFiado(); }
  if (pg === 'financeiro') { renderLancamentos(); renderChartCat(); atualizarMetricasFinanceiro(); }
  if (pg === 'relatorios') renderRelatorios();
  if (pg === 'produtos')   renderProdutos();
  if (pg === 'combos')     { renderCombos(); atualizarSelectCombo(); }
};

// ── Setup (Firebase manual — mantido para compatibilidade) ────────────────────
window.nextStep = n => {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  qs('step' + n).classList.add('active');
};
window.salvarCredenciais = () => {
  const apiKey     = qs('fb-apikey').value.trim();
  const authDomain = qs('fb-authdomain').value.trim();
  const projectId  = qs('fb-projectid').value.trim();
  const appId      = qs('fb-appid').value.trim();
  if (!apiKey || !projectId) { window.toast('Preencha API Key e Project ID', true); return; }
  localStorage.setItem('fb_cfg', JSON.stringify({ apiKey, authDomain, projectId, appId }));
  window.nextStep(3);
};
window.iniciarApp = () => {
  const raw = localStorage.getItem('fb_cfg');
  if (!raw) { window.toast('Configure o Firebase primeiro', true); return; }
  try {
    initFirebase(JSON.parse(raw));
    qs('setup-screen').style.display = 'none';
    qs('main-app').style.display     = 'flex';
    setConn(true); carregarTudo(); atualizarData(); setInterval(atualizarData, 30000);
  } catch (e) { window.toast('Erro: ' + e.message, true); }
};

// ── Inicialização principal ───────────────────────────────────────────────────
async function carregarTudo() {
  try {
    const data = await loadAll();
    state.PRODS  = data.prods;
    state.VENDAS = data.vendas;
    state.LANCS  = data.lancs;
    state.FIADOS = data.fiados;
    state.MOVS   = data.movs;
    state.COMBOS = data.combos;
    state.CFG    = data.cfg;

    // Configura campos de UI com dados da config
    if (data.cfg.nome) {
      if (qs('cfg-nome'))       qs('cfg-nome').value      = data.cfg.nome;
      if (qs('loja-nome-side')) qs('loja-nome-side').textContent = data.cfg.nome;
    }
    if (data.cfg.endereco && qs('cfg-end')) qs('cfg-end').value = data.cfg.endereco;
    if (data.cfg.telefone && qs('cfg-tel')) qs('cfg-tel').value = data.cfg.telefone;

    state.FAVS = new Set(JSON.parse(localStorage.getItem('favs') || '[]'));

    if (qs('l-data')) qs('l-data').value = hoje();

    window.toggleCats();
    preencherMeses();

    renderPDV(); atualizarAlertaEstoque();
    renderEstoque(); atualizarMetricasEstoque(); renderMov();
    carregarCaixa();
    renderCombos(); atualizarSelectCombo();
    state._codigos_temp = []; renderCodigosChips();
    renderLancamentos(); atualizarMetricasFinanceiro();
    renderRelatorios();
    renderProdutos();
    renderFiado(); renderFiadoHist();
    atualizarSelectProd();
  } catch (e) {
    console.error('Erro ao carregar dados:', e);
    setConn(false);
  }
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
(async () => {
  // Carrega todos os fragmentos de página em paralelo
  await loadAllPages();

  // Ativa a página inicial (PDV)
  const pdvPage = qs('page-pdv');
  if (pdvPage) pdvPage.classList.add('active');
  document.querySelectorAll('.nav-item').forEach((n, i) => {
    if (i === 0) n.classList.add('active');
  });

  // Firebase hardcoded
  const FB_CONFIG = {
    apiKey:      'AIzaSyCZLq-fxhRu-g4eJHvpv0i3otTn8zqR8RQ',
    authDomain:  'point-da-bebida.firebaseapp.com',
    projectId:   'point-da-bebida',
    appId:       '1:594734488483:web:29019e080828098d119816'
  };

  try {
    initFirebase(FB_CONFIG);
    if (qs('setup-screen')) qs('setup-screen').style.display = 'none';
    if (qs('main-app'))     qs('main-app').style.display     = 'flex';
    setConn(true);
    atualizarData();
    setInterval(atualizarData, 30000);
    await carregarTudo();
  } catch (e) {
    console.error(e);
    setConn(false);
  }
})();
