import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore, collection, addDoc, getDocs,
  doc, updateDoc, deleteDoc, setDoc, getDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

import { state } from './state.js';
import { qs } from './utils.js';

// Re-exporta para uso nos outros módulos
export {
  collection, addDoc, getDocs,
  doc, updateDoc, deleteDoc, setDoc, getDoc
};

export function initFirebase(config) {
  state.db = getFirestore(initializeApp(config));
}

export function setConn(ok) {
  const dot = qs('conn-dot');
  const txt = qs('conn-text');
  if (dot) dot.style.background = ok ? 'var(--green)' : 'var(--red)';
  if (txt) txt.textContent = ok ? 'Firebase conectado' : 'Sem conexão';
}

export function atualizarData() {
  const d = new Date();
  const el = qs('topbar-date');
  if (el) el.textContent =
    d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export async function loadAll() {
  const [p, v, l, f, m, cb, cfg] = await Promise.all([
    getDocs(collection(state.db, 'produtos')),
    getDocs(collection(state.db, 'vendas')),
    getDocs(collection(state.db, 'lancamentos')),
    getDocs(collection(state.db, 'fiados')),
    getDocs(collection(state.db, 'movimentacoes')),
    getDocs(collection(state.db, 'combos')),
    getDoc(doc(state.db, 'config', 'loja'))
  ]);
  return {
    prods:  p.docs.map(d => ({ id: d.id, ...d.data() })),
    vendas: v.docs.map(d => ({ id: d.id, ...d.data() })),
    lancs:  l.docs.map(d => ({ id: d.id, ...d.data() })),
    fiados: f.docs.map(d => ({ id: d.id, ...d.data() })),
    movs:   m.docs.map(d => ({ id: d.id, ...d.data() })),
    combos: cb.docs.map(d => ({ id: d.id, ...d.data() })),
    cfg:    cfg.exists() ? cfg.data() : {}
  };
}
