import { state } from './state.js';
import { fmt, qs, toast } from './utils.js';
import { collection, addDoc, doc, updateDoc, deleteDoc } from './firebase.js';

function comboParseNum(val) {
  return parseFloat((String(val || '')).replace(',', '.')) || 0;
}

export function atualizarSelectCombo() {
  // campo substituído por busca com dropdown — sem ação necessária
}

// ── Busca de item (produto/insumo) no formulário de combo ────────────────────
window.comboItemBusca = function () {
  const term = (qs('cb-item-search')?.value || '').toLowerCase();
  const drop = qs('cb-item-drop');
  if (!drop) return;
  if (!term) { drop.style.display = 'none'; return; }
  const results = state.PRODS.filter(p =>
    p.nome.toLowerCase().includes(term) ||
    (p.codigos && p.codigos.some(c => String(c).toLowerCase().includes(term))) ||
    (p.codigo && String(p.codigo).toLowerCase().includes(term))
  ).slice(0, 12);
  if (!results.length) { drop.style.display = 'none'; return; }
  drop.style.display = '';
  drop.innerHTML = results.map(p => {
    const tipo = p.tipo === 'insumo' ? 'Insumo' : 'Produto';
    const cm   = p.custoMedio || p.custo || 0;
    return `<div style="padding:8px 10px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border)"
         onmousedown="comboItemSelecionar('${p.id}','${p.nome.replace(/'/g, "\\'")}')"
         onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''">
      <span>${p.nome}</span>
      <span class="badge" style="font-size:10px;margin-left:4px">${tipo}</span>
      <span style="color:var(--text3);font-size:11px;margin-left:6px">estoque: ${p.estoque} ${p.unidade || 'un'} · CM: ${fmt(cm)}</span>
    </div>`;
  }).join('');
};

window.comboItemMostraDrop = function () {
  const term = qs('cb-item-search')?.value || '';
  if (term) window.comboItemBusca();
};

window.comboItemEscondeDrop = function () {
  setTimeout(() => { const d = qs('cb-item-drop'); if (d) d.style.display = 'none'; }, 150);
};

window.comboItemSelecionar = function (prodId, prodNome) {
  qs('cb-item-search').value = prodNome;
  qs('cb-item-sel').value    = prodId;
  qs('cb-item-drop').style.display = 'none';
  qs('cb-item-qtd')?.focus();
};

window.comboItemKey = function (e) {
  const drop = qs('cb-item-drop');
  if (e.key === 'Enter' || e.key === 'Tab') {
    if (drop && drop.style.display !== 'none') {
      const first = drop.querySelector('div');
      if (first) { first.dispatchEvent(new MouseEvent('mousedown')); e.preventDefault(); return; }
    }
    e.preventDefault();
    qs('cb-item-qtd')?.focus();
  }
};

window.comboItemQtdKey = function (e) {
  if (e.key === 'Enter') { e.preventDefault(); window.addItemCombo(); }
};

window.comboNumKey = function (e) {
  if (e.key === ',') {
    e.preventDefault();
    const el = e.target;
    const start = el.selectionStart ?? el.value.length;
    const end   = el.selectionEnd   ?? start;
    el.value = el.value.slice(0, start) + '.' + el.value.slice(end);
    el.selectionStart = el.selectionEnd = start + 1;
    el.dispatchEvent(new Event('input'));
  }
};

// ── Disponibilidade do combo ─────────────────────────────────────────────────
function comboDisponibilidade(combo) {
  const itens = combo.itens || [];
  if (!itens.length) return { label: 'Disponível', badge: 'badge-ok' };
  let semEstoque = 0, insuf = 0;
  for (const ci of itens) {
    const p = state.PRODS.find(x => x.id === ci.prodId);
    if (!p) continue;
    if (p.estoque <= 0) semEstoque++;
    else if (p.estoque < ci.qtd) insuf++;
  }
  if (semEstoque > 0) return { label: 'Indisponível', badge: 'badge-out' };
  if (insuf > 0)      return { label: 'Estoque baixo', badge: 'badge-low' };
  return { label: 'Disponível', badge: 'badge-ok' };
}

window.abrirModalNovoCombo = function () {
  state.editComboId = null;
  state.combosItensTemp = [];
  if (qs('cb-nome'))         qs('cb-nome').value   = '';
  if (qs('cb-codigo'))       qs('cb-codigo').value = '';
  if (qs('cb-venda'))        qs('cb-venda').value  = '';
  if (qs('cb-item-search'))  qs('cb-item-search').value = '';
  if (qs('cb-item-sel'))     qs('cb-item-sel').value    = '';
  if (qs('cb-item-qtd'))     qs('cb-item-qtd').value    = 1;
  if (qs('combo-form-title')) qs('combo-form-title').textContent = 'Novo combo';
  renderComboItensTemp(); window.calcCustoCombo();
  qs('modal-combo').classList.add('open');
  setTimeout(() => qs('cb-nome')?.focus(), 80);
};

window.addItemCombo = function () {
  const prodId = qs('cb-item-sel')?.value;
  if (!prodId) { toast('Selecione um item', true); return; }
  const p    = state.PRODS.find(x => x.id === prodId);
  if (!p) return;
  const qtd  = comboParseNum(qs('cb-item-qtd').value) || 1;
  const custo = p.custoMedio || p.custo || 0;
  const nome  = p.nome;
  const unid  = p.unidade || 'un';

  // Aviso de estoque zerado (não bloqueante)
  if (p.estoque <= 0) toast(`"${nome}" está sem estoque`, false);

  const ex = state.combosItensTemp.find(x => x.prodId === prodId);
  if (ex) { ex.qtd += qtd; }
  else state.combosItensTemp.push({ prodId, nome, qtd, custo, unid });

  qs('cb-item-sel').value = '';
  qs('cb-item-search').value = '';
  qs('cb-item-qtd').value = 1;
  renderComboItensTemp(); window.calcCustoCombo();
};

function renderComboItensTemp() {
  const el = qs('combo-itens-lista');
  if (!el) return;
  if (!state.combosItensTemp.length) { el.innerHTML = '<div class="empty" style="padding:12px">Nenhum item adicionado</div>'; return; }
  el.innerHTML = state.combosItensTemp.map((ci, i) => `
    <div class="combo-item-row">
      <span style="flex:1">
        ${ci.nome}
        <span style="font-size:11px;color:var(--text3);margin-left:4px">${fmt(ci.custo)}/un</span>
      </span>
      <input type="text" inputmode="decimal" value="${ci.qtd}" style="width:60px;font-size:13px;padding:3px 5px"
             onchange="updateQtdCombo(${i},this.value)" onkeydown="comboNumKey(event)">
      <span style="font-family:var(--mono);font-size:13px;color:var(--text3);min-width:64px;text-align:right">${fmt(ci.custo * ci.qtd)}</span>
      <button class="btn btn-sm btn-red" onclick="rmItemCombo(${i})">×</button>
    </div>`).join('');
}

window.updateQtdCombo = function (i, v) {
  state.combosItensTemp[i].qtd = comboParseNum(v) || 1;
  renderComboItensTemp(); window.calcCustoCombo();
};
window.rmItemCombo = function (i) {
  state.combosItensTemp.splice(i, 1); renderComboItensTemp(); window.calcCustoCombo();
};

window.calcCustoCombo = function () {
  const custo = state.combosItensTemp.reduce((a, ci) => a + ci.custo * ci.qtd, 0);
  const venda = comboParseNum((qs('cb-venda') || { value: '0' }).value);
  const margem = venda > 0 ? Math.round((venda - custo) / venda * 100) : 0;
  if (qs('cb-custo-total')) qs('cb-custo-total').textContent = fmt(custo);
  if (qs('cb-margem')) {
    qs('cb-margem').textContent = venda > 0 ? `${margem}% (lucro: ${fmt(venda - custo)})` : '—';
    qs('cb-margem').style.color = margem > 30 ? 'var(--green)' : margem > 10 ? 'var(--amber)' : 'var(--red)';
  }
};

window.salvarCombo = async function () {
  const nome   = qs('cb-nome').value.trim();
  const codigo = qs('cb-codigo').value.trim();
  const venda  = comboParseNum(qs('cb-venda').value);
  if (!nome)    { toast('Informe o nome', true); return; }
  if (venda <= 0) { toast('Informe o preço de venda', true); return; }
  if (!state.combosItensTemp.length) { toast('Adicione pelo menos um item', true); return; }
  const custoTotal = state.combosItensTemp.reduce((a, ci) => a + ci.custo * ci.qtd, 0);
  const data = {
    nome, codigo, venda, custoTotal,
    itens: state.combosItensTemp.map(ci => ({ prodId: ci.prodId, nome: ci.nome, qtd: ci.qtd, custo: ci.custo, unid: ci.unid }))
  };
  try {
    if (state.editComboId) {
      await updateDoc(doc(state.db, 'combos', state.editComboId), data);
      const c = state.COMBOS.find(x => x.id === state.editComboId);
      if (c) Object.assign(c, data);
    } else {
      const ref = await addDoc(collection(state.db, 'combos'), data);
      state.COMBOS.push({ id: ref.id, ...data });
    }
    toast('Combo salvo!');
    qs('modal-combo')?.classList.remove('open');
    state.editComboId = null; state.combosItensTemp = [];
    renderCombos();
    import('./pdv.js').then(m => m.renderPDV());
  } catch (e) { toast('Erro: ' + e.message, true); }
};

window.cancelEditCombo = function () {
  state.editComboId = null; state.combosItensTemp = [];
  qs('modal-combo')?.classList.remove('open');
};

export function renderCombos() {
  const busca = (qs('cb-busca') || { value: '' }).value.toLowerCase();
  const lista = state.COMBOS.filter(c => !busca || c.nome.toLowerCase().includes(busca));
  if (qs('combo-count')) qs('combo-count').textContent = state.COMBOS.length + ' combos';
  const tb = qs('tb-combos');
  if (!tb) return;
  if (!lista.length) { tb.innerHTML = '<tr><td colspan="6" class="empty">Nenhum combo cadastrado</td></tr>'; return; }
  tb.innerHTML = lista.map(c => {
    const margem = c.venda > 0 ? Math.round((c.venda - c.custoTotal) / c.venda * 100) : 0;
    const itens  = c.itens || [];
    const disp   = comboDisponibilidade(c);

    // Componentes: primeiros 2 em linha, restante expansível
    const resumo  = itens.slice(0, 2).map(ci => `${ci.nome} (${ci.qtd}${ci.unid || ''})`).join(', ');
    const temMais = itens.length > 2;
    const detalhe = itens.map(ci => `
      <div style="padding:2px 0;font-size:12px;color:var(--text2)">
        · ${ci.nome}
        <span style="font-family:var(--mono);color:var(--text3);margin-left:4px">${ci.qtd}${ci.unid || ''} · ${fmt(ci.custo)}/un · <strong>${fmt(ci.custo * ci.qtd)}</strong></span>
      </div>`).join('');

    return `<tr>
      <td>
        <strong>${c.nome}</strong>
        <span class="badge ${disp.badge}" style="font-size:10px;margin-left:4px">${disp.label}</span>
        <br><span style="font-family:var(--mono);font-size:13px;color:var(--text3)">${c.codigo || '—'}</span>
      </td>
      <td style="font-size:13px;color:var(--text3);max-width:180px">
        <div>${resumo}${temMais ? ` <button class="btn btn-sm" id="btn-cexp-${c.id}" onclick="toggleComboItens('${c.id}')" style="padding:1px 5px;font-size:11px">+${itens.length - 2} ▶</button>` : ''}</div>
        <div id="combo-itens-det-${c.id}" style="display:none;margin-top:6px;padding-top:6px;border-top:1px solid var(--border)">${detalhe}</div>
      </td>
      <td style="font-family:var(--mono);color:var(--red)">${fmt(c.custoTotal)}</td>
      <td style="font-family:var(--mono);color:var(--green);font-weight:500">${fmt(c.venda)}</td>
      <td style="font-family:var(--mono);color:${margem > 30 ? 'var(--green)' : 'var(--amber)'}">${margem}%</td>
      <td style="white-space:nowrap">
        <button class="btn btn-sm" onclick="editarCombo('${c.id}')">Editar</button>
        <button class="btn btn-sm" onclick="duplicarCombo('${c.id}')" title="Duplicar combo">⧉</button>
        <button class="btn btn-sm btn-red" onclick="excluirCombo('${c.id}')">×</button>
      </td>
    </tr>`;
  }).join('');
}
window.renderCombos = renderCombos;

window.toggleComboItens = function (id) {
  const det = document.getElementById('combo-itens-det-' + id);
  const btn = document.getElementById('btn-cexp-' + id);
  if (!det) return;
  const open = det.style.display !== 'none';
  det.style.display = open ? 'none' : '';
  if (btn) btn.textContent = open ? `+${(det.querySelectorAll('div').length)} ▶` : '▲ ocultar';
};

function _abrirModalCombo(c, titulo) {
  state.combosItensTemp = [...(c.itens || []).map(ci => ({ ...ci }))];
  if (qs('cb-nome'))         qs('cb-nome').value   = c.nome;
  if (qs('cb-codigo'))       qs('cb-codigo').value = c.codigo || '';
  if (qs('cb-venda'))        qs('cb-venda').value  = c.venda;
  if (qs('cb-item-search'))  qs('cb-item-search').value = '';
  if (qs('cb-item-sel'))     qs('cb-item-sel').value    = '';
  if (qs('cb-item-qtd'))     qs('cb-item-qtd').value    = 1;
  if (qs('combo-form-title')) qs('combo-form-title').textContent = titulo;
  renderComboItensTemp(); window.calcCustoCombo();
  qs('modal-combo').classList.add('open');
  // scroll do modal ao topo
  const modal = qs('modal-combo')?.querySelector('.modal');
  if (modal) modal.scrollTop = 0;
}

window.editarCombo = function (id) {
  const c = state.COMBOS.find(x => x.id === id);
  if (!c) return;
  state.editComboId = id;
  _abrirModalCombo(c, 'Editar combo');
};

window.duplicarCombo = function (id) {
  const c = state.COMBOS.find(x => x.id === id);
  if (!c) return;
  state.editComboId = null;
  _abrirModalCombo({ ...c, nome: c.nome + ' (cópia)', codigo: '' }, 'Novo combo');
  toast(`Combo "${c.nome}" duplicado — ajuste e salve`);
};

window.excluirCombo = async function (id) {
  if (!confirm('Excluir combo?')) return;
  await deleteDoc(doc(state.db, 'combos', id));
  state.COMBOS = state.COMBOS.filter(c => c.id !== id);
  renderCombos();
  import('./pdv.js').then(m => m.renderPDV());
  toast('Combo excluído');
};
