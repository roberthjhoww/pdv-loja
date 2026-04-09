import { state } from './state.js';
import { fmt, fmtDate, qs, toast, hoje, mesAtual, pct } from './utils.js';
import { doc, deleteDoc } from './firebase.js';

export function renderRelatorios() {
  const hj  = hoje(), mes = mesAtual();
  const vhj  = state.VENDAS.filter(v => v.data.startsWith(hj) && v.formaPag !== 'fiado');
  const vmes = state.VENDAS.filter(v => v.data.startsWith(mes) && v.formaPag !== 'fiado');
  const fatMes    = vmes.reduce((a, v) => a + v.total, 0);
  const custoMes  = vmes.reduce((a, v) => a + (v.custoTotal || 0), 0);
  const lucroBruto   = fatMes - custoMes;
  const margemMedia  = fatMes ? Math.round(lucroBruto / fatMes * 100) : 0;
  const ticket       = vmes.length ? fatMes / vmes.length : 0;
  const despMes      = state.LANCS.filter(l => l.data.startsWith(mes) && l.tipo === 'des').reduce((a, l) => a + l.valor, 0);
  const lucroLiquido = lucroBruto - despMes;

  if (!qs('r-hj')) return;
  qs('r-hj').textContent       = vhj.length;
  qs('r-fat-hj').textContent   = fmt(vhj.reduce((a, v) => a + v.total, 0));
  qs('r-mes').textContent      = vmes.length;
  qs('r-fat-mes').textContent  = fmt(fatMes);
  qs('r-lucro').textContent    = fmt(lucroBruto);
  qs('r-margem').textContent   = margemMedia + '%';
  qs('r-ticket').textContent   = fmt(ticket);
  qs('r-liquido').textContent  = fmt(lucroLiquido);
  qs('r-liquido').style.color  = lucroLiquido >= 0 ? 'var(--green)' : 'var(--red)';

  renderChartDias(); renderChartPag(); renderChartMaisVendidos(); renderChartMaisLucrativos();

  const sorted = [...state.VENDAS].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 60);
  const tb = qs('tb-vendas');
  if (!tb) return;
  if (!sorted.length) { tb.innerHTML = '<tr><td colspan="9" class="empty">Nenhuma venda</td></tr>'; return; }
  tb.innerHTML = sorted.map(v => {
    const lucro = v.total - (v.custoTotal || 0);
    return `<tr>
      <td style="font-family:var(--mono);font-size:13px">${new Date(v.data).toLocaleDateString('pt-BR')} ${new Date(v.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
      <td>${(v.itens || []).length}</td>
      <td style="font-family:var(--mono)">${fmt(v.subtotal)}</td>
      <td style="font-family:var(--mono)">${v.desconto > 0 ? fmt(v.desconto) : '—'}</td>
      <td style="font-family:var(--mono);color:var(--green);font-weight:500">${fmt(v.total)}</td>
      <td style="font-family:var(--mono);color:var(--text3)">${fmt(v.custoTotal || 0)}</td>
      <td style="font-family:var(--mono);color:${lucro >= 0 ? 'var(--green)' : 'var(--red)'}">${fmt(lucro)}</td>
      <td><span class="badge badge-gray" style="font-size:11px">${v.formaPag}</span></td>
      <td><button class="btn btn-sm btn-red" onclick="delVenda('${v.id}')">×</button></td>
    </tr>`;
  }).join('');
}

function renderChartDias() {
  const el = qs('chart-dias');
  if (!el) return;
  const dias = {};
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    dias[d.toISOString().split('T')[0]] = 0;
  }
  state.VENDAS.filter(v => v.formaPag !== 'fiado').forEach(v => {
    const k = v.data.split('T')[0]; if (k in dias) dias[k] += v.total;
  });
  const max = Math.max(...Object.values(dias)) || 1;
  el.innerHTML = Object.entries(dias).map(([d, v]) =>
    `<div class="bar-row"><div class="bar-lbl">${new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</div><div class="bar-track"><div class="bar-fill" style="width:${pct(v, max)}%;background:var(--green)"></div></div><div class="bar-val">${v > 0 ? fmt(v) : '—'}</div></div>`
  ).join('');
}

function renderChartPag() {
  const el = qs('chart-pag');
  if (!el) return;
  const mes = mesAtual(), pags = {};
  state.VENDAS.filter(v => v.data.startsWith(mes)).forEach(v => { pags[v.formaPag] = (pags[v.formaPag] || 0) + v.total; });
  const total  = Object.values(pags).reduce((a, v) => a + v, 0) || 1;
  const sorted = Object.entries(pags).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) { el.innerHTML = '<div class="empty">Sem vendas</div>'; return; }
  el.innerHTML = sorted.map(([p, v]) =>
    `<div class="bar-row"><div class="bar-lbl">${p}</div><div class="bar-track"><div class="bar-fill" style="width:${pct(v, total)}%;background:var(--blue)"></div></div><div class="bar-val">${fmt(v)}</div></div>`
  ).join('');
}

function renderChartMaisVendidos() {
  const el = qs('chart-mais-vendidos');
  if (!el) return;
  const mes = mesAtual(), prods = {};
  state.VENDAS.filter(v => v.data.startsWith(mes) && v.formaPag !== 'fiado')
    .forEach(v => (v.itens || []).forEach(i => { prods[i.nome] = (prods[i.nome] || 0) + i.qty; }));
  const sorted = Object.entries(prods).sort((a, b) => b[1] - a[1]).slice(0, 7);
  const max = sorted.length ? sorted[0][1] : 1;
  if (!sorted.length) { el.innerHTML = '<div class="empty">Sem dados</div>'; return; }
  el.innerHTML = sorted.map(([nome, qty]) =>
    `<div class="bar-row"><div class="bar-lbl" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${nome}">${nome.length > 12 ? nome.slice(0, 12) + '…' : nome}</div><div class="bar-track"><div class="bar-fill" style="width:${pct(qty, max)}%;background:#4a7ab5"></div></div><div class="bar-val">${qty} un</div></div>`
  ).join('');
}

function renderChartMaisLucrativos() {
  const el = qs('chart-mais-lucrativos');
  if (!el) return;
  const mes = mesAtual(), prods = {};
  state.VENDAS.filter(v => v.data.startsWith(mes) && v.formaPag !== 'fiado')
    .forEach(v => (v.itens || []).forEach(i => { const lucro = (i.preco - (i.custo || 0)) * i.qty; prods[i.nome] = (prods[i.nome] || 0) + lucro; }));
  const sorted = Object.entries(prods).sort((a, b) => b[1] - a[1]).slice(0, 7);
  const max = sorted.length ? sorted[0][1] : 1;
  if (!sorted.length) { el.innerHTML = '<div class="empty">Sem dados</div>'; return; }
  el.innerHTML = sorted.map(([nome, lucro]) =>
    `<div class="bar-row"><div class="bar-lbl" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${nome}">${nome.length > 12 ? nome.slice(0, 12) + '…' : nome}</div><div class="bar-track"><div class="bar-fill" style="width:${pct(lucro, max)}%;background:var(--green)"></div></div><div class="bar-val">${fmt(lucro)}</div></div>`
  ).join('');
}

window.exportVendasCSV = function () {
  const rows = state.VENDAS.map(v => [
    new Date(v.data).toLocaleDateString('pt-BR'),
    (v.itens || []).length,
    v.subtotal.toFixed(2),
    (v.desconto || 0).toFixed(2),
    v.total.toFixed(2),
    (v.custoTotal || 0).toFixed(2),
    (v.total - (v.custoTotal || 0)).toFixed(2),
    v.formaPag
  ].join(',')).join('\n');
  const b = new Blob(['\uFEFF' + 'Data,Itens,Subtotal,Desconto,Total,Custo,Lucro,Pagamento\n' + rows], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = 'vendas.csv'; a.click();
};

window.delVenda = async function (id) {
  if (!confirm('Excluir esta venda? O estoque NÃO será revertido automaticamente.')) return;
  try {
    await deleteDoc(doc(state.db, 'vendas', id));
    state.VENDAS = state.VENDAS.filter(v => v.id !== id);
    renderRelatorios(); toast('Venda excluída');
  } catch (e) { toast('Erro: ' + e.message, true); }
};
