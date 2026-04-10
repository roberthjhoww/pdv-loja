import { state } from './state.js';
import { fmt, fmtDate, qs, toast, hoje, mesAtual } from './utils.js';
import { collection, addDoc, doc, deleteDoc, updateDoc } from './firebase.js';

const catsDes = ['Aluguel', 'Fornecedor', 'Energia', 'Água', 'Internet', 'Funcionário', 'Frete', 'Marketing', 'Embalagem', 'Outros'];
const catsRec = ['Venda', 'Serviço', 'Fiado', 'Outros'];

window.toggleCats = function () {
  const t = qs('l-tipo');
  if (!t) return;
  qs('l-cats').innerHTML = (t.value === 'des' ? catsDes : catsRec)
    .map(c => `<span class="tag" onclick="selTag(this,'l-desc')">${c}</span>`)
    .join('');
};

window.selTag = function (el, inputId) {
  el.closest('.tag-wrap').querySelectorAll('.tag').forEach(t => t.classList.remove('sel'));
  el.classList.add('sel');
  qs(inputId).value = el.textContent;
};

export function preencherMeses() {
  const sel = qs('f-mes');
  if (!sel) return;
  const now = new Date();
  let opts = '';
  for (let i = 0; i < 12; i++) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    opts += `<option value="${val}">${d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</option>`;
  }
  sel.innerHTML = opts;
}

export function atualizarMetricasFinanceiro() {
  const mes    = (qs('f-mes') || { value: mesAtual() }).value || mesAtual();
  const do_mes = state.LANCS.filter(l => l.data.startsWith(mes));
  const rec = do_mes.filter(l => l.tipo === 'rec').reduce((a, l) => a + l.valor, 0);
  const des = do_mes.filter(l => l.tipo === 'des').reduce((a, l) => a + l.valor, 0);
  if (!qs('f-rec')) return;
  qs('f-rec').textContent = fmt(rec);
  qs('f-des').textContent = fmt(des);
  qs('f-sal').textContent = fmt(rec - des);
  qs('f-sal').style.color = (rec - des) >= 0 ? 'var(--green)' : 'var(--red)';
  qs('f-qtd').textContent = do_mes.length;
}

export function renderLancamentos() {
  atualizarMetricasFinanceiro();
  const mes  = (qs('f-mes') || { value: mesAtual() }).value || mesAtual();
  const tipo = (qs('f-tipo-fil') || { value: '' }).value;
  let lista  = state.LANCS.filter(l => l.data.startsWith(mes));
  if (tipo) lista = lista.filter(l => l.tipo === tipo);
  lista.sort((a, b) => b.data.localeCompare(a.data));
  const tb = qs('tb-lanc');
  if (!tb) return;
  if (!lista.length) { tb.innerHTML = '<tr><td colspan="7" class="empty">Nenhum lançamento</td></tr>'; return; }
  tb.innerHTML = lista.map(l => {
    if (l.isLote) {
      const itensHtml = (l.itens || []).map(it => `
        <tr style="background:var(--bg)">
          <td style="padding:7px 12px 7px 28px;font-size:13px" colspan="2">↳ ${it.produtoNome || it.prodNome || '—'}</td>
          <td style="padding:7px 12px;font-size:12px;color:var(--text3)">${it.qtd} × ${fmt(it.custo)}</td>
          <td colspan="2" style="padding:7px 12px"></td>
          <td style="padding:7px 12px;font-family:var(--mono);font-size:13px">${fmt(it.valor)}</td>
          <td style="padding:7px 12px;white-space:nowrap">
            <button class="btn btn-sm" onclick="editLoteItem('${l.id}','${it.movId}','${it.prodId || it.produtoId}',${it.qtd},${it.custo})">Editar</button>
            <button class="btn btn-sm btn-red" onclick="delLoteItem('${l.id}','${it.movId}','${it.prodId || it.produtoId}',${it.qtd})">×</button>
          </td>
        </tr>`).join('');
      return `
        <tr>
          <td style="font-family:var(--mono);font-size:13px">${fmtDate(l.data)}</td>
          <td><span class="badge badge-des">Despesa</span></td>
          <td>
            <strong>${l.desc}</strong>
            <span class="badge badge-gray" style="font-size:10px;margin-left:4px">${(l.itens || []).length} itens</span>
          </td>
          <td><span class="badge badge-gray" style="font-size:11px">${l.cat || '—'}</span></td>
          <td style="font-size:13px;color:var(--text3)">—</td>
          <td style="font-family:var(--mono);font-weight:500;color:var(--red)">−${fmt(l.valor)}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-sm" id="btn-lote-exp-${l.id}" onclick="toggleLoteExpand('${l.id}')">▶ Itens</button>
            <button class="btn btn-sm btn-red" onclick="delLanc('${l.id}')">×</button>
          </td>
        </tr>
        <tr id="lote-detail-${l.id}" style="display:none">
          <td colspan="7" style="padding:0">
            <table style="width:100%;border-collapse:collapse"><tbody>${itensHtml}</tbody></table>
          </td>
        </tr>`;
    }
    return `<tr>
      <td style="font-family:var(--mono);font-size:13px">${fmtDate(l.data)}</td>
      <td><span class="badge ${l.tipo === 'rec' ? 'badge-rec' : 'badge-des'}">${l.tipo === 'rec' ? 'Receita' : 'Despesa'}</span></td>
      <td>${l.desc}</td>
      <td><span class="badge badge-gray" style="font-size:11px">${l.cat || '—'}</span></td>
      <td style="font-size:13px;color:var(--text3)">${l.pag || '—'}</td>
      <td style="font-family:var(--mono);font-weight:500;color:${l.tipo === 'rec' ? 'var(--green)' : 'var(--red)'}">${l.tipo === 'des' ? '−' : ''}${fmt(l.valor)}</td>
      <td><button class="btn btn-sm btn-red" onclick="delLanc('${l.id}')">×</button></td>
    </tr>`;
  }).join('');
  renderChartCat();
}
window.renderLancamentos = renderLancamentos;

export function renderChartCat() {
  const mes    = (qs('f-mes') || { value: mesAtual() }).value || mesAtual();
  const do_mes = state.LANCS.filter(l => l.data.startsWith(mes) && l.tipo === 'des');
  const cats   = {};
  do_mes.forEach(l => { const c = l.cat || 'Outros'; cats[c] = (cats[c] || 0) + l.valor; });
  const total  = Object.values(cats).reduce((a, v) => a + v, 0) || 1;
  const el = qs('chart-cat');
  if (!el) return;
  const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]).slice(0, 7);
  if (!sorted.length) { el.innerHTML = '<div class="empty">Sem despesas</div>'; return; }
  el.innerHTML = sorted.map(([cat, val]) => {
    const w = Math.round(val / total * 100);
    return `<div class="bar-row"><div class="bar-lbl">${cat}</div><div class="bar-track"><div class="bar-fill" style="width:${w}%;background:var(--red)"></div></div><div class="bar-val">${fmt(val)}</div></div>`;
  }).join('');
}

window.addLancamento = async function () {
  const tipo = qs('l-tipo').value;
  const desc = qs('l-desc').value.trim();
  const val  = parseFloat(qs('l-val').value) || 0;
  const data = qs('l-data').value;
  const pag  = qs('l-pag').value;
  const obs  = qs('l-obs').value;
  const catEl = document.querySelector('#l-cats .tag.sel');
  const cat  = catEl ? catEl.textContent : (tipo === 'rec' ? 'Venda' : 'Outros');
  if (!desc) { toast('Informe a descrição', true); return; }
  if (val <= 0) { toast('Informe o valor', true); return; }
  if (!data) { toast('Informe a data', true); return; }
  try {
    const lan = { data, tipo, desc, cat, valor: val, pag, obs };
    const ref = await addDoc(collection(state.db, 'lancamentos'), lan);
    state.LANCS.push({ id: ref.id, ...lan });
    ['l-desc', 'l-val', 'l-obs'].forEach(id => qs(id).value = '');
    toast('Registrado!'); renderLancamentos();
  } catch (e) { toast('Erro: ' + e.message, true); }
};

window.delLanc = async function (id) {
  if (!confirm('Excluir este lançamento?')) return;
  const lan = state.LANCS.find(l => l.id === id);
  try {
    if (lan?.isLote && lan.itens?.length) {
      for (const item of lan.itens) {
        if (item.movId) {
          await deleteDoc(doc(state.db, 'movimentacoes', item.movId));
          state.MOVS = state.MOVS.filter(m => m.id !== item.movId);
          const p = state.PRODS.find(x => x.id === (item.prodId || item.produtoId));
          if (p) {
            p.estoque = Math.max(0, p.estoque - item.qtd);
            await updateDoc(doc(state.db, 'produtos', p.id), { estoque: p.estoque });
          }
        }
      }
      window.renderEstoque?.();
      window.renderMov?.();
      window.atualizarMetricasEstoque?.();
      window.renderProdutos?.();
    }
    await deleteDoc(doc(state.db, 'lancamentos', id));
    state.LANCS = state.LANCS.filter(l => l.id !== id);
    renderLancamentos();
    toast('Excluído');
  } catch (e) { toast('Erro: ' + e.message, true); }
};

window.toggleLoteExpand = function (id) {
  const det = document.getElementById('lote-detail-' + id);
  const btn = document.getElementById('btn-lote-exp-' + id);
  if (!det) return;
  const open = det.style.display !== 'none';
  det.style.display = open ? 'none' : '';
  if (btn) btn.textContent = open ? '▶ Itens' : '▼ Itens';
};

window.delLoteItem = async function (lancId, movId, prodId, qtd) {
  if (!confirm('Excluir este item do lote?')) return;
  const lan = state.LANCS.find(l => l.id === lancId);
  if (!lan || !lan.itens) return;
  try {
    await deleteDoc(doc(state.db, 'movimentacoes', movId));
    state.MOVS = state.MOVS.filter(m => m.id !== movId);
    const p = state.PRODS.find(x => x.id === prodId);
    if (p) {
      p.estoque = Math.max(0, p.estoque - qtd);
      await updateDoc(doc(state.db, 'produtos', p.id), { estoque: p.estoque });
    }
    lan.itens = lan.itens.filter(it => it.movId !== movId);
    if (lan.itens.length === 0) {
      await deleteDoc(doc(state.db, 'lancamentos', lancId));
      state.LANCS = state.LANCS.filter(l => l.id !== lancId);
    } else {
      lan.valor = lan.itens.reduce((a, it) => a + it.valor, 0);
      await updateDoc(doc(state.db, 'lancamentos', lancId), { itens: lan.itens, valor: lan.valor });
    }
    renderLancamentos();
    window.renderEstoque?.(); window.renderMov?.();
    window.atualizarMetricasEstoque?.(); window.renderProdutos?.();
    toast('Item excluído');
  } catch (e) { toast('Erro: ' + e.message, true); }
};

window.editLoteItem = function (lancId, movId, prodId, qtd, custo) {
  const lan  = state.LANCS.find(l => l.id === lancId);
  const item = lan?.itens?.find(it => it.movId === movId);
  qs('edit-lote-lancId').value   = lancId;
  qs('edit-lote-movId').value    = movId;
  qs('edit-lote-prodId').value   = prodId;
  qs('edit-lote-prod-nome').textContent = item?.produtoNome || item?.prodNome || '—';
  qs('edit-lote-qtd').value      = qtd;
  qs('edit-lote-custo').value    = custo;
  qs('modal-edit-lote-item').classList.add('open');
};

window.salvarEditLoteItem = async function () {
  const lancId   = qs('edit-lote-lancId').value;
  const movId    = qs('edit-lote-movId').value;
  const prodId   = qs('edit-lote-prodId').value;
  const novaQtd  = parseInt(qs('edit-lote-qtd').value)      || 0;
  const novoCusto= parseFloat(qs('edit-lote-custo').value)   || 0;
  if (novaQtd <= 0)   { toast('Informe a quantidade', true); return; }
  if (novoCusto <= 0) { toast('Informe o custo', true); return; }
  const lan  = state.LANCS.find(l => l.id === lancId);
  const item = lan?.itens?.find(it => it.movId === movId);
  if (!lan || !item) return;
  const delta = novaQtd - item.qtd;
  const p = state.PRODS.find(x => x.id === prodId);
  try {
    await updateDoc(doc(state.db, 'movimentacoes', movId), { qtd: novaQtd, custo: novoCusto });
    const mov = state.MOVS.find(m => m.id === movId);
    if (mov) { mov.qtd = novaQtd; mov.custo = novoCusto; }
    if (p && delta !== 0) {
      p.estoque = Math.max(0, p.estoque + delta);
      await updateDoc(doc(state.db, 'produtos', p.id), { estoque: p.estoque });
    }
    item.qtd   = novaQtd;
    item.custo = novoCusto;
    item.valor = novaQtd * novoCusto;
    lan.valor  = lan.itens.reduce((a, it) => a + it.valor, 0);
    await updateDoc(doc(state.db, 'lancamentos', lancId), { itens: lan.itens, valor: lan.valor });
    fecharModal('modal-edit-lote-item');
    renderLancamentos();
    window.renderEstoque?.(); window.renderMov?.();
    window.atualizarMetricasEstoque?.(); window.renderProdutos?.();
    toast('Item atualizado');
  } catch (e) { toast('Erro: ' + e.message, true); }
};

window.exportCSV = function () {
  const mes  = (qs('f-mes') || { value: mesAtual() }).value || mesAtual();
  const lista = state.LANCS.filter(l => l.data.startsWith(mes));
  const rows  = lista.map(l => [fmtDate(l.data), l.tipo === 'rec' ? 'Receita' : 'Despesa', l.desc, l.cat || '', l.pag || '', l.valor.toFixed(2)].join(',')).join('\n');
  const b = new Blob(['\uFEFF' + 'Data,Tipo,Descrição,Categoria,Pagamento,Valor\n' + rows], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = 'financeiro_' + mes + '.csv'; a.click();
};
