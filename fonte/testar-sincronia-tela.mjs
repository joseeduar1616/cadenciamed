/* Dois aparelhos abertos na mesma conta, com um Firestore de mentira no
 * meio. É o teste que faltava: o que muda num aparelho tem de aparecer no
 * outro sozinho, e nenhum dos dois pode apagar o que o outro fez.
 *
 * O que se confere:
 *   1. Anotar algo no computador aparece no celular, sem recarregar.
 *   2. Mexer e fechar o app na hora (antes do envio automático) manda a
 *      mudança mesmo assim (envio ao esconder a página).
 *   3. Mexer sem rede, fechar, o outro aparelho mexe também, e ao reabrir
 *      os dois trabalhos ficam: junta, não substitui.
 *   4. Os dois mexendo quase ao mesmo tempo: nada se perde.
 *
 *   node testar-sincronia-tela.mjs teste.html
 */
import { chromium } from 'playwright';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { servirSolto } from './servir-teste.mjs';

const alvo = path.resolve(process.argv[2] || 'teste.html');
if (!fs.existsSync(alvo)) { console.error('não achei', alvo); process.exit(1); }
const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

const FB_APP = 'export function initializeApp(c) { return { c }; }';
const FB_AUTH = `
const user = { uid: 'uid-sinc', email: 'aluna@email.com', displayName: 'Teste', getIdToken: async () => 'token-teste' };
export function getAuth() { return { currentUser: user }; }
export function onAuthStateChanged(a, cb) { setTimeout(() => cb(user), 30); return () => {}; }
export async function setPersistence() {}
export const browserLocalPersistence = {}; export const browserSessionPersistence = {};
export async function signOut() {} export async function updateProfile() {}
export async function signInWithEmailAndPassword() { return { user }; }
export async function createUserWithEmailAndPassword() { return { user }; }
export async function sendPasswordResetEmail() {}
export class GoogleAuthProvider { addScope() {} setCustomParameters() {} }
export async function signInWithPopup() { return { user }; }
export async function signInWithRedirect() {} export async function getRedirectResult() { return null; }`;
/* O documento usuarios/{uid} mora no Node (window.__fsSet / __fsGet), e o
   Node entrega cada gravação a todos os aparelhos abertos, como o
   onSnapshot de verdade. Sem rede (window.__offline), a gravação fica
   pendurada, como no Firestore sem conexão. */
const FB_STORE = `
export function getFirestore() { return {}; }
export function doc(db, ...p) { return { path: p.join('/') }; }
export async function setDoc(ref, dados) {
  if (!String(ref.path).startsWith('usuarios/')) return;
  if (window.__offline) return new Promise(() => {});
  await window.__fsSet(JSON.stringify(dados));
}
export async function getDoc() { return { exists: () => false, data: () => ({}) }; }
/* Transação de verdade: lê, a função decide, e a gravação só vale se a
   conta não mudou desde a leitura (senão roda de novo), como no Firestore. */
export async function runTransaction(db, fn) {
  if (window.__offline) { const e = new Error('offline'); e.code = 'unavailable'; throw e; }
  for (let i = 0; i < 6; i += 1) {
    const lido = await window.__fsGet();
    let escrito = null;
    const t = {
      get: async () => ({ exists: () => !!lido, data: () => (lido ? JSON.parse(lido) : {}) }),
      set: (ref, d) => { escrito = d; },
    };
    const r = await fn(t);
    if (await window.__fsCommit(lido, JSON.stringify(escrito))) return r;
  }
  throw new Error('aborted');
}
export function onSnapshot(ref, a, b) {
  const cb = typeof a === 'function' ? a : b;
  if (!String(ref.path).startsWith('usuarios/')) {
    setTimeout(() => cb({ exists: () => false, metadata: { fromCache: false }, data: () => ({}) }), 40);
    return () => {};
  }
  const entregar = (d) => cb({ exists: () => !!d, metadata: { fromCache: false }, data: () => d || {} });
  window.__fsEntrega = (d) => { if (!window.__offline) entregar(d); };
  window.__fsGet().then((s) => entregar(s ? JSON.parse(s) : null));
  return () => { window.__fsEntrega = null; };
}`;

const servidor = http.createServer((req, res) => { if (servirSolto(req, res)) return;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(fs.readFileSync(alvo));
});
await new Promise((ok2) => servidor.listen(0, '127.0.0.1', ok2));
const ENDERECO = `http://127.0.0.1:${servidor.address().port}/`;
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const navegador = await chromium.launch({ args: ['--no-sandbox'], ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}) });
const errosDaPagina = [];
const RECURSOS = { assistente: true, cartoes: true, revisoes: true, provas: true, cronograma: true, rotina: true, amigos: true, metas: true, desempenho: true, simulados: true, progresso: true };

/* A conta de mentira. */
let conta = null;
const abertas = new Set();
async function entregarATodos() {
  for (const p of [...abertas]) {
    try { await p.evaluate((d) => window.__fsEntrega && window.__fsEntrega(d), conta); } catch (e) { /* página fechada */ }
  }
}

async function aparelho(nome, largura) {
  const ctx = await navegador.newContext({ viewport: { width: largura, height: largura < 600 ? 844 : 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('cm-sem-pergunta-faculdade', '1');
      localStorage.setItem('cadencia:v3:convite-notificacoes-aparelho', 'teste');
      if (!localStorage.getItem('cadencia:v3')) localStorage.setItem('cadencia:v3', JSON.stringify({ profile: { name: 'Teste', onboarded: true }, theme: 'dark', tema: { visual: 'limpo' } }));
    } catch (e) { /* noop */ }
  });
  await ctx.exposeBinding('__fsSet', async (fonte, texto) => { conta = JSON.parse(texto); setTimeout(entregarATodos, 20); });
  await ctx.exposeBinding('__fsGet', async () => (conta ? JSON.stringify(conta) : null));
  await ctx.exposeBinding('__fsCommit', async (fonte, esperado, texto) => {
    if ((conta ? JSON.stringify(conta) : null) !== esperado) return false;   // mudou desde a leitura
    conta = JSON.parse(texto);
    setTimeout(entregarATodos, 20);
    return true;
  });
  await ctx.route('https://www.gstatic.com/firebasejs/**', (rr) => {
    const u = rr.request().url();
    rr.fulfill({ status: 200, contentType: 'text/javascript', body: u.endsWith('firebase-app.js') ? FB_APP : u.endsWith('firebase-auth.js') ? FB_AUTH : FB_STORE });
  });
  await ctx.route('https://accounts.google.com/gsi/client', (rr) => rr.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await ctx.route('**/api/**', (rr) => {
    const u = rr.request().url();
    const responder = (c) => rr.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(c) });
    if (u.includes('/api/plano')) return responder({ ok: true, pro: true, plano: 'anual', validoAte: Date.now() + 86400000, recursos: RECURSOS });
    return responder({ ok: true });
  });
  const abrirPagina = async () => {
    const pag = await ctx.newPage();
    pag.on('pageerror', (e) => errosDaPagina.push(`${nome}: ${e.message}`));
    await pag.goto(ENDERECO, { waitUntil: 'load' });
    abertas.add(pag);
    pag.on('close', () => abertas.delete(pag));
    await pag.waitForTimeout(2200);
    return pag;
  };
  return { ctx, nome, abrirPagina };
}

const esperar = async (fn, ms = 8000) => {
  const ate = Date.now() + ms;
  while (Date.now() < ate) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 120)); }
  return false;
};
const tarefas = (pag) => pag.evaluate(() => ((JSON.parse(localStorage.getItem('cadencia:v3') || '{}').tasks) || []).map((t) => t.text));
const naConta = () => (conta ? (JSON.parse(conta.dados).tasks || []).map((t) => t.text) : []);
const anotar = async (pag, texto) => {
  const campo = pag.locator('input[placeholder="Anotar"]').first();
  await campo.fill(texto);
  await campo.press('Enter');
};

const pc = await aparelho('computador', 1280);
const cel = await aparelho('celular', 390);
let pagPc = await pc.abrirPagina();
let pagCel = await cel.abrirPagina();

/* 1 · anota no computador, aparece no celular */
{
  await anotar(pagPc, 'ligar para o preceptor');
  const chegou = await esperar(async () => (await tarefas(pagCel)).includes('ligar para o preceptor'));
  if (chegou) ok('anotado no computador aparece no celular sozinho, sem recarregar');
  else falha('não chegou ao celular: ' + JSON.stringify(await tarefas(pagCel)) + ' conta=' + JSON.stringify(naConta()));
}

/* 2 · mexe e fecha na hora: a mudança sai ao esconder a página */
{
  await anotar(pagCel, 'trocar o plantão de sábado');
  await pagCel.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const subiu = await esperar(async () => naConta().includes('trocar o plantão de sábado'), 1500);
  if (subiu) ok('mexer e fechar o app na hora: a mudança sobe ao esconder a página, sem esperar o envio automático');
  else falha('não subiu ao esconder: ' + JSON.stringify(naConta()));
  await pagCel.close();
  if (await esperar(async () => (await tarefas(pagPc)).includes('trocar o plantão de sábado'))) ok('e chega ao computador');
  else falha('não chegou ao computador: ' + JSON.stringify(await tarefas(pagPc)));
}

/* 3 · mexe sem rede e fecha; o outro mexe; ao reabrir, junta os dois */
{
  pagCel = await cel.abrirPagina();
  await esperar(async () => (await tarefas(pagCel)).includes('ligar para o preceptor'));
  await pagCel.evaluate(() => { window.__offline = true; });
  await anotar(pagCel, 'feito sem rede no celular');
  await pagCel.waitForTimeout(3200);
  if (!naConta().includes('feito sem rede no celular')) ok('sem rede, a anotação fica só no celular');
  else falha('subiu sem rede?');
  await pagCel.close();
  await anotar(pagPc, 'feito no computador enquanto isso');
  await esperar(async () => naConta().includes('feito no computador enquanto isso'));
  pagCel = await cel.abrirPagina();
  const juntou = await esperar(async () => {
    const t = naConta();
    return t.includes('feito sem rede no celular') && t.includes('feito no computador enquanto isso');
  }, 9000);
  if (juntou) ok('reabrindo o celular com rede: a anotação feita sem rede sobe, e a do computador fica (junta, não substitui)');
  else falha('junção ao reabrir: conta=' + JSON.stringify(naConta()) + ' celular=' + JSON.stringify(await tarefas(pagCel)));
  if (await esperar(async () => {
    const a = await tarefas(pagPc), b = await tarefas(pagCel);
    return a.includes('feito sem rede no celular') && b.includes('feito no computador enquanto isso');
  })) ok('e os dois aparelhos terminam com as duas anotações');
  else falha('aparelhos diferentes: pc=' + JSON.stringify(await tarefas(pagPc)) + ' cel=' + JSON.stringify(await tarefas(pagCel)));
}

/* 4 · os dois mexendo quase ao mesmo tempo */
{
  await Promise.all([anotar(pagPc, 'simultâneo no computador'), anotar(pagCel, 'simultâneo no celular')]);
  const tudo = await esperar(async () => {
    const t = naConta();
    return t.includes('simultâneo no computador') && t.includes('simultâneo no celular');
  }, 12000);
  if (tudo) ok('os dois mexendo ao mesmo tempo: as duas mudanças ficam na conta');
  else falha('simultâneo: ' + JSON.stringify(naConta()));
  const antigas = ['ligar para o preceptor', 'trocar o plantão de sábado', 'feito sem rede no celular', 'feito no computador enquanto isso'];
  if (antigas.every((x) => naConta().includes(x))) ok('e nada do que já estava se perdeu no caminho');
  else falha('perdeu algo: ' + JSON.stringify(naConta()));
}

await pc.ctx.close();
await cel.ctx.close();
await navegador.close();
servidor.close();
if (!errosDaPagina.length) ok('nenhum erro de JavaScript nos dois aparelhos');
else falha('erros: ' + [...new Set(errosDaPagina)].slice(0, 3).join(' | '));
console.log(passos.join('\n'));
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
