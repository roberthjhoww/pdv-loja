import { state } from './state.js';
import { fmt, fmtDate, qs, toast, hoje } from './utils.js';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc } from './firebase.js';
import { renderProdutos } from './produtos.js';
import { renderLancamentos, atualizarMetricasFinanceiro } from './financeiro.js';

// Parser que aceita vírgula ou ponto como separador decimal
function loteParseNum(val) {
  return parseFloat((String(val || '')).replace(',', '.')) || 0;
}

// Índice de item destacado por teclado em cada dropdown do lote
const _loteDropIdx = {};

export function atualizarMetricasEstoque() {
  if (!qs('e-total')) return;
  qs('e-total').textContent = state.PRODS.length;
  qs('e-baixo').textContent = state.PRODS.filter(p => p.estoque > 0 && p.estoque <= (p.estoqueMin || 5)).length;
  qs('e-zero').textContent  = state.PRODS.filter(p => p.estoque <= 0).length;
  const valorEstoque = state.MOVS.reduce((acc, m) => {
    const p = state.PRODS.find(x => x.id === m.produtoId);
    const custo = m.custo ?? (p ? (p.custoMedio || p.custo || 0) : 0);
    const valor = m.qtd * custo;
    return m.tipo === 'entrada' ? acc + valor : acc - valor;
  }, 0);
  qs('e-valor').textContent = fmt(Math.max(0, valorEstoque));
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
window.atualizarMetricasEstoque = atualizarMetricasEstoque;

export function renderMov() {
  const tb = qs('tb-mov');
  if (!tb) return;
  const sorted = [...state.MOVS].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 100);
  if (!sorted.length) { tb.innerHTML = '<tr><td colspan="6" class="empty">Nenhuma movimentação</td></tr>'; return; }

  // Agrupar movimentos de lote
  const groups = new Map();
  const singles = [];
  for (const m of sorted) {
    const lan = m.lancamentoId ? state.LANCS.find(l => l.id === m.lancamentoId && l.isLote) : null;
    if (lan) {
      if (!groups.has(m.lancamentoId)) groups.set(m.lancamentoId, { lan, movs: [], date: m.data });
      groups.get(m.lancamentoId).movs.push(m);
    } else {
      singles.push(m);
    }
  }

  // Timeline unificada
  const entries = [
    ...singles.map(m => ({ type: 'single', date: m.data, m })),
    ...Array.from(groups.values()).map(g => ({ type: 'lote', date: g.date, g }))
  ];
  entries.sort((a, b) => b.date.localeCompare(a.date));

  tb.innerHTML = entries.map(entry => {
    if (entry.type === 'lote') {
      const { lan, movs } = entry.g;
      const totalQtd = movs.reduce((a, m) => a + m.qtd, 0);
      const detalhe  = movs.map(m => `
        <tr style="background:var(--bg)">
          <td style="padding:7px 12px 7px 28px;font-size:13px">↳ ${m.produtoNome || '—'}</td>
          <td style="padding:7px 12px;font-family:var(--mono);font-size:13px">${m.qtd}</td>
          <td style="padding:7px 12px;font-size:12px;color:var(--text3)">${m.custo ? fmt(m.custo) + '/un' : '—'}</td>
          <td colspan="2" style="padding:7px 12px"></td>
          <td style="padding:7px 12px;white-space:nowrap">
            <button class="btn btn-sm" onclick="abrirEditMov('${m.id}')">Editar</button>
            <button class="btn btn-sm btn-red" onclick="delMov('${m.id}')">×</button>
          </td>
        </tr>`).join('');
      return `
        <tr>
          <td style="font-family:var(--mono);font-size:13px">${fmtDate(entry.date)}</td>
          <td colspan="2">
            <strong>Entrada em lote</strong>
            ${lan.fornecedor ? `<span style="color:var(--text3);font-size:12px"> — ${lan.fornecedor}</span>` : ''}
            <span class="badge badge-rec" style="font-size:10px;margin-left:4px">Entrada</span>
            <span class="badge badge-gray" style="font-size:10px;margin-left:2px">${movs.length} produto(s)</span>
          </td>
          <td style="font-family:var(--mono)">${totalQtd}</td>
          <td style="font-size:13px;color:var(--text3)">${movs[0]?.obs || ''}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-sm" id="btn-movlote-${lan.id}" onclick="toggleMovLote('${lan.id}')">▶</button>
            <button class="btn btn-sm btn-red" onclick="delLanc('${lan.id}')" title="Excluir lote inteiro">×</button>
          </td>
        </tr>
        <tr id="movlote-detail-${lan.id}" style="display:none">
          <td colspan="6" style="padding:0">
            <table style="width:100%;border-collapse:collapse"><tbody>${detalhe}</tbody></table>
          </td>
        </tr>`;
    }
    const m = entry.m;
    return `<tr>
      <td style="font-family:var(--mono);font-size:13px">${fmtDate(m.data)}</td>
      <td>${m.produtoNome || '—'}</td>
      <td><span class="badge ${m.tipo === 'entrada' ? 'badge-rec' : 'badge-des'}">${m.tipo === 'entrada' ? 'Entrada' : 'Saída'}</span></td>
      <td style="font-family:var(--mono)">${m.qtd}</td>
      <td style="font-size:13px;color:var(--text3)">${m.obs || ''}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-sm" onclick="abrirEditMov('${m.id}')">Editar</button>
        <button class="btn btn-sm btn-red" onclick="delMov('${m.id}')">×</button>
      </td>
    </tr>`;
  }).join('');
}

window.toggleMovLote = function (lancId) {
  const det = document.getElementById('movlote-detail-' + lancId);
  const btn = document.getElementById('btn-movlote-' + lancId);
  if (!det) return;
  const open = det.style.display !== 'none';
  det.style.display = open ? 'none' : '';
  if (btn) btn.textContent = open ? '▶' : '▼';
};

window.abrirEditMov = function (movId) {
  const m = state.MOVS.find(x => x.id === movId);
  if (!m) return;
  qs('edit-mov-id').value          = movId;
  qs('edit-mov-nome').textContent  = m.produtoNome || '—';
  qs('edit-mov-tipo').textContent  = m.tipo === 'entrada' ? 'Entrada' : 'Saída';
  qs('edit-mov-qtd').value         = m.qtd;
  qs('edit-mov-custo').value       = m.custo || '';
  qs('edit-mov-custo-wrap').style.display = m.tipo === 'entrada' ? '' : 'none';
  qs('modal-edit-mov').classList.add('open');
};

window.salvarEditMov = async function () {
  const movId    = qs('edit-mov-id').value;
  const novaQtd  = parseInt(qs('edit-mov-qtd').value)     || 0;
  const novoCusto= parseFloat(qs('edit-mov-custo').value) || 0;
  if (novaQtd <= 0) { toast('Informe a quantidade', true); return; }
  const m = state.MOVS.find(x => x.id === movId);
  if (!m) return;
  const delta = novaQtd - m.qtd;
  const p     = state.PRODS.find(x => x.id === m.produtoId);
  try {
    const upd = { qtd: novaQtd };
    if (m.tipo === 'entrada' && novoCusto > 0) upd.custo = novoCusto;
    await updateDoc(doc(state.db, 'movimentacoes', movId), upd);
    m.qtd = novaQtd;
    if (upd.custo) m.custo = novoCusto;

    if (p && delta !== 0) {
      p.estoque = Math.max(0, m.tipo === 'entrada' ? p.estoque + delta : p.estoque - delta);
      await updateDoc(doc(state.db, 'produtos', p.id), { estoque: p.estoque });
    }
    if (m.tipo === 'entrada' && novoCusto > 0 && p) {
      p.custo = novoCusto;
      await updateDoc(doc(state.db, 'produtos', p.id), { custo: novoCusto });
    }

    // Atualizar lançamento em lote se vinculado
    if (m.lancamentoId) {
      const lan = state.LANCS.find(l => l.id === m.lancamentoId);
      if (lan?.isLote && lan.itens) {
        const item = lan.itens.find(it => it.movId === movId);
        if (item) {
          item.qtd   = novaQtd;
          if (upd.custo) item.custo = novoCusto;
          item.valor = item.qtd * (item.custo || 0);
          lan.valor  = lan.itens.reduce((a, it) => a + it.valor, 0);
          await updateDoc(doc(state.db, 'lancamentos', lan.id), { itens: lan.itens, valor: lan.valor });
        }
      }
    }

    qs('modal-edit-mov').classList.remove('open');
    renderMov(); renderEstoque(); atualizarMetricasEstoque(); renderProdutos();
    renderLancamentos(); atualizarMetricasFinanceiro();
    toast('Movimentação atualizada');
  } catch (e) { toast('Erro: ' + e.message, true); }
};

window.delMov = async function (id) {
  if (!confirm('Excluir este registro de movimentação? O estoque do produto será ajustado.')) return;
  const mov = state.MOVS.find(m => m.id === id);
  if (!mov) return;
  const p = state.PRODS.find(x => x.id === mov.produtoId);
  try {
    await deleteDoc(doc(state.db, 'movimentacoes', id));
    state.MOVS = state.MOVS.filter(m => m.id !== id);
    if (p) {
      const delta = mov.tipo === 'entrada' ? -mov.qtd : mov.qtd;
      p.estoque = Math.max(0, p.estoque + delta);
      await updateDoc(doc(state.db, 'produtos', p.id), { estoque: p.estoque });
    }
    if (mov.lancamentoId) {
      const lan = state.LANCS.find(l => l.id === mov.lancamentoId);
      if (lan && lan.isLote && lan.itens && lan.itens.length > 1) {
        lan.itens = lan.itens.filter(it => it.movId !== id);
        lan.valor = lan.itens.reduce((a, it) => a + it.valor, 0);
        await updateDoc(doc(state.db, 'lancamentos', lan.id), { itens: lan.itens, valor: lan.valor });
      } else {
        await deleteDoc(doc(state.db, 'lancamentos', mov.lancamentoId));
        state.LANCS = state.LANCS.filter(l => l.id !== mov.lancamentoId);
      }
      renderLancamentos(); atualizarMetricasFinanceiro();
    }
    renderMov(); renderEstoque(); atualizarMetricasEstoque(); renderProdutos();
    toast('Movimentação excluída' + (p ? ` · estoque de "${p.nome}" ajustado` : ''));
  } catch (e) { toast('Erro: ' + e.message, true); }
};

export function atualizarSelectProd() {
  // campo de produto agora é input com busca — não precisa popular select
}

// ── Busca de produto no "Registrar Entrada" ──────────────────────────────────
window.entBusca = function () {
  const term = (document.getElementById('ent-prod-search')?.value || '').toLowerCase();
  const drop = document.getElementById('ent-drop');
  if (!drop) return;
  if (!term) { drop.style.display = 'none'; return; }
  const results = state.PRODS.filter(p =>
    p.nome.toLowerCase().includes(term) ||
    (p.codigos && p.codigos.some(c => String(c).toLowerCase().includes(term))) ||
    (p.codigo && String(p.codigo).toLowerCase().includes(term))
  ).slice(0, 12);
  if (!results.length) { drop.style.display = 'none'; return; }
  drop.style.display = '';
  drop.innerHTML = results.map(p => `
    <div style="padding:8px 10px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border)"
         onmousedown="entSelecionarProd('${p.id}','${p.nome.replace(/'/g, "\\'")}')"
         onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''">
      <span>${p.nome}</span>
      <span style="color:var(--text3);font-size:11px;margin-left:6px">estoque: ${p.estoque} ${p.unidade || 'un'}</span>
    </div>`).join('');
};

window.entMostraDrop = function () {
  const term = document.getElementById('ent-prod-search')?.value || '';
  if (term) window.entBusca();
};

window.entEscondeDrop = function () {
  setTimeout(() => {
    const d = document.getElementById('ent-drop');
    if (d) d.style.display = 'none';
  }, 150);
};

window.entSelecionarProd = function (prodId, prodNome) {
  document.getElementById('ent-prod-search').value = prodNome;
  document.getElementById('ent-prod').value = prodId;
  document.getElementById('ent-drop').style.display = 'none';
  document.getElementById('ent-qtd')?.focus();
};

window.entKeyProd = function (e) {
  const drop = document.getElementById('ent-drop');
  if (e.key === 'Enter' || e.key === 'Tab') {
    if (drop && drop.style.display !== 'none') {
      const first = drop.querySelector('div');
      if (first) { first.dispatchEvent(new MouseEvent('mousedown')); e.preventDefault(); return; }
    }
    e.preventDefault();
    document.getElementById('ent-qtd')?.focus();
  }
};

window.entNumKey = function (e) {
  if (e.key === ',') {
    e.preventDefault();
    const el = e.target;
    const start = el.selectionStart ?? el.value.length;
    const end   = el.selectionEnd   ?? start;
    el.value = el.value.slice(0, start) + '.' + el.value.slice(end);
    el.selectionStart = el.selectionEnd = start + 1;
  }
};

window.entradaEstoque = async function () {
  const id    = qs('ent-prod').value;
  const qtd   = loteParseNum(qs('ent-qtd').value);
  const custo = loteParseNum(qs('ent-custo').value);
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
    const custoMov = custo > 0 ? custo : (p.custoMedio || p.custo || 0);
    const mov = { data: hoje(), produtoId: id, produtoNome: p.nome, tipo: 'entrada', qtd, custo: custoMov, obs: 'Entrada manual' + (custo ? ` · custo ${fmt(custo)}` : '') };
    const mRef = await addDoc(collection(state.db, 'movimentacoes'), mov);
    let movLocal = { id: mRef.id, ...mov };
    state.MOVS.push(movLocal);
    if (custo > 0) {
      const lan = { data: hoje(), tipo: 'des', desc: 'Compra estoque: ' + p.nome, cat: 'Fornecedor', valor: custo * qtd, pag: '', obs: '' };
      const lRef = await addDoc(collection(state.db, 'lancamentos'), lan);
      state.LANCS.push({ id: lRef.id, ...lan });
      movLocal.lancamentoId = lRef.id;
      await updateDoc(doc(state.db, 'movimentacoes', mRef.id), { lancamentoId: lRef.id });
      const hc = { data: hoje(), produtoId: id, produtoNome: p.nome, custo, qtd, custoMedio: p.custoMedio };
      await addDoc(collection(state.db, 'hist_custo'), hc);
    }
    toast('Estoque atualizado!');
    renderEstoque(); renderMov(); atualizarMetricasEstoque();
    // Alerta PDV atualizado via import
    const { atualizarAlertaEstoque } = await import('./pdv.js');
    atualizarAlertaEstoque();
    qs('ent-qtd').value = 1; qs('ent-custo').value = '';
    qs('ent-prod').value = ''; qs('ent-prod-search').value = '';
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
    const mov = { data: hoje(), produtoId: id, produtoNome: p.nome, tipo: 'saida', qtd: qtdAnterior, custo: p.custoMedio || p.custo || 0, obs: 'Estoque zerado manualmente' };
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

// ── Entrada em Lote ───────────────────────────────────────────────────────────
let loteIdxCounter = 0;

function loteGetFornecedores() {
  return JSON.parse(localStorage.getItem('fornecedores_hist') || '[]');
}
function loteSalvarFornecedor(nome) {
  if (!nome) return;
  const list = loteGetFornecedores();
  if (!list.includes(nome)) { list.unshift(nome); localStorage.setItem('fornecedores_hist', JSON.stringify(list.slice(0, 20))); }
}

window.abrirModalLote = function () {
  loteIdxCounter = 0;
  const wrap = qs('lote-rows-wrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  qs('lote-form-section').style.display = '';
  qs('lote-review-section').style.display = 'none';
  qs('lote-grand-total').textContent = 'R$ 0,00';
  qs('lote-fornecedor').value = '';
  const dl = qs('lote-fornecedores-list');
  if (dl) dl.innerHTML = loteGetFornecedores().map(f => `<option value="${f}">`).join('');
  loteAddLinha();
  qs('modal-lote').classList.add('open');
};

window.loteAddLinha = function () {
  const idx = loteIdxCounter++;
  const wrap = qs('lote-rows-wrap');
  const div = document.createElement('div');
  div.id = 'lote-row-' + idx;
  div.dataset.idx = idx;
  div.style.cssText = 'display:grid;grid-template-columns:1fr 70px 120px 108px 32px;gap:6px;align-items:start;margin-bottom:8px';
  div.innerHTML = `
    <div style="position:relative">
      <input type="text" id="lote-search-${idx}" placeholder="Buscar produto…" autocomplete="off" style="width:100%"
             oninput="loteBusca(${idx})" onfocus="loteMostraDrop(${idx})" onblur="loteEscondeDrop(${idx})"
             onkeydown="loteKeyProd(${idx},event)">
      <input type="hidden" id="lote-id-${idx}">
      <div id="lote-drop-${idx}" style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);max-height:160px;overflow-y:auto;z-index:300;box-shadow:0 4px 12px rgba(0,0,0,.12)"></div>
      <div id="lote-info-${idx}" style="font-size:11px;color:var(--text3);margin-top:2px;min-height:14px"></div>
    </div>
    <input type="text" inputmode="decimal" id="lote-qtd-${idx}" value="1" style="text-align:center"
           oninput="loteCalcFromUnit(${idx})" onkeydown="loteKeyField(${idx},'qtd',event);loteNumKey(event)">
    <div style="position:relative">
      <input type="text" inputmode="decimal" id="lote-unit-${idx}" placeholder="0,00" style="width:100%;padding-right:26px"
             oninput="loteCalcFromUnit(${idx})" onkeydown="loteKeyField(${idx},'unit',event);loteNumKey(event)">
      <span id="lote-alert-${idx}" style="display:none;position:absolute;right:6px;top:50%;transform:translateY(-50%);font-size:13px;cursor:help" title=""></span>
    </div>
    <input type="text" inputmode="decimal" id="lote-val-${idx}" placeholder="0,00"
           oninput="loteCalcFromVal(${idx})" onkeydown="loteKeyField(${idx},'val',event);loteNumKey(event)">
    <button class="btn btn-sm btn-red" onclick="loteRemove(${idx})" style="padding:0;width:32px;height:33px;font-size:16px" title="Remover">×</button>`;
  wrap.appendChild(div);
  div.scrollIntoView({ block: 'nearest' });
  document.getElementById('lote-search-' + idx)?.focus();
};

window.loteRemove = function (idx) {
  const row = document.getElementById('lote-row-' + idx);
  if (row) row.remove();
  loteAtualizarGrandTotal();
};

window.loteBusca = function (idx) {
  const term = (document.getElementById('lote-search-' + idx)?.value || '').toLowerCase();
  const drop = document.getElementById('lote-drop-' + idx);
  if (!drop) return;
  _loteDropIdx[idx] = -1;
  if (!term) { drop.style.display = 'none'; return; }
  const results = state.PRODS.filter(p =>
    p.nome.toLowerCase().includes(term) ||
    (p.codigos && p.codigos.some(c => String(c).toLowerCase().includes(term))) ||
    (p.codigo && String(p.codigo).toLowerCase().includes(term))
  ).slice(0, 12);
  if (!results.length) { drop.style.display = 'none'; return; }
  drop.style.display = '';
  drop.innerHTML = results.map((p, i) => `
    <div class="lote-drop-item" data-i="${i}" style="padding:8px 10px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border)"
         onmousedown="loteSelecionarProd(${idx},'${p.id}','${p.nome.replace(/'/g, "\\'")}')"
         onmouseover="loteDropMouseover(${idx},${i})">
      ${p.nome}
      <span style="color:var(--text3);font-size:11px;margin-left:6px">estoque: ${p.estoque} ${p.unidade || 'un'}</span>
    </div>`).join('');
};

window.loteDropMouseover = function (idx, i) {
  _loteDropIdx[idx] = i;
  loteDropUpdateHighlight(idx);
};

function loteDropUpdateHighlight(idx) {
  const drop = document.getElementById('lote-drop-' + idx);
  if (!drop) return;
  const items = drop.querySelectorAll('.lote-drop-item');
  const active = _loteDropIdx[idx] ?? -1;
  items.forEach((item, i) => { item.style.background = i === active ? 'var(--bg)' : ''; });
  if (active >= 0 && items[active]) items[active].scrollIntoView({ block: 'nearest' });
}

window.loteMostraDrop = function (idx) {
  const term = document.getElementById('lote-search-' + idx)?.value || '';
  if (term) window.loteBusca(idx);
};

window.loteEscondeDrop = function (idx) {
  setTimeout(() => {
    const d = document.getElementById('lote-drop-' + idx);
    if (d) d.style.display = 'none';
  }, 150);
};

window.loteSelecionarProd = function (idx, prodId, prodNome) {
  const p = state.PRODS.find(x => x.id === prodId);
  if (!p) return;

  // Aviso de duplicata (não bloqueante)
  const existingIds = Array.from(document.querySelectorAll('#lote-rows-wrap > div'))
    .filter(row => row.dataset.idx !== String(idx))
    .map(row => document.getElementById('lote-id-' + row.dataset.idx)?.value)
    .filter(Boolean);
  if (existingIds.includes(prodId)) {
    toast(`"${prodNome}" já está na lista`, false);
  }

  document.getElementById('lote-search-' + idx).value = prodNome;
  document.getElementById('lote-id-' + idx).value = prodId;
  document.getElementById('lote-drop-' + idx).style.display = 'none';
  const cm = p.custoMedio || p.custo || 0;
  document.getElementById('lote-info-' + idx).textContent =
    `Estoque atual: ${p.estoque} ${p.unidade || 'un'} · Último custo: ${fmt(p.custo || 0)} · CM: ${fmt(cm)}`;
  const unitEl = document.getElementById('lote-unit-' + idx);
  if (cm > 0 && !(loteParseNum(unitEl.value) > 0)) {
    unitEl.value = cm.toFixed(2);
    window.loteCalcFromUnit(idx);
  }
  // foco sem select (mouse) — select é feito pelo loteKeyProd quando via teclado
  document.getElementById('lote-qtd-' + idx)?.focus();
};

window.loteCalcFromUnit = function (idx) {
  const qtd  = loteParseNum(document.getElementById('lote-qtd-'  + idx)?.value);
  const unit = loteParseNum(document.getElementById('lote-unit-' + idx)?.value);
  const valEl = document.getElementById('lote-val-' + idx);
  if (valEl) valEl.value = (qtd && unit) ? (qtd * unit).toFixed(2) : '';
  loteVerificarAlerta(idx);
  loteAtualizarGrandTotal();
};

window.loteCalcFromVal = function (idx) {
  const qtd  = loteParseNum(document.getElementById('lote-qtd-' + idx)?.value);
  const val  = loteParseNum(document.getElementById('lote-val-' + idx)?.value);
  const unitEl = document.getElementById('lote-unit-' + idx);
  if (unitEl && qtd > 0) unitEl.value = (val / qtd).toFixed(2);
  loteVerificarAlerta(idx);
  loteAtualizarGrandTotal();
};

function loteVerificarAlerta(idx) {
  const prodId = document.getElementById('lote-id-'   + idx)?.value;
  const custo  = loteParseNum(document.getElementById('lote-unit-' + idx)?.value);
  const alertEl = document.getElementById('lote-alert-' + idx);
  if (!alertEl) return;
  if (!prodId || !custo) { alertEl.style.display = 'none'; return; }
  const p = state.PRODS.find(x => x.id === prodId);
  if (!p) { alertEl.style.display = 'none'; return; }
  const ref = p.custoMedio || p.custo || 0;
  if (ref > 0 && Math.abs(custo - ref) / ref > 0.30) {
    alertEl.style.display = '';
    alertEl.textContent = '⚠️';
    alertEl.title = `Custo ${custo > ref ? 'acima' : 'abaixo'} ${Math.round(Math.abs(custo - ref) / ref * 100)}% do histórico (${fmt(ref)})`;
  } else {
    alertEl.style.display = 'none';
  }
}

function loteAtualizarGrandTotal() {
  let total = 0, totalUnid = 0, count = 0;
  document.querySelectorAll('#lote-rows-wrap > div').forEach(row => {
    const i = row.dataset.idx;
    const hasProd = document.getElementById('lote-id-' + i)?.value;
    const val = loteParseNum(document.getElementById('lote-val-'  + i)?.value);
    const qtd = loteParseNum(document.getElementById('lote-qtd-'  + i)?.value);
    total += val;
    if (hasProd) { count++; totalUnid += qtd; }
  });
  const el = qs('lote-grand-total');
  if (el) el.textContent = fmt(total);
  const counterEl = qs('lote-counter');
  if (counterEl) counterEl.textContent = count ? `${count} produto(s) · ${totalUnid} unid.` : '';
}

window.loteNumKey = function (e) {
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

// Atalho F2: abre modal de Entrada em Lote
document.addEventListener('keydown', function (e) {
  if (e.key === 'F2' && !e.ctrlKey && !e.altKey) {
    const page = document.getElementById('page-estoque');
    if (!page || !page.classList.contains('active')) return;
    e.preventDefault();
    window.abrirModalLote();
  }
});

window.loteKeyProd = function (idx, e) {
  const drop = document.getElementById('lote-drop-' + idx);
  const items = drop ? Array.from(drop.querySelectorAll('.lote-drop-item')) : [];
  const isOpen = drop && drop.style.display !== 'none' && items.length;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (isOpen) {
      _loteDropIdx[idx] = ((_loteDropIdx[idx] ?? -1) + 1) % items.length;
      loteDropUpdateHighlight(idx);
    }
    return;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (isOpen) {
      _loteDropIdx[idx] = ((_loteDropIdx[idx] ?? 0) - 1 + items.length) % items.length;
      loteDropUpdateHighlight(idx);
    }
    return;
  }
  if (e.key === 'Enter' || e.key === 'Tab') {
    if (isOpen) {
      const i = (_loteDropIdx[idx] ?? -1);
      const item = items[i >= 0 ? i : 0];
      if (item) {
        item.dispatchEvent(new MouseEvent('mousedown'));
        e.preventDefault();
        // pré-selecionar qtd pois veio do teclado
        setTimeout(() => {
          const qtdEl = document.getElementById('lote-qtd-' + idx);
          if (qtdEl) { qtdEl.focus(); qtdEl.select(); }
        }, 30);
        return;
      }
    }
    e.preventDefault();
    const qtdEl = document.getElementById('lote-qtd-' + idx);
    if (qtdEl) { qtdEl.focus(); qtdEl.select(); }
  }
};

window.loteKeyField = function (idx, field, e) {
  if (e.key === 'Tab' && e.shiftKey) return;
  if (e.key === 'Enter' || e.key === 'Tab') {
    const order = ['qtd', 'unit', 'val'];
    const pos = order.indexOf(field);
    if (pos < order.length - 1) {
      e.preventDefault();
      const nextEl = document.getElementById('lote-' + order[pos + 1] + '-' + idx);
      if (nextEl) { nextEl.focus(); nextEl.select(); }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      loteAddLinha();
    }
  }
};

window.revisarLote = function () {
  const rows = Array.from(document.querySelectorAll('#lote-rows-wrap > div'));
  if (!rows.length) { toast('Adicione ao menos um produto', true); return; }
  const itens = [];
  for (const row of rows) {
    const idx     = row.dataset.idx;
    const prodId  = document.getElementById('lote-id-'     + idx)?.value;
    const prodNome= document.getElementById('lote-search-' + idx)?.value;
    const qtd     = loteParseNum(document.getElementById('lote-qtd-'  + idx)?.value);
    const custo   = loteParseNum(document.getElementById('lote-unit-' + idx)?.value);
    if (!prodId)   { toast(`Linha ${itens.length + 1}: selecione um produto`, true); return; }
    if (qtd <= 0)  { toast(`"${prodNome}": informe a quantidade`, true); return; }
    if (custo <= 0){ toast(`"${prodNome}": informe o custo unitário`, true); return; }
    itens.push({ prodId, prodNome, qtd, custo, valor: qtd * custo });
  }
  const fornecedor = qs('lote-fornecedor').value.trim();
  const total = itens.reduce((a, it) => a + it.valor, 0);
  qs('lote-form-section').style.display = 'none';
  const rev = qs('lote-review-section');
  rev.style.display = '';
  rev.innerHTML = `
    <div style="font-size:16px;font-weight:600;margin-bottom:14px">Revisão da entrada em lote</div>
    ${fornecedor ? `<div style="margin-bottom:12px;font-size:14px"><strong>Fornecedor:</strong> ${fornecedor}</div>` : ''}
    <div style="max-height:300px;overflow-y:auto;margin-bottom:14px">
      <table style="width:100%">
        <thead><tr><th>Produto</th><th>Qtd</th><th>Custo unit.</th><th>Total</th></tr></thead>
        <tbody>${itens.map(it => `<tr>
          <td>${it.prodNome}</td>
          <td style="font-family:var(--mono)">${it.qtd}</td>
          <td style="font-family:var(--mono)">${fmt(it.custo)}</td>
          <td style="font-family:var(--mono);font-weight:500">${fmt(it.valor)}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
    <div style="text-align:right;font-size:18px;font-weight:700;padding:12px 0;border-top:1px solid var(--border);margin-bottom:16px">
      Total: <span style="color:var(--blue)">${fmt(total)}</span>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn" onclick="voltarFormLote()">← Voltar</button>
      <button class="btn btn-dark" id="btn-salvar-lote" onclick="salvarLote()">Confirmar e registrar</button>
    </div>`;
};

window.voltarFormLote = function () {
  qs('lote-form-section').style.display = '';
  qs('lote-review-section').style.display = 'none';
};

window.salvarLote = async function () {
  const rows = Array.from(document.querySelectorAll('#lote-rows-wrap > div'));
  const itens = rows.map(row => {
    const idx = row.dataset.idx;
    return {
      prodId:   document.getElementById('lote-id-'     + idx)?.value,
      prodNome: document.getElementById('lote-search-' + idx)?.value,
      qtd:      loteParseNum(document.getElementById('lote-qtd-'  + idx)?.value),
      custo:    loteParseNum(document.getElementById('lote-unit-' + idx)?.value),
      valor:    loteParseNum(document.getElementById('lote-val-'  + idx)?.value),
    };
  }).filter(it => it.prodId && it.qtd > 0 && it.custo > 0);

  const fornecedor = qs('lote-fornecedor').value.trim();
  const total = itens.reduce((a, it) => a + it.valor, 0);

  const btn = document.getElementById('btn-salvar-lote');
  if (btn) { btn.disabled = true; btn.textContent = 'Registrando…'; }

  try {
    const lan = {
      data: hoje(), tipo: 'des',
      desc: 'Entrada em lote' + (fornecedor ? ` — ${fornecedor}` : ''),
      cat: 'Fornecedor', fornecedor: fornecedor || '',
      valor: total, pag: '', obs: '', isLote: true, itens: []
    };
    const lanRef = await addDoc(collection(state.db, 'lancamentos'), lan);
    const lanId  = lanRef.id;
    const itensSalvos = [];

    for (const item of itens) {
      const p = state.PRODS.find(x => x.id === item.prodId);
      if (!p) continue;
      const custoAtual = p.custoMedio || p.custo || 0;
      const novoEstoque = p.estoque + item.qtd;
      const novoCM = novoEstoque > 0
        ? ((p.estoque * custoAtual) + (item.qtd * item.custo)) / novoEstoque
        : item.custo;
      p.estoque  = novoEstoque;
      p.custo    = item.custo;
      p.custoMedio = parseFloat(novoCM.toFixed(4));
      await updateDoc(doc(state.db, 'produtos', item.prodId), {
        estoque: p.estoque, custo: p.custo, custoMedio: p.custoMedio
      });
      const mov = {
        data: hoje(), produtoId: item.prodId, produtoNome: item.prodNome,
        tipo: 'entrada', qtd: item.qtd, custo: item.custo,
        lancamentoId: lanId,
        obs: `Entrada em lote${fornecedor ? ' · ' + fornecedor : ''}`
      };
      const movRef = await addDoc(collection(state.db, 'movimentacoes'), mov);
      state.MOVS.push({ id: movRef.id, ...mov });
      await addDoc(collection(state.db, 'hist_custo'), {
        data: hoje(), produtoId: item.prodId, produtoNome: item.prodNome,
        custo: item.custo, qtd: item.qtd, custoMedio: p.custoMedio
      });
      itensSalvos.push({
        prodId: item.prodId, produtoNome: item.prodNome,
        qtd: item.qtd, custo: item.custo, valor: item.valor, movId: movRef.id
      });
    }

    await updateDoc(doc(state.db, 'lancamentos', lanId), { itens: itensSalvos });
    state.LANCS.push({ id: lanId, ...lan, itens: itensSalvos });
    if (fornecedor) loteSalvarFornecedor(fornecedor);

    qs('modal-lote').classList.remove('open');
    renderEstoque(); renderMov(); atualizarMetricasEstoque(); renderProdutos();
    renderLancamentos(); atualizarMetricasFinanceiro();
    const { atualizarAlertaEstoque } = await import('./pdv.js');
    atualizarAlertaEstoque();
    toast(`Lote registrado: ${itensSalvos.length} produto(s) · ${fmt(total)}`);
  } catch (e) {
    toast('Erro ao salvar: ' + e.message, true);
    if (btn) { btn.disabled = false; btn.textContent = 'Confirmar e registrar'; }
  }
};
