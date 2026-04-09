import { state } from './state.js';
import { fmt, qs, toast } from './utils.js';
import { collection, addDoc, doc, updateDoc, deleteDoc } from './firebase.js';

export function atualizarSelectCombo() {
  const sel = qs('cb-item-sel');
  if (!sel) return;
  sel.innerHTML = '<option value="">Selecione...</option>' +
    state.PRODS.map(p =>
      `<option value="${p.id}" data-custo="${p.custoMedio || p.custo || 0}" data-nome="${p.nome}" data-unid="${p.unidade || 'un'}">[${p.tipo === 'insumo' ? 'Insumo' : 'Produto'}] ${p.nome} — estoque: ${p.estoque} ${p.unidade || 'un'}</option>`
    ).join('');
}

window.addItemCombo = function () {
  const sel = qs('cb-item-sel');
  const prodId = sel.value;
  if (!prodId) { toast('Selecione um item', true); return; }
  const qtd  = parseFloat(qs('cb-item-qtd').value) || 1;
  const opt  = sel.options[sel.selectedIndex];
  const custo = parseFloat(opt.dataset.custo) || 0;
  const nome  = opt.dataset.nome;
  const unid  = opt.dataset.unid;
  const ex = state.combosItensTemp.find(x => x.prodId === prodId);
  if (ex) { ex.qtd += qtd; }
  else state.combosItensTemp.push({ prodId, nome, qtd, custo, unid });
  qs('cb-item-sel').value = ''; qs('cb-item-qtd').value = 1;
  renderComboItensTemp(); window.calcCustoCombo();
};

function renderComboItensTemp() {
  const el = qs('combo-itens-lista');
  if (!el) return;
  if (!state.combosItensTemp.length) { el.innerHTML = '<div class="empty" style="padding:12px">Nenhum item adicionado</div>'; return; }
  el.innerHTML = state.combosItensTemp.map((ci, i) => `
    <div class="combo-item-row">
      <span style="flex:1">${ci.nome}</span>
      <input type="number" value="${ci.qtd}" min="0.01" step="0.01" style="width:60px;font-size:13px;padding:3px 5px" onchange="updateQtdCombo(${i},this.value)">
      <span style="font-family:var(--mono);font-size:13px;color:var(--text3);min-width:64px;text-align:right">${fmt(ci.custo * ci.qtd)}</span>
      <button class="btn btn-sm btn-red" onclick="rmItemCombo(${i})">×</button>
    </div>`).join('');
}

window.updateQtdCombo = function (i, v) {
  state.combosItensTemp[i].qtd = parseFloat(v) || 1;
  renderComboItensTemp(); window.calcCustoCombo();
};
window.rmItemCombo = function (i) {
  state.combosItensTemp.splice(i, 1); renderComboItensTemp(); window.calcCustoCombo();
};

window.calcCustoCombo = function () {
  const custo = state.combosItensTemp.reduce((a, ci) => a + ci.custo * ci.qtd, 0);
  const venda = parseFloat((qs('cb-venda') || { value: '0' }).value) || 0;
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
  const venda  = parseFloat(qs('cb-venda').value) || 0;
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
    window.cancelEditCombo(); renderCombos();
    import('./pdv.js').then(m => m.renderPDV());
  } catch (e) { toast('Erro: ' + e.message, true); }
};

window.cancelEditCombo = function () {
  state.editComboId = null; state.combosItensTemp = [];
  if (qs('cb-nome'))   qs('cb-nome').value   = '';
  if (qs('cb-codigo')) qs('cb-codigo').value = '';
  if (qs('cb-venda'))  qs('cb-venda').value  = '';
  if (qs('combo-form-title')) qs('combo-form-title').textContent = 'Novo combo';
  renderComboItensTemp(); window.calcCustoCombo();
};

export function renderCombos() {
  const busca = (qs('cb-busca') || { value: '' }).value.toLowerCase();
  const lista = state.COMBOS.filter(c => !busca || c.nome.toLowerCase().includes(busca));
  if (qs('combo-count')) qs('combo-count').textContent = state.COMBOS.length + ' combos';
  const tb = qs('tb-combos');
  if (!tb) return;
  if (!lista.length) { tb.innerHTML = '<tr><td colspan="6" class="empty">Nenhum combo cadastrado</td></tr>'; return; }
  tb.innerHTML = lista.map(c => {
    const margem   = c.venda > 0 ? Math.round((c.venda - c.custoTotal) / c.venda * 100) : 0;
    const itensStr = (c.itens || []).map(ci => `${ci.nome} (${ci.qtd}${ci.unid || ''})`).join(', ');
    return `<tr>
      <td><strong>${c.nome}</strong><br><span style="font-family:var(--mono);font-size:13px;color:var(--text3)">${c.codigo || '—'}</span></td>
      <td style="font-size:13px;color:var(--text3);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${itensStr}">${itensStr}</td>
      <td style="font-family:var(--mono);color:var(--red)">${fmt(c.custoTotal)}</td>
      <td style="font-family:var(--mono);color:var(--green);font-weight:500">${fmt(c.venda)}</td>
      <td style="font-family:var(--mono);color:${margem > 30 ? 'var(--green)' : 'var(--amber)'}">${margem}%</td>
      <td style="display:flex;gap:6px">
        <button class="btn btn-sm" onclick="editarCombo('${c.id}')">Editar</button>
        <button class="btn btn-sm btn-red" onclick="excluirCombo('${c.id}')">×</button>
      </td>
    </tr>`;
  }).join('');
}
window.renderCombos = renderCombos;

window.editarCombo = function (id) {
  const c = state.COMBOS.find(x => x.id === id);
  if (!c) return;
  state.editComboId = id;
  state.combosItensTemp = [...(c.itens || []).map(ci => ({ ...ci }))];
  if (qs('cb-nome'))   qs('cb-nome').value   = c.nome;
  if (qs('cb-codigo')) qs('cb-codigo').value = c.codigo || '';
  if (qs('cb-venda'))  qs('cb-venda').value  = c.venda;
  if (qs('combo-form-title')) qs('combo-form-title').textContent = 'Editar combo';
  renderComboItensTemp(); window.calcCustoCombo();
  window.goTo('combos', document.querySelector('.nav-item:nth-child(9)'));
};

window.excluirCombo = async function (id) {
  if (!confirm('Excluir combo?')) return;
  await deleteDoc(doc(state.db, 'combos', id));
  state.COMBOS = state.COMBOS.filter(c => c.id !== id);
  renderCombos();
  import('./pdv.js').then(m => m.renderPDV());
  toast('Combo excluído');
};
