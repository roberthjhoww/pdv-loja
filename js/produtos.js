import { state } from './state.js';
import { fmt, qs, toast } from './utils.js';
import { collection, addDoc, doc, updateDoc, deleteDoc } from './firebase.js';

export function renderProdutos() {
  const busca = (qs('p-busca') || { value: '' }).value.toLowerCase();
  const lista = state.PRODS.filter(p =>
    !busca || p.nome.toLowerCase().includes(busca) ||
    (p.codigo || '').includes(busca) ||
    (p.codigos || []).some(c => c.includes(busca))
  );
  if (qs('prod-count')) qs('prod-count').textContent = state.PRODS.length + ' produtos';
  const tb = qs('tb-prods');
  if (!tb) return;
  if (!lista.length) { tb.innerHTML = '<tr><td colspan="8" class="empty">Nenhum produto</td></tr>'; return; }
  tb.innerHTML = lista.map(p => `<tr>
    <td><strong>${p.nome}</strong><br><span style="font-size:12px;color:var(--text3)">${p.categoria || ''}</span></td>
    <td><span class="badge ${p.tipo === 'insumo' ? 'badge-insumo' : 'badge-produto'}">${p.tipo === 'insumo' ? 'Insumo' : 'Produto'}</span></td>
    <td style="font-family:var(--mono);font-size:13px">${(p.codigos && p.codigos.length ? p.codigos : [p.codigo || '—']).join(', ')}</td>
    <td style="font-family:var(--mono)">${fmt(p.custoMedio || p.custo || 0)}</td>
    <td style="font-family:var(--mono)">${fmt(p.venda)}</td>
    <td style="font-family:var(--mono)">${p.estoque} ${p.unidade || 'un'}</td>
    <td style="text-align:center"><button onclick="toggleFavProd('${p.id}')" style="font-size:17px;background:none;border:none;cursor:pointer;opacity:${state.FAVS.has(p.id) ? 1 : .3}">${state.FAVS.has(p.id) ? '★' : '☆'}</button></td>
    <td style="display:flex;gap:6px;flex-wrap:wrap">
      <button class="btn btn-sm" onclick="editarProd('${p.id}')">Editar</button>
      <button class="btn btn-sm btn-red" onclick="excluirProd('${p.id}')">×</button>
    </td>
  </tr>`).join('');
}
window.renderProdutos = renderProdutos;

function saveFavs() {
  localStorage.setItem('favs', JSON.stringify([...state.FAVS]));
}

window.toggleFavProd = function (id) {
  if (state.FAVS.has(id)) state.FAVS.delete(id); else state.FAVS.add(id);
  saveFavs(); renderProdutos();
  // Atualiza PDV também
  import('./pdv.js').then(m => m.renderPDV());
};

// ── Gerenciar múltiplos códigos ───────────────────────────────────────────────
window.addCodigoProd = function () {
  const input = qs('p-codigo-novo');
  const val   = input.value.trim();
  if (!val) return;
  if (state._codigos_temp.includes(val)) { toast('Código já adicionado', true); return; }
  state._codigos_temp.push(val);
  input.value = '';
  renderCodigosChips();
};

export function renderCodigosChips() {
  const el = qs('p-codigos-lista');
  if (!el) return;
  if (!state._codigos_temp.length) {
    el.innerHTML = '<span style="font-size:13px;color:var(--text3)">Nenhum código</span>';
    return;
  }
  el.innerHTML = state._codigos_temp.map((c, i) => `
    <span class="codigo-chip">
      ${c}
      <button onclick="rmCodigoProd(${i})" title="Remover">×</button>
    </span>`).join('');
}

window.rmCodigoProd = function (i) {
  state._codigos_temp.splice(i, 1);
  renderCodigosChips();
};

// ── CRUD produto ──────────────────────────────────────────────────────────────
window.salvarProduto = async function () {
  const nome     = qs('p-nome').value.trim();
  const codigos  = state._codigos_temp || [];
  const codigo   = codigos[0] || '';
  const tipo     = qs('p-tipo').value;
  const categoria = qs('p-cat').value;
  const unidade  = qs('p-unid').value;
  const custo    = parseFloat(qs('p-custo').value) || 0;
  const venda    = parseFloat(qs('p-venda').value) || 0;
  const estoque  = parseInt(qs('p-estoque').value) || 0;
  const estoqueMin = parseInt(qs('p-min').value) || 5;
  if (!nome)    { toast('Informe o nome', true); return; }
  if (venda <= 0) { toast('Informe o preço de venda', true); return; }
  const data = { nome, codigo, codigos, tipo, categoria, unidade, custo, custoMedio: custo, venda, estoqueMin };
  try {
    if (state.editId) {
      await updateDoc(doc(state.db, 'produtos', state.editId), data);
      const p = state.PRODS.find(x => x.id === state.editId);
      if (p) Object.assign(p, data);
    } else {
      const ref = await addDoc(collection(state.db, 'produtos'), { ...data, estoque });
      state.PRODS.push({ id: ref.id, ...data, estoque });
    }
    toast('Produto salvo!');
    window.cancelEdit(); renderProdutos();
    const { renderEstoque, atualizarMetricasEstoque, atualizarSelectProd } = await import('./estoque.js');
    renderEstoque(); atualizarMetricasEstoque(); atualizarSelectProd();
    const { atualizarAlertaEstoque } = await import('./pdv.js');
    atualizarAlertaEstoque();
  } catch (e) { toast('Erro: ' + e.message, true); }
};

window.editarProd = function (id) {
  const p = state.PRODS.find(x => x.id === id);
  if (!p) return;
  state.editId = id;
  qs('p-nome').value    = p.nome;
  state._codigos_temp   = p.codigos && p.codigos.length ? [...p.codigos] : (p.codigo ? [p.codigo] : []);
  renderCodigosChips();
  qs('p-tipo').value    = p.tipo || 'produto';
  qs('p-cat').value     = p.categoria || 'Outros';
  qs('p-unid').value    = p.unidade || 'un';
  qs('p-custo').value   = p.custo || '';
  qs('p-venda').value   = p.venda;
  qs('p-estoque').value = p.estoque;
  qs('p-min').value     = p.estoqueMin || 5;
  qs('prod-form-title').textContent = 'Editar produto';
  qs('p-nome').focus();
};

window.cancelEdit = function () {
  state.editId = null;
  ['p-nome', 'p-custo', 'p-venda'].forEach(id => { if (qs(id)) qs(id).value = ''; });
  state._codigos_temp = []; renderCodigosChips();
  if (qs('p-codigo-novo')) qs('p-codigo-novo').value = '';
  if (qs('p-estoque')) qs('p-estoque').value = 0;
  if (qs('p-min'))     qs('p-min').value     = 5;
  if (qs('prod-form-title')) qs('prod-form-title').textContent = 'Novo produto';
};

window.excluirProd = async function (id) {
  if (!confirm('Excluir produto?')) return;
  await deleteDoc(doc(state.db, 'produtos', id));
  state.PRODS = state.PRODS.filter(p => p.id !== id);
  renderProdutos();
  const { renderEstoque, atualizarMetricasEstoque, atualizarSelectProd } = await import('./estoque.js');
  renderEstoque(); atualizarMetricasEstoque(); atualizarSelectProd();
  const { atualizarAlertaEstoque } = await import('./pdv.js');
  atualizarAlertaEstoque(); toast('Excluído');
};
