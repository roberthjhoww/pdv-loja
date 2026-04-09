import { state } from './state.js';
import { fmt, fmtDate, qs, toast, hoje, mesAtual } from './utils.js';
import { collection, addDoc, doc, deleteDoc } from './firebase.js';

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
  tb.innerHTML = lista.map(l => `<tr>
    <td style="font-family:var(--mono);font-size:13px">${fmtDate(l.data)}</td>
    <td><span class="badge ${l.tipo === 'rec' ? 'badge-rec' : 'badge-des'}">${l.tipo === 'rec' ? 'Receita' : 'Despesa'}</span></td>
    <td>${l.desc}</td>
    <td><span class="badge badge-gray" style="font-size:11px">${l.cat || '—'}</span></td>
    <td style="font-size:13px;color:var(--text3)">${l.pag || '—'}</td>
    <td style="font-family:var(--mono);font-weight:500;color:${l.tipo === 'rec' ? 'var(--green)' : 'var(--red)'}">${l.tipo === 'des' ? '−' : ''}${fmt(l.valor)}</td>
    <td><button class="btn btn-sm btn-red" onclick="delLanc('${l.id}')">×</button></td>
  </tr>`).join('');
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
  if (!confirm('Excluir?')) return;
  await deleteDoc(doc(state.db, 'lancamentos', id));
  state.LANCS = state.LANCS.filter(l => l.id !== id);
  renderLancamentos(); toast('Excluído');
};

window.exportCSV = function () {
  const mes  = (qs('f-mes') || { value: mesAtual() }).value || mesAtual();
  const lista = state.LANCS.filter(l => l.data.startsWith(mes));
  const rows  = lista.map(l => [fmtDate(l.data), l.tipo === 'rec' ? 'Receita' : 'Despesa', l.desc, l.cat || '', l.pag || '', l.valor.toFixed(2)].join(',')).join('\n');
  const b = new Blob(['\uFEFF' + 'Data,Tipo,Descrição,Categoria,Pagamento,Valor\n' + rows], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = 'financeiro_' + mes + '.csv'; a.click();
};
