import { state } from './state.js';
import { fmt, qs, toast, hoje } from './utils.js';
import { collection, addDoc, doc, updateDoc } from './firebase.js';

// ── Alertas de estoque ────────────────────────────────────────────────────────
export function atualizarAlertaEstoque() {
  const low  = state.PRODS.filter(p => p.estoque > 0 && p.estoque <= (p.estoqueMin || 5));
  const zero = state.PRODS.filter(p => p.estoque <= 0);
  const el = qs('pdv-alerta-estoque');
  if (!el) return;
  const msgs = [];
  if (zero.length) msgs.push(`${zero.length} produto(s) SEM ESTOQUE`);
  if (low.length)  msgs.push(`${low.length} produto(s) com estoque baixo`);
  el.innerHTML = msgs.length
    ? `<div class="alert-strip">⚠ ${msgs.join(' · ')} — <span style="cursor:pointer;text-decoration:underline" onclick="goTo('estoque',document.querySelector('.nav-item:nth-child(3)'))">Ver estoque</span></div>`
    : '';
}

// ── Favoritos ─────────────────────────────────────────────────────────────────
function saveFavs() {
  localStorage.setItem('favs', JSON.stringify([...state.FAVS]));
}

window.toggleFav = function (id, e) {
  e.stopPropagation();
  if (state.FAVS.has(id)) state.FAVS.delete(id); else state.FAVS.add(id);
  saveFavs(); renderPDV();
};

window.toggleFavMode = function () {
  state.favMode = !state.favMode;
  qs('fav-toggle-btn').classList.toggle('active', state.favMode);
  renderPDV();
};

// ── Grid de produtos ──────────────────────────────────────────────────────────
export function renderPDV() {
  const busca = (qs('pdv-search') || { value: '' }).value.toLowerCase();
  let lista = state.PRODS.filter(p =>
    !busca || p.nome.toLowerCase().includes(busca) ||
    (p.codigo || '').includes(busca) ||
    (p.codigos || []).some(c => c.includes(busca))
  );
  if (state.favMode) lista = lista.filter(p => state.FAVS.has(p.id));

  let listaC = state.COMBOS.filter(c =>
    !busca || c.nome.toLowerCase().includes(busca) || (c.codigo || '').includes(busca)
  );
  if (state.favMode) listaC = listaC.filter(c => state.FAVS.has('combo_' + c.id));

  const el = qs('pdv-grid');
  if (!el) return;
  if (!lista.length && !listaC.length) {
    el.innerHTML = '<div class="empty">Nenhum produto encontrado</div>';
    return;
  }
  el.innerHTML = '';

  lista.forEach(p => {
    const out = p.estoque <= 0, low = !out && p.estoque <= (p.estoqueMin || 5);
    const isFav = state.FAVS.has(p.id);
    const div = document.createElement('div');
    div.className = 'prod-tile' + (out ? ' out' : '') + (low && !out ? ' low-stock' : '');
    div.dataset.id = p.id; div.dataset.tipo = 'prod';
    const stockTxt = out ? 'SEM ESTOQUE' : low ? ('⚠ ' + p.estoque + ' ' + (p.unidade || 'un')) : p.estoque + ' ' + (p.unidade || 'un');
    div.innerHTML =
      '<button class="fav-star' + (isFav ? ' active' : '') + '" data-favid="' + p.id + '" title="Favoritar">★</button>' +
      '<div class="pt-code">' + (p.codigo || '—') + '</div>' +
      '<div class="pt-name">' + p.nome + '</div>' +
      '<div class="pt-price">' + fmt(p.venda) + '</div>' +
      '<div class="pt-stock' + (out ? ' out' : low ? ' low' : '') + '">' + stockTxt + '</div>';
    if (!out) {
      div.addEventListener('click', function (e) {
        if (e.target.closest('.fav-star')) { toggleFav(p.id, e); return; }
        addCarrinho(p.id);
      });
    }
    div.querySelector('.fav-star').addEventListener('click', function (e) {
      e.stopPropagation(); toggleFav(p.id, e);
    });
    el.appendChild(div);
  });

  listaC.forEach(c => {
    const isFav = state.FAVS.has('combo_' + c.id);
    const semEstoque = comboSemEstoque(c);
    const div = document.createElement('div');
    div.className = 'prod-tile' + (semEstoque ? ' out' : '');
    div.dataset.id = c.id; div.dataset.tipo = 'combo';
    div.innerHTML =
      '<button class="fav-star' + (isFav ? ' active' : '') + '" title="Favoritar">★</button>' +
      '<div class="pt-code" style="color:var(--amber)">' + (c.codigo || 'COMBO') + '</div>' +
      '<div class="pt-name">' + c.nome + '</div>' +
      '<div class="pt-price">' + fmt(c.venda) + '</div>' +
      '<div class="pt-stock">' + (semEstoque ? 'SEM ESTOQUE' : 'combo') + '</div>';
    if (!semEstoque) {
      div.addEventListener('click', function (e) {
        if (e.target.closest('.fav-star')) { toggleFav('combo_' + c.id, e); return; }
        addComboCarrinho(c.id);
      });
    }
    div.querySelector('.fav-star').addEventListener('click', function (e) {
      e.stopPropagation(); toggleFav('combo_' + c.id, e);
    });
    el.appendChild(div);
  });
}

window.filtrarPDV = () => renderPDV();

window.barcodePDV = function (e) {
  if (e.key === 'Enter') {
    const q = qs('pdv-search').value.trim();
    const p = state.PRODS.find(x => x.codigo === q || (x.codigos || []).includes(q));
    if (p) { addCarrinho(p.id); qs('pdv-search').value = ''; renderPDV(); }
  }
};

// ── Combo helpers ─────────────────────────────────────────────────────────────
export function comboSemEstoque(c) {
  return (c.itens || []).some(ci => {
    const p = state.PRODS.find(x => x.id === ci.prodId);
    return !p || p.estoque < ci.qtd;
  });
}

function addComboCarrinho(comboId) {
  const c = state.COMBOS.find(x => x.id === comboId);
  if (!c) return;
  if (comboSemEstoque(c)) { toast('Estoque insuficiente para este combo', true); return; }
  const ex = state.carrinho.find(x => x.id === 'combo_' + comboId);
  if (ex) { ex.qty++; }
  else {
    const custoTotal = (c.itens || []).reduce((a, ci) => {
      const p = state.PRODS.find(x => x.id === ci.prodId);
      return a + (p ? (p.custoMedio || p.custo || 0) * ci.qtd : 0);
    }, 0);
    state.carrinho.push({ id: 'combo_' + comboId, nome: c.nome, preco: c.venda, custo: custoTotal, qty: 1, isCombo: true, comboId, comboItens: c.itens });
  }
  renderCarrinho(); calcTotal();
}

// ── Carrinho ──────────────────────────────────────────────────────────────────
function addCarrinho(id) {
  const p = state.PRODS.find(x => x.id === id);
  if (!p) return;
  if (p.estoque <= 0) { toast('Sem estoque!', true); return; }
  const ex = state.carrinho.find(x => x.id === id);
  if (ex) {
    if (ex.qty >= p.estoque) { toast('Estoque máximo', true); return; }
    ex.qty++;
  } else {
    state.carrinho.push({ id: p.id, nome: p.nome, preco: p.venda, custo: p.custo || 0, qty: 1 });
  }
  renderCarrinho(); calcTotal();
}

export function renderCarrinho() {
  const el = qs('cart-items');
  if (!el) return;
  if (!state.carrinho.length) { el.innerHTML = '<div class="empty">Adicione produtos</div>'; return; }
  el.innerHTML = state.carrinho.map((item, i) => `
    <div class="cart-item">
      <div class="ci-name">${item.nome}</div>
      <div class="ci-controls">
        <button class="ci-qbtn" onclick="chgQty(${i},-1)">−</button>
        <span class="ci-qty">${item.qty}</span>
        <button class="ci-qbtn" onclick="chgQty(${i},1)">+</button>
      </div>
      <span class="ci-total">${fmt(item.preco * item.qty)}</span>
      <button class="ci-rm" onclick="rmItem(${i})">×</button>
    </div>`).join('');
}

window.chgQty = function (i, d) {
  const p = state.PRODS.find(x => x.id === state.carrinho[i].id);
  state.carrinho[i].qty += d;
  if (state.carrinho[i].qty <= 0) state.carrinho.splice(i, 1);
  else if (p && state.carrinho[i].qty > p.estoque) { state.carrinho[i].qty = p.estoque; toast('Limite de estoque', true); }
  renderCarrinho(); calcTotal();
};
window.rmItem    = i => { state.carrinho.splice(i, 1); renderCarrinho(); calcTotal(); };
window.limparCarrinho = () => { state.carrinho = []; renderCarrinho(); calcTotal(); };

// ── Totais / pagamento ────────────────────────────────────────────────────────
export function getTotalFinal() {
  const sub = state.carrinho.reduce((a, i) => a + i.preco * i.qty, 0);
  const dv  = parseFloat(qs('c-desc').value) || 0;
  const dt  = qs('c-desc-tipo').value;
  return Math.max(0, sub - (dt === '%' ? sub * (dv / 100) : dv));
}

export function calcTotal() {
  const sub = state.carrinho.reduce((a, i) => a + i.preco * i.qty, 0);
  if (qs('c-sub'))   qs('c-sub').textContent   = fmt(sub);
  if (qs('c-total')) qs('c-total').textContent = fmt(getTotalFinal());
  calcTroco();
}
window.calcTotal = calcTotal;

function calcTroco() {
  const rec = parseFloat((qs('c-recebido') || {}).value) || 0;
  if (qs('c-troco')) qs('c-troco').textContent = fmt(Math.max(0, rec - getTotalFinal()));
}
window.calcTroco = calcTroco;

window.setRecebido = v => { qs('c-recebido').value = v; calcTroco(); };

window.selPag = function (p) {
  state.formaPag = p;
  ['dinheiro', 'credito', 'debito', 'pix'].forEach(x =>
    qs('pt-' + x).classList.toggle('sel', x === p)
  );
  qs('troco-wrap').style.display = p === 'dinheiro' ? 'block' : 'none';
};

// ── Modal fiado ───────────────────────────────────────────────────────────────
window.abrirFiado = function () {
  if (!state.carrinho.length) { toast('Carrinho vazio!', true); return; }
  qs('mfi-total').textContent = fmt(getTotalFinal());
  const nomes = [...new Set(state.FIADOS.map(f => f.cliente))];
  qs('mfi-lista').innerHTML = nomes.map(n => `<option value="${n}">`).join('');
  qs('mfi-nome').value = '';
  qs('modal-fiado').classList.add('open');
};

window.confirmarFiado = async function () {
  const nome = qs('mfi-nome').value.trim();
  if (!nome) { toast('Informe o nome do cliente', true); return; }
  const total = getTotalFinal(), sub = state.carrinho.reduce((a, i) => a + i.preco * i.qty, 0);
  try {
    const venda = { data: new Date().toISOString(), itens: state.carrinho.map(x => ({ ...x })), subtotal: sub, desconto: sub - total, total, formaPag: 'fiado', cliente: nome };
    const vRef = await addDoc(collection(state.db, 'vendas'), venda);
    state.VENDAS.push({ id: vRef.id, ...venda });
    for (const ci of state.carrinho) {
      const p = state.PRODS.find(x => x.id === ci.id);
      if (p) { p.estoque = Math.max(0, p.estoque - ci.qty); await updateDoc(doc(state.db, 'produtos', p.id), { estoque: p.estoque }); }
    }
    const fiad = { data: hoje(), cliente: nome, tipo: 'deb', valor: total, obs: state.carrinho.map(i => i.nome).join(', ') };
    const fRef = await addDoc(collection(state.db, 'fiados'), fiad);
    state.FIADOS.push({ id: fRef.id, ...fiad });
    toast(`Lançado no fiado para ${nome}!`);
    window.limparCarrinho(); fecharModal('modal-fiado'); renderPDV(); atualizarAlertaEstoque();
  } catch (e) { toast('Erro: ' + e.message, true); }
};

window.fecharModal = id => qs(id).classList.remove('open');

// ── Finalizar venda ───────────────────────────────────────────────────────────
window.finalizarVenda = async function () {
  if (!state.carrinho.length) { toast('Carrinho vazio!', true); return; }
  const total = getTotalFinal(), sub = state.carrinho.reduce((a, i) => a + i.preco * i.qty, 0);
  const custoTotal = state.carrinho.reduce((a, i) => a + i.custo * i.qty, 0);
  const venda = { data: new Date().toISOString(), itens: state.carrinho.map(x => ({ ...x })), subtotal: sub, desconto: sub - total, total, custoTotal, formaPag: state.formaPag };
  try {
    const vRef = await addDoc(collection(state.db, 'vendas'), venda);
    state.VENDAS.push({ id: vRef.id, ...venda });
    for (const ci of state.carrinho) {
      if (ci.isCombo) {
        for (const comp of (ci.comboItens || [])) {
          const p = state.PRODS.find(x => x.id === comp.prodId);
          if (p) {
            const baixa = comp.qtd * ci.qty;
            p.estoque = Math.max(0, p.estoque - baixa);
            await updateDoc(doc(state.db, 'produtos', p.id), { estoque: p.estoque });
            const mov = { data: hoje(), produtoId: p.id, produtoNome: p.nome, tipo: 'saida', qtd: baixa, custo: p.custoMedio || p.custo || 0, obs: 'Venda combo: ' + ci.nome };
            const mRef = await addDoc(collection(state.db, 'movimentacoes'), mov);
            state.MOVS.push({ id: mRef.id, ...mov });
          }
        }
      } else {
        const p = state.PRODS.find(x => x.id === ci.id);
        if (p) {
          p.estoque = Math.max(0, p.estoque - ci.qty);
          await updateDoc(doc(state.db, 'produtos', p.id), { estoque: p.estoque });
          const mov = { data: hoje(), produtoId: p.id, produtoNome: p.nome, tipo: 'saida', qtd: ci.qty, custo: p.custoMedio || p.custo || 0, obs: 'Venda PDV' };
          const mRef = await addDoc(collection(state.db, 'movimentacoes'), mov);
          state.MOVS.push({ id: mRef.id, ...mov });
        }
      }
    }
    const lan = { data: hoje(), tipo: 'rec', desc: 'Venda PDV', cat: 'Venda', valor: total, pag: state.formaPag, obs: '' };
    const lRef = await addDoc(collection(state.db, 'lancamentos'), lan);
    state.LANCS.push({ id: lRef.id, ...lan });
    state._ultimaVenda = { ...venda, id: vRef.id };
    toast(`Venda finalizada! ${fmt(total)}`);
    window.limparCarrinho();
    if (qs('c-desc'))     qs('c-desc').value     = '';
    if (qs('c-recebido')) qs('c-recebido').value = '';
    if (qs('c-troco'))    qs('c-troco').textContent = 'R$ 0,00';
    renderPDV(); atualizarAlertaEstoque();
    if (state.CFG.cupomAuto) imprimirCupom();
  } catch (e) { toast('Erro: ' + e.message, true); }
};

// ── Cupom ─────────────────────────────────────────────────────────────────────
function gerarHTMLCupom(venda) {
  const loja = state.CFG.nome || 'Minha Loja';
  const end  = state.CFG.endereco || '';
  const tel  = state.CFG.telefone || '';
  const dt   = new Date(venda.data);
  const dataStr = dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const troco = parseFloat((qs('c-recebido') || { value: '0' }).value || '0') - venda.total;
  return `<div class="cupom-wrap" id="cupom-print">
    <div class="c-title">${loja}</div>
    ${end ? `<div class="c-sub">${end}</div>` : ''}
    ${tel ? `<div class="c-sub">Tel: ${tel}</div>` : ''}
    <div class="c-sub">${dataStr}</div>
    <hr class="c-sep">
    ${(venda.itens || []).map(i => `
      <div class="c-row"><span>${i.nome}</span><span>${i.qty}x ${fmt(i.preco)}</span></div>
      <div class="c-row" style="justify-content:flex-end"><span>${fmt(i.preco * i.qty)}</span></div>
    `).join('')}
    <hr class="c-sep">
    ${venda.desconto > 0 ? `<div class="c-row"><span>Desconto</span><span>- ${fmt(venda.desconto)}</span></div>` : ''}
    <div class="c-row bold"><span>TOTAL</span><span>${fmt(venda.total)}</span></div>
    <div class="c-row"><span>${venda.formaPag}</span><span></span></div>
    ${troco > 0 ? `<div class="c-row"><span>Troco</span><span>${fmt(troco)}</span></div>` : ''}
    <hr class="c-sep">
    <div class="c-center">Obrigado pela preferência!</div>
  </div>`;
}

window.imprimirCupom = function () {
  const v = state._ultimaVenda;
  if (!v) { toast('Finalize uma venda primeiro', true); return; }
  qs('cupom-content').innerHTML = gerarHTMLCupom(v);
  qs('modal-cupom').classList.add('open');
};

window.printCupom = function () {
  const el = qs('cupom-print');
  if (!el) return;
  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>Cupom</title><style>
    body{font-family:monospace;font-size:13px;margin:0;padding:16px;max-width:300px}
    .c-title{text-align:center;font-size:15px;font-weight:700;margin-bottom:2px}
    .c-sub{text-align:center;font-size:11px;color:#555;margin-bottom:2px}
    .c-sep{border:none;border-top:1px dashed #aaa;margin:8px 0}
    .c-row{display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px}
    .c-row.bold{font-weight:700;font-size:14px;margin-top:4px}
    .c-center{text-align:center;font-size:11px;color:#555;margin-top:8px}
  </style></head><body>${el.innerHTML}</body></html>`);
  w.document.close(); setTimeout(() => w.print(), 300);
};
