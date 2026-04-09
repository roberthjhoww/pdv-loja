import { state } from './state.js';
import { fmt, fmtDate, qs, toast, hoje } from './utils.js';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc } from './firebase.js';

export function atualizarMetricasEstoque() {
  if (!qs('e-total')) return;
  qs('e-total').textContent = state.PRODS.length;
  qs('e-baixo').textContent = state.PRODS.filter(p => p.estoque > 0 && p.estoque <= (p.estoqueMin || 5)).length;
  qs('e-zero').textContent  = state.PRODS.filter(p => p.estoque <= 0).length;
  qs('e-valor').textContent = fmt(state.PRODS.reduce((a, p) => a + (p.custo || 0) * p.estoque, 0));
}

export function renderEstoque() {
  const busca = (qs('est-busca') || { value: '' }).value.toLowerCase();
  const lista = state.PRODS.filter(p => !busca || p.nome.toLowerCase().includes(busca));
  atualizarSelectProd();
  const tb = qs('tb-estoque');
  if (!tb) return;
  if (!lista.length) { tb.innerHTML = '<tr><td colspan="9" class="empty">Nenhum produto</td></tr>'; return; }
  tb.innerHTML = lista.map(p => {
    let badge = 'badge-ok', bt = 'OK';
    if (p.estoque <= 0)                         { badge = 'badge-out'; bt = 'Sem estoque'; }
    else if (p.estoque <= (p.estoqueMin || 5))  { badge = 'badge-low'; bt = 'Baixo'; }
    const margem = p.custo && p.venda ? Math.round((p.venda - p.custo) / p.venda * 100) : 0;
    const cm = p.custoMedio || p.custo || 0;
    return `<tr>
      <td><strong>${p.nome}</strong><br><span class="badge ${p.tipo === 'insumo' ? 'badge-insumo' : 'badge-produto'}" style="font-size:11px">${p.tipo === 'insumo' ? 'Insumo' : 'Produto'}</span></td>
      <td style="font-family:var(--mono);font-size:13px">${(p.codigos && p.codigos.length ? p.codigos : [p.codigo || '—']).join(', ')}</td>
      <td style="font-family:var(--mono)"><strong>${p.estoque}</strong> ${p.unidade || 'un'}</td>
      <td style="font-family:var(--mono)">${p.estoqueMin || 5}</td>
      <td style="font-family:var(--mono)">${fmt(p.custo || 0)}<span class="custo-medio-badge" title="Custo médio ponderado">CM: ${fmt(cm)}</span></td>
      <td style="font-family:var(--mono)">${fmt(p.venda)}</td>
      <td style="font-family:var(--mono);color:${margem > 30 ? 'var(--green)' : 'var(--amber)'}">${margem}%</td>
      <td><span class="badge ${badge}">${bt}</span></td>
      <td>
        <button class="btn btn-sm" onclick="verHistCusto('${p.id}','${p.nome.replace(/'/g, "\\'")}')">Custo</button>
        <button class="btn btn-sm btn-red" onclick="zerarEstoque('${p.id}')">Zerar</button>
      </td>
    </tr>`;
  }).join('');
}
window.renderEstoque = renderEstoque;

export function renderMov() {
  const tb = qs('tb-mov');
  if (!tb) return;
  const lista = [...state.MOVS].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 80);
  if (!lista.length) { tb.innerHTML = '<tr><td colspan="6" class="empty">Nenhuma movimentação</td></tr>'; return; }
  tb.innerHTML = lista.map(m => `<tr>
    <td style="font-family:var(--mono);font-size:13px">${fmtDate(m.data)}</td>
    <td>${m.produtoNome || '—'}</td>
    <td><span class="badge ${m.tipo === 'entrada' ? 'badge-rec' : 'badge-des'}">${m.tipo === 'entrada' ? 'Entrada' : 'Saída'}</span></td>
    <td style="font-family:var(--mono)">${m.qtd}</td>
    <td style="font-size:13px;color:var(--text3)">${m.obs || ''}</td>
    <td><button class="btn btn-sm btn-red" onclick="delMov('${m.id}')">×</button></td>
  </tr>`).join('');
}

window.delMov = async function (id) {
  if (!confirm('Excluir este registro de movimentação?')) return;
  try {
    await deleteDoc(doc(state.db, 'movimentacoes', id));
    state.MOVS = state.MOVS.filter(m => m.id !== id);
    renderMov(); toast('Movimentação excluída');
  } catch (e) { toast('Erro: ' + e.message, true); }
};

export function atualizarSelectProd() {
  const sel = qs('ent-prod');
  if (!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="">Selecione...</option>' +
    state.PRODS.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
  sel.value = prev;
}

window.entradaEstoque = async function () {
  const id   = qs('ent-prod').value;
  const qtd  = parseInt(qs('ent-qtd').value) || 0;
  const custo = parseFloat(qs('ent-custo').value) || 0;
  if (!id)    { toast('Selecione um produto', true); return; }
  if (qtd <= 0) { toast('Informe a quantidade', true); return; }
  const p = state.PRODS.find(x => x.id === id);
  if (!p) return;
  const custoAtual = p.custoMedio || p.custo || 0;
  const novoCustoMedio = custo > 0 && p.estoque + qtd > 0
    ? ((p.estoque * custoAtual) + (qtd * custo)) / (p.estoque + qtd)
    : custoAtual;
  p.estoque += qtd;
  const upd = { estoque: p.estoque };
  if (custo > 0) { p.custo = custo; p.custoMedio = parseFloat(novoCustoMedio.toFixed(4)); upd.custo = custo; upd.custoMedio = p.custoMedio; }
  try {
    await updateDoc(doc(state.db, 'produtos', id), upd);
    const mov = { data: hoje(), produtoId: id, produtoNome: p.nome, tipo: 'entrada', qtd, obs: 'Entrada manual' + (custo ? ` · custo ${fmt(custo)}` : '') };
    const mRef = await addDoc(collection(state.db, 'movimentacoes'), mov);
    state.MOVS.push({ id: mRef.id, ...mov });
    if (custo > 0) {
      const lan = { data: hoje(), tipo: 'des', desc: 'Compra estoque: ' + p.nome, cat: 'Fornecedor', valor: custo * qtd, pag: '', obs: '' };
      const lRef = await addDoc(collection(state.db, 'lancamentos'), lan);
      state.LANCS.push({ id: lRef.id, ...lan });
      const hc = { data: hoje(), produtoId: id, produtoNome: p.nome, custo, qtd, custoMedio: p.custoMedio };
      await addDoc(collection(state.db, 'hist_custo'), hc);
    }
    toast('Estoque atualizado!');
    renderEstoque(); renderMov(); atualizarMetricasEstoque();
    // Alerta PDV atualizado via import
    const { atualizarAlertaEstoque } = await import('./pdv.js');
    atualizarAlertaEstoque();
    qs('ent-qtd').value = 1; qs('ent-custo').value = '';
  } catch (e) { toast('Erro: ' + e.message, true); }
};

window.zerarEstoque = async function (id) {
  if (!confirm('Zerar estoque deste produto? O valor vai para 0.')) return;
  const p = state.PRODS.find(x => x.id === id);
  if (!p) return;
  try {
    const qtdAnterior = p.estoque;
    await updateDoc(doc(state.db, 'produtos', id), { estoque: 0 });
    p.estoque = 0;
    const mov = { data: hoje(), produtoId: id, produtoNome: p.nome, tipo: 'saida', qtd: qtdAnterior, obs: 'Estoque zerado manualmente' };
    const mRef = await addDoc(collection(state.db, 'movimentacoes'), mov);
    state.MOVS.push({ id: mRef.id, ...mov });
    toast('Estoque zerado!');
    renderEstoque(); renderMov(); atualizarMetricasEstoque();
    const { atualizarAlertaEstoque } = await import('./pdv.js');
    atualizarAlertaEstoque();
  } catch (e) { toast('Erro: ' + e.message, true); }
};

// ── Histórico de custo ────────────────────────────────────────────────────────
window.verHistCusto = async function (id, nome) {
  qs('mhc-title').textContent = 'Histórico de custo — ' + nome;
  qs('mhc-content').innerHTML = '<div class="empty">Carregando...</div>';
  qs('modal-hist-custo').classList.add('open');
  try {
    const snap = await getDocs(collection(state.db, 'hist_custo'));
    const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(h => h.produtoId === id)
      .sort((a, b) => b.data.localeCompare(a.data))
      .slice(0, 30);
    if (!lista.length) {
      qs('mhc-content').innerHTML = '<div class="empty">Nenhum registro de custo ainda.<br>Registros são criados ao dar entrada de estoque com custo informado.</div>';
      return;
    }
    qs('mhc-content').innerHTML = `
      <table style="width:100%">
        <thead><tr><th>Data</th><th>Qtd entrada</th><th>Custo unit.</th><th>Custo médio após</th></tr></thead>
        <tbody>${lista.map(h => `<tr>
          <td style="font-family:var(--mono);font-size:13px">${fmtDate(h.data)}</td>
          <td style="font-family:var(--mono)">${h.qtd}</td>
          <td style="font-family:var(--mono);color:var(--red)">${fmt(h.custo)}</td>
          <td style="font-family:var(--mono);color:var(--blue)">${h.custoMedio ? fmt(h.custoMedio) : '—'}</td>
        </tr>`).join('')}</tbody>
      </table>`;
  } catch (e) { qs('mhc-content').innerHTML = '<div class="empty">Erro ao carregar</div>'; }
};
