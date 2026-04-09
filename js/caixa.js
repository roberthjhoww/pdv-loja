import { state } from './state.js';
import { fmt, qs, toast, hoje } from './utils.js';
import { comboSemEstoque } from './pdv.js';

// ── Abrir / Fechar painel ─────────────────────────────────────────────────────
window.abrirPainelCaixa = function () {
  qs('painel-caixa').classList.add('open');
  qs('caixa-loja-nome').textContent = state.CFG.nome || 'Minha Loja';
  renderCaixaGrid();
  renderCaixaCarrinho();
  calcCaixaTotal();
  qs('caixa-busca').focus();
  state.caixaHoraInterval = setInterval(() => {
    qs('caixa-hora').textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }, 1000);
  qs('caixa-hora').textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

window.fecharPainelCaixa = function () {
  qs('painel-caixa').classList.remove('open');
  clearInterval(state.caixaHoraInterval);
};

// ── Grid de produtos ──────────────────────────────────────────────────────────
window.renderCaixaGrid = function () {
  const busca = (qs('caixa-busca') || { value: '' }).value.toLowerCase();
  const lista   = state.PRODS.filter(p => !busca || (
    p.nome.toLowerCase().includes(busca) ||
    (p.codigos || []).some(c => c.toLowerCase().includes(busca)) ||
    (p.codigo || '').includes(busca)
  ));
  const combosF = state.COMBOS.filter(c => !busca || c.nome.toLowerCase().includes(busca));
  const el = qs('caixa-grid');
  if (!el) return;
  const htmlP = lista.map(p => {
    const out = p.estoque <= 0;
    return '<div class="caixa-tile' + (out ? ' out' : '') + '" data-id="' + p.id + '" data-tipo="prod">' +
      '<div class="ct-name">' + p.nome + '</div>' +
      '<div class="ct-price">' + fmt(p.venda) + '</div>' +
      '<div class="ct-stock' + (out ? ' out' : '') + '">' + (out ? 'SEM ESTOQUE' : p.estoque + ' ' + (p.unidade || 'un')) + '</div></div>';
  }).join('');
  const htmlC = combosF.map(c =>
    '<div class="caixa-tile" data-id="' + c.id + '" data-tipo="combo">' +
    '<div class="ct-name">' + c.nome + '</div>' +
    '<div class="ct-price">' + fmt(c.venda) + '</div>' +
    '<div class="ct-stock" style="color:var(--amber)">combo</div></div>'
  ).join('');
  el.innerHTML = (htmlP + htmlC) || '<div class="empty">Nenhum produto</div>';
  el.querySelectorAll('.caixa-tile:not(.out)').forEach(t => {
    t.addEventListener('click', () => {
      if (t.dataset.tipo === 'combo') addCaixaCombo(t.dataset.id);
      else window.addCaixaCarrinho(t.dataset.id);
    });
  });
};

window.caixaBarcode = function (e) {
  if (e.key === 'Enter') {
    const q = qs('caixa-busca').value.trim();
    const p = state.PRODS.find(x => x.codigo === q || (x.codigos || []).includes(q));
    if (p) { window.addCaixaCarrinho(p.id); qs('caixa-busca').value = ''; window.renderCaixaGrid(); }
  }
};

// ── Carrinho caixa ────────────────────────────────────────────────────────────
window.addCaixaCarrinho = function (id) {
  const p = state.PRODS.find(x => x.id === id);
  if (!p) return;
  if (p.estoque <= 0) { toast('Sem estoque!', true); return; }
  const ex = state.caixaCarrinho.find(x => x.id === id);
  if (ex) {
    if (ex.qty >= p.estoque) { toast('Estoque máximo', true); return; }
    ex.qty++;
  } else {
    state.caixaCarrinho.push({ id: p.id, nome: p.nome, preco: p.venda, custo: p.custo || 0, qty: 1 });
  }
  renderCaixaCarrinho(); calcCaixaTotal();
};

function addCaixaCombo(comboId) {
  const c = state.COMBOS.find(x => x.id === comboId);
  if (!c) return;
  const ex = state.caixaCarrinho.find(x => x.id === 'combo_' + comboId);
  if (ex) ex.qty++;
  else {
    const ct = (c.itens || []).reduce((a, ci) => {
      const p = state.PRODS.find(x => x.id === ci.prodId);
      return a + (p ? (p.custoMedio || p.custo || 0) * ci.qtd : 0);
    }, 0);
    state.caixaCarrinho.push({ id: 'combo_' + comboId, nome: c.nome, preco: c.venda, custo: ct, qty: 1, isCombo: true, comboId, comboItens: c.itens });
  }
  renderCaixaCarrinho(); calcCaixaTotal();
}

function renderCaixaCarrinho() {
  const el = qs('caixa-cart-items');
  if (!el) return;
  if (!state.caixaCarrinho.length) { el.innerHTML = '<div class="empty">Adicione produtos</div>'; return; }
  el.innerHTML = state.caixaCarrinho.map((item, i) => `
    <div class="caixa-cart-item">
      <span class="cci-name">${item.nome}</span>
      <button class="cci-qbtn" onclick="chgCaixaQty(${i},-1)">−</button>
      <span class="cci-qty">${item.qty}</span>
      <button class="cci-qbtn" onclick="chgCaixaQty(${i},1)">+</button>
      <span class="cci-total">${fmt(item.preco * item.qty)}</span>
      <button class="cci-rm" onclick="rmCaixaItem(${i})">×</button>
    </div>`).join('');
}

window.chgCaixaQty = function (i, d) {
  state.caixaCarrinho[i].qty += d;
  if (state.caixaCarrinho[i].qty <= 0) state.caixaCarrinho.splice(i, 1);
  renderCaixaCarrinho(); calcCaixaTotal();
};
window.rmCaixaItem      = i => { state.caixaCarrinho.splice(i, 1); renderCaixaCarrinho(); calcCaixaTotal(); };
window.limparCaixaCarrinho = () => { state.caixaCarrinho = []; renderCaixaCarrinho(); calcCaixaTotal(); };

function getCaixaTotal() {
  return state.caixaCarrinho.reduce((a, i) => a + i.preco * i.qty, 0);
}

function calcCaixaTotal() {
  const t = getCaixaTotal();
  if (qs('caixa-sub'))   qs('caixa-sub').textContent   = fmt(t);
  if (qs('caixa-total')) qs('caixa-total').textContent = fmt(t);
  window.calcCaixaTroco();
}

window.calcCaixaTroco = function () {
  const rec = parseFloat((qs('caixa-recebido') || { value: '0' }).value) || 0;
  if (qs('caixa-troco')) qs('caixa-troco').textContent = fmt(Math.max(0, rec - getCaixaTotal()));
};

window.setCaixaRecebido = v => { qs('caixa-recebido').value = v; window.calcCaixaTroco(); };

window.selCaixaPag = function (p) {
  state.caixaFormaPag = p;
  ['dinheiro', 'credito', 'debito', 'pix'].forEach(x =>
    qs('cpt-' + x).classList.toggle('sel', x === p)
  );
  qs('caixa-troco-wrap').style.display = p === 'dinheiro' ? 'block' : 'none';
};

// ── Finalizar venda caixa ─────────────────────────────────────────────────────
window.finalizarCaixaVenda = async function () {
  if (!state.caixaCarrinho.length) { toast('Carrinho vazio!', true); return; }
  // Reutiliza a lógica do PDV principal
  state.carrinho  = [...state.caixaCarrinho];
  state.formaPag  = state.caixaFormaPag;
  if (qs('c-desc')) qs('c-desc').value = '';
  await window.finalizarVenda();
  state.caixaCarrinho = []; renderCaixaCarrinho(); calcCaixaTotal();
  if (qs('caixa-recebido')) qs('caixa-recebido').value = '';
  if (qs('caixa-troco'))    qs('caixa-troco').textContent = 'R$ 0,00';
  window.renderCaixaGrid();
};

window.abrirFiadoCaixa = function () {
  state.carrinho = [...state.caixaCarrinho];
  window.abrirFiado();
};
