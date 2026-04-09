import { state } from './state.js';
import { qs, toast, hoje } from './utils.js';
import { doc, setDoc } from './firebase.js';

window.salvarConfig = async function () {
  const nome      = qs('cfg-nome').value.trim();
  const endereco  = qs('cfg-end').value.trim();
  const telefone  = qs('cfg-tel').value.trim();
  try {
    await setDoc(doc(state.db, 'config', 'loja'), { nome, endereco, telefone });
    state.CFG = { nome, endereco, telefone };
    if (qs('loja-nome-side')) qs('loja-nome-side').textContent = nome || 'Minha Loja';
    toast('Salvo!');
  } catch (e) { toast('Erro: ' + e.message, true); }
};

window.resetFirebase = function () {
  if (confirm('Desconectar do Firebase?')) {
    localStorage.removeItem('fb_cfg');
    location.reload();
  }
};

window.exportBackup = function () {
  const data = {
    produtos:      state.PRODS,
    vendas:        state.VENDAS,
    lancamentos:   state.LANCS,
    fiados:        state.FIADOS,
    movimentacoes: state.MOVS,
    config:        state.CFG,
    exportadoEm:   new Date().toISOString()
  };
  const b = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = 'backup_' + hoje() + '.json'; a.click();
};
