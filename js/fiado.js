import { state } from './state.js';
import { fmt, fmtDate, qs, toast, hoje } from './utils.js';
import { collection, addDoc, doc, deleteDoc } from './firebase.js';

export function atualizarMetricasFiado() {
  if (!qs('fi-clientes')) return;
  const saldos = {};
  state.FIADOS.forEach(f => {
    if (!saldos[f.cliente]) saldos[f.cliente] = 0;
    saldos[f.cliente] += f.tipo === 'deb' ? f.valor : -f.valor;
  });
  const clientes = Object.keys(saldos);
  const total = Object.values(saldos).filter(v => v > 0).reduce((a, v) => a + v, 0);
  const hoje_ = hoje();
  const recHoje = state.FIADOS.filter(f => f.data === hoje_ && f.tipo === 'pag').reduce((a, f) => a + f.valor, 0);
  qs('fi-clientes').textContent = clientes.length;
  qs('fi-total').textContent    = fmt(total);
  qs('fi-hoje').textContent     = fmt(recHoje);
  qs('fi-ativos').textContent   = Object.values(saldos).filter(v => v > 0).length;
}

export function getSaldosFiado() {
  const saldos = {}, ultMov = {};
  state.FIADOS.forEach(f => {
    if (!saldos[f.cliente]) saldos[f.cliente] = 0;
    saldos[f.cliente] += f.tipo === 'deb' ? f.valor : -f.valor;
    if (!ultMov[f.cliente] || f.data > ultMov[f.cliente]) ultMov[f.cliente] = f.data;
  });
  return { saldos, ultMov };
}

export function renderFiado() {
  const busca = (qs('fi-busca') || { value: '' }).value.toLowerCase();
  const { saldos, ultMov } = getSaldosFiado();
  const tb = qs('tb-fiado');
  if (!tb) return;
  let lista = Object.entries(saldos).filter(([, v]) => v > 0);
  if (busca) lista = lista.filter(([n]) => n.toLowerCase().includes(busca));
  lista.sort((a, b) => b[1] - a[1]);
  if (!lista.length) { tb.innerHTML = '<tr><td colspan="4" class="empty">Nenhum fiado em aberto</td></tr>'; return; }
  tb.innerHTML = lista.map(([nome, saldo]) => `<tr>
    <td><strong>${nome}</strong></td>
    <td style="font-family:var(--mono);color:var(--red);font-weight:500">${fmt(saldo)}</td>
    <td style="font-size:13px;color:var(--text3)">${ultMov[nome] ? fmtDate(ultMov[nome]) : '—'}</td>
    <td><button class="btn btn-sm" onclick="verFiado('${nome}')">Ver histórico</button></td>
  </tr>`).join('');
  const datalist = qs('fi-lista-nomes');
  if (datalist) datalist.innerHTML = Object.keys(saldos).map(n => `<option value="${n}">`).join('');
}
window.renderFiado = renderFiado;

export function renderFiadoHist() {
  const tb = qs('tb-fiado-hist');
  if (!tb) return;
  const lista = [...state.FIADOS].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 60);
  if (!lista.length) { tb.innerHTML = '<tr><td colspan="6" class="empty">Nenhum lançamento</td></tr>'; return; }
  tb.innerHTML = lista.map(f => `<tr>
    <td style="font-family:var(--mono);font-size:13px">${fmtDate(f.data)}</td>
    <td>${f.cliente}</td>
    <td><span class="badge ${f.tipo === 'deb' ? 'badge-des' : 'badge-rec'}">${f.tipo === 'deb' ? 'Débito' : 'Pagamento'}</span></td>
    <td style="font-family:var(--mono);color:${f.tipo === 'deb' ? 'var(--red)' : 'var(--green)'};font-weight:500">${f.tipo === 'deb' ? '' : '+'} ${fmt(f.valor)}</td>
    <td style="font-size:13px;color:var(--text3)">${f.obs || ''}</td>
    <td><button class="btn btn-sm btn-red" onclick="delFiado('${f.id}')">×</button></td>
  </tr>`).join('');
}

window.verFiado = function (nome) {
  state.fiadoClienteAtual = nome;
  const hist = state.FIADOS.filter(f => f.cliente === nome).sort((a, b) => b.data.localeCompare(a.data));
  const { saldos } = getSaldosFiado();
  qs('mhf-title').textContent = 'Fiado — ' + nome;
  qs('mhf-content').innerHTML = `
    <div style="font-size:15px;font-weight:500;margin-bottom:15px;font-family:var(--mono);color:${(saldos[nome] || 0) > 0 ? 'var(--red)' : 'var(--green)'}">Saldo: ${fmt(saldos[nome] || 0)}</div>
    <table style="font-size:13px"><thead><tr><th>Data</th><th>Tipo</th><th>Valor</th><th>Obs.</th></tr></thead><tbody>
    ${hist.map(f => `<tr><td>${fmtDate(f.data)}</td><td><span class="badge ${f.tipo === 'deb' ? 'badge-des' : 'badge-rec'}">${f.tipo === 'deb' ? 'Débito' : 'Pago'}</span></td><td style="font-family:var(--mono)">${fmt(f.valor)}</td><td style="color:var(--text3)">${f.obs || ''}</td></tr>`).join('')}
    </tbody></table>`;
  qs('modal-hist-fiado').classList.add('open');
};

window.pagarFiado = async function () {
  if (!state.fiadoClienteAtual) return;
  const { saldos } = getSaldosFiado();
  const saldo = saldos[state.fiadoClienteAtual] || 0;
  if (saldo <= 0) { toast('Sem saldo em aberto', true); return; }
  const v = parseFloat(prompt(`Valor recebido de ${state.fiadoClienteAtual} (saldo: ${fmt(saldo)}):`) || '0');
  if (!v || v <= 0) return;
  try {
    const f = { data: hoje(), cliente: state.fiadoClienteAtual, tipo: 'pag', valor: v, obs: 'Pagamento recebido' };
    const ref = await addDoc(collection(state.db, 'fiados'), f);
    state.FIADOS.push({ id: ref.id, ...f });
    const lan = { data: hoje(), tipo: 'rec', desc: 'Pagamento fiado: ' + state.fiadoClienteAtual, cat: 'Fiado', valor: v, pag: 'Dinheiro', obs: '' };
    const lRef = await addDoc(collection(state.db, 'lancamentos'), lan);
    state.LANCS.push({ id: lRef.id, ...lan });
    toast(`Pagamento de ${fmt(v)} registrado!`);
    window.fecharModal('modal-hist-fiado');
    renderFiado(); renderFiadoHist(); atualizarMetricasFiado();
  } catch (e) { toast('Erro: ' + e.message, true); }
};

window.addFiado = async function () {
  const nome = qs('fi-nome').value.trim();
  const val  = parseFloat(qs('fi-val').value) || 0;
  const tipo = qs('fi-tipo').value;
  const obs  = qs('fi-obs').value;
  if (!nome)  { toast('Informe o nome', true); return; }
  if (val <= 0) { toast('Informe o valor', true); return; }
  try {
    const f = { data: hoje(), cliente: nome, tipo, valor: val, obs };
    const ref = await addDoc(collection(state.db, 'fiados'), f);
    state.FIADOS.push({ id: ref.id, ...f });
    if (tipo === 'pag') {
      const lan = { data: hoje(), tipo: 'rec', desc: 'Pagamento fiado: ' + nome, cat: 'Fiado', valor: val, pag: 'Dinheiro', obs };
      const lRef = await addDoc(collection(state.db, 'lancamentos'), lan);
      state.LANCS.push({ id: lRef.id, ...lan });
    }
    toast('Lançamento registrado!');
    qs('fi-nome').value = ''; qs('fi-val').value = ''; qs('fi-obs').value = '';
    renderFiado(); renderFiadoHist(); atualizarMetricasFiado();
  } catch (e) { toast('Erro: ' + e.message, true); }
};

window.delFiado = async function (id) {
  if (!confirm('Excluir lançamento?')) return;
  await deleteDoc(doc(state.db, 'fiados', id));
  state.FIADOS = state.FIADOS.filter(f => f.id !== id);
  renderFiado(); renderFiadoHist(); atualizarMetricasFiado(); toast('Excluído');
};
