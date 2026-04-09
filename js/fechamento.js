import { state } from './state.js';
import { fmt, fmtDate, qs, toast, hoje, getId } from './utils.js';

export function carregarCaixa() {
  const raw  = localStorage.getItem('caixa_aberto');
  const rawS = localStorage.getItem('sangrias_dia');
  state.CAIXA_ABERTO = raw  ? JSON.parse(raw)  : null;
  state.SANGRIAS     = rawS ? JSON.parse(rawS) : [];
  atualizarStatusCaixa();
  renderSangrias();
}

function atualizarStatusCaixa() {
  const el = qs('caixa-status-bar');
  if (!el) return;
  if (state.CAIXA_ABERTO) {
    el.innerHTML = `<div class="caixa-aberto">● Caixa aberto — ${fmtDate(state.CAIXA_ABERTO.data)} — Fundo: <strong style="font-family:var(--mono)">${fmt(state.CAIXA_ABERTO.fundo)}</strong> — Aberto às ${state.CAIXA_ABERTO.hora}</div>`;
    const form = qs('abertura-form'); const info = qs('abertura-info');
    if (form) form.style.display = 'none';
    if (info) info.style.display = 'block';
    if (qs('ab-info-data'))  qs('ab-info-data').textContent  = fmtDate(state.CAIXA_ABERTO.data);
    if (qs('ab-info-fundo')) qs('ab-info-fundo').textContent = fmt(state.CAIXA_ABERTO.fundo);
    if (qs('ab-info-hora'))  qs('ab-info-hora').textContent  = state.CAIXA_ABERTO.hora;
    if (qs('ab-info-obs'))   qs('ab-info-obs').textContent   = state.CAIXA_ABERTO.obs || '—';
  } else {
    el.innerHTML = `<div class="caixa-fechado">○ Caixa fechado — abra o caixa para iniciar o dia</div>`;
    const form = qs('abertura-form'); const info = qs('abertura-info');
    if (form) form.style.display = 'block';
    if (info) info.style.display = 'none';
    if (qs('ab-data')) qs('ab-data').value = hoje();
  }
}

window.abrirCaixa = function () {
  const fundo = parseFloat(qs('ab-fundo').value) || 0;
  const data  = qs('ab-data').value || hoje();
  const obs   = qs('ab-obs').value;
  const hora  = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  state.CAIXA_ABERTO = { fundo, data, hora, obs };
  state.SANGRIAS = [];
  localStorage.setItem('caixa_aberto',   JSON.stringify(state.CAIXA_ABERTO));
  localStorage.setItem('sangrias_dia',   JSON.stringify(state.SANGRIAS));
  toast('Caixa aberto!');
  atualizarStatusCaixa(); renderSangrias();
};

window.cancelarAbertura = function () {
  if (!confirm('Cancelar abertura do caixa? Os dados serão perdidos.')) return;
  state.CAIXA_ABERTO = null; state.SANGRIAS = [];
  localStorage.removeItem('caixa_aberto'); localStorage.removeItem('sangrias_dia');
  atualizarStatusCaixa(); renderSangrias(); toast('Caixa cancelado');
};

window.addSangria = function () {
  const val = parseFloat(qs('san-val').value) || 0;
  const mot = qs('san-mot').value.trim();
  if (val <= 0) { toast('Informe o valor', true); return; }
  if (!mot)     { toast('Informe o motivo', true); return; }
  if (!state.CAIXA_ABERTO) { toast('Abra o caixa primeiro', true); return; }
  const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  state.SANGRIAS.push({ id: getId(), val, mot, hora });
  localStorage.setItem('sangrias_dia', JSON.stringify(state.SANGRIAS));
  qs('san-val').value = ''; qs('san-mot').value = '';
  renderSangrias(); toast('Sangria registrada!');
};

window.delSangria = function (id) {
  state.SANGRIAS = state.SANGRIAS.filter(s => s.id !== id);
  localStorage.setItem('sangrias_dia', JSON.stringify(state.SANGRIAS));
  renderSangrias();
};

function renderSangrias() {
  const el = qs('lista-sangrias');
  if (!el) return;
  const totalS = state.SANGRIAS.reduce((a, s) => a + s.val, 0);
  if (qs('total-sangrias')) qs('total-sangrias').textContent = fmt(totalS);
  if (!state.SANGRIAS.length) { el.innerHTML = '<div class="empty">Nenhuma sangria hoje</div>'; return; }
  el.innerHTML = state.SANGRIAS.map(s => `
    <div class="sangria-item">
      <span style="color:var(--text2)">${s.hora} — ${s.mot}</span>
      <span style="display:flex;align-items:center;gap:10px">
        <span style="font-family:var(--mono);color:var(--red)">− ${fmt(s.val)}</span>
        <button class="btn btn-sm btn-red" onclick="delSangria('${s.id}')">×</button>
      </span>
    </div>`).join('');
}

window.calcDiferenca = function () {};

window.gerarFechamento = function () {
  if (!state.CAIXA_ABERTO) { toast('Abra o caixa primeiro', true); return; }
  const data = state.CAIXA_ABERTO.data;
  const dinhContado = parseFloat(qs('fech-dinheiro-contado').value) || 0;
  const vDia  = state.VENDAS.filter(v => v.data.startsWith(data) && v.formaPag !== 'fiado');
  const total = vDia.reduce((a, v) => a + v.total, 0);
  const custo = vDia.reduce((a, v) => a + (v.custoTotal || 0), 0);
  const lucro = total - custo;
  const desc  = vDia.reduce((a, v) => a + (v.desconto || 0), 0);
  const ticket = vDia.length ? total / vDia.length : 0;
  const porPag = {};
  vDia.forEach(v => { porPag[v.formaPag] = (porPag[v.formaPag] || 0) + v.total; });
  const totalSangrias  = state.SANGRIAS.reduce((a, s) => a + s.val, 0);
  const vendaDinheiro  = porPag['dinheiro'] || porPag['Dinheiro'] || 0;
  const despDia = state.LANCS.filter(l => l.data === data && l.tipo === 'des' && l.cat !== 'Fornecedor').reduce((a, l) => a + l.valor, 0);
  const dinheiroEsperado = state.CAIXA_ABERTO.fundo + vendaDinheiro - totalSangrias;
  const diferenca = dinhContado - dinheiroEsperado;
  const horaFech  = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const lojaNome  = qs('loja-nome-side').textContent;

  const html = `<div class="fech-box" id="fech-print">
    <div class="fech-title">${lojaNome}</div>
    <div class="fech-sub">Fechamento — ${fmtDate(data)} — Fechado às ${horaFech}</div>

    <div class="fech-section">Abertura</div>
    <div class="fech-line"><span class="fl-label">Fundo inicial</span><span class="fl-val">${fmt(state.CAIXA_ABERTO.fundo)}</span></div>
    <div class="fech-line"><span class="fl-label">Aberto às</span><span class="fl-val">${state.CAIXA_ABERTO.hora}</span></div>

    <div class="fech-section">Vendas do dia</div>
    <div class="fech-line"><span class="fl-label">Número de vendas</span><span class="fl-val">${vDia.length}</span></div>
    <div class="fech-line"><span class="fl-label">Faturamento bruto</span><span class="fl-val" style="color:var(--green)">${fmt(total)}</span></div>
    <div class="fech-line"><span class="fl-label">Descontos</span><span class="fl-val" style="color:var(--red)">− ${fmt(desc)}</span></div>
    <div class="fech-line"><span class="fl-label">Ticket médio</span><span class="fl-val">${fmt(ticket)}</span></div>

    <div class="fech-section">Por forma de pagamento</div>
    ${Object.entries(porPag).map(([p, v]) => `<div class="fech-line"><span class="fl-label">${p}</span><span class="fl-val">${fmt(v)}</span></div>`).join('')}

    <div class="fech-section">Sangrias</div>
    ${state.SANGRIAS.length
      ? state.SANGRIAS.map(s => `<div class="fech-line"><span class="fl-label">${s.hora} — ${s.mot}</span><span class="fl-val" style="color:var(--red)">− ${fmt(s.val)}</span></div>`).join('')
      : '<div class="fech-line"><span class="fl-label" style="color:var(--text3)">Nenhuma sangria</span><span class="fl-val">—</span></div>'}
    <div class="fech-line"><span class="fl-label"><strong>Total sangrias</strong></span><span class="fl-val" style="color:var(--red)">− ${fmt(totalSangrias)}</span></div>

    <div class="fech-section">Conferência de caixa (dinheiro)</div>
    <div class="fech-line"><span class="fl-label">Fundo inicial</span><span class="fl-val">${fmt(state.CAIXA_ABERTO.fundo)}</span></div>
    <div class="fech-line"><span class="fl-label">+ Vendas em dinheiro</span><span class="fl-val">${fmt(vendaDinheiro)}</span></div>
    <div class="fech-line"><span class="fl-label">− Sangrias</span><span class="fl-val">− ${fmt(totalSangrias)}</span></div>
    <div class="fech-line"><span class="fl-label">= Esperado em caixa</span><span class="fl-val">${fmt(dinheiroEsperado)}</span></div>
    <div class="fech-line"><span class="fl-label">Contado em caixa</span><span class="fl-val">${fmt(dinhContado)}</span></div>
    <div class="fech-line"><span class="fl-label"><strong>Diferença</strong></span><span class="fl-val ${diferenca >= 0 ? 'dif-ok' : 'dif-neg'}">${diferenca >= 0 ? '+' : ''}${fmt(diferenca)}</span></div>

    <div class="fech-section">Resultado</div>
    <div class="fech-line"><span class="fl-label">Custo das mercadorias</span><span class="fl-val" style="color:var(--red)">− ${fmt(custo)}</span></div>
    <div class="fech-line"><span class="fl-label">Lucro bruto</span><span class="fl-val" style="color:var(--green)">${fmt(lucro)}</span></div>
    <div class="fech-line"><span class="fl-label">Despesas avulsas do dia</span><span class="fl-val" style="color:var(--red)">− ${fmt(despDia)}</span></div>
    <div class="fech-total">
      <span>Resultado líquido do dia</span>
      <span style="color:${(lucro - despDia) >= 0 ? 'var(--green)' : 'var(--red)'}">${fmt(lucro - despDia)}</span>
    </div>
  </div>`;
  qs('fech-resultado').innerHTML = html;
};

window.imprimirFechamento = function () {
  const el = qs('fech-print');
  if (!el) { toast('Gere o fechamento primeiro', true); return; }
  const w = window.open('', '_blank');
  const css = `body{font-family:sans-serif;padding:30px;max-width:420px;font-size:13px}
    .fech-title{font-size:18px;font-weight:600;margin-bottom:2px}
    .fech-sub{font-size:12px;color:#888;margin-bottom:14px}
    .fech-section{font-size:11px;font-weight:700;text-transform:uppercase;color:#888;margin:14px 0 4px;letter-spacing:.06em}
    .fech-line{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #eee}
    .fech-total{display:flex;justify-content:space-between;font-size:16px;font-weight:700;padding:10px 0;border-top:2px solid #333;margin-top:6px}
    .fl-val{font-family:monospace;font-weight:500}
    .dif-ok{color:green}.dif-neg{color:red}`;
  w.document.write(`<html><head><title>Fechamento</title><style>${css}</style></head><body>`);
  w.document.write(el.innerHTML);
  w.document.write('</body></html>');
  w.document.close(); setTimeout(() => w.print(), 400);
};
