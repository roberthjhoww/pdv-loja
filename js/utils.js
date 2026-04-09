// Funções utilitárias compartilhadas

export const fmt = n =>
  'R$ ' + parseFloat(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtDate = s => new Date(s + 'T12:00:00').toLocaleDateString('pt-BR');

export const hoje = () => new Date().toISOString().split('T')[0];

export const mesAtual = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
};

export const getId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export const pct = (a, b) => b ? Math.round(a / b * 100) : 0;

export const qs = id => document.getElementById(id);

export function toast(msg, err = false) {
  const t = qs('toast');
  t.textContent = msg;
  t.className = 'toast ' + (err ? 'toast-err' : 'toast-ok');
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}
