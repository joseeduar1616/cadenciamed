/* Quantos pedidos o site faz ao servidor enquanto a pessoa usa (celular).
 *
 * O servidor tem um limite de pedidos por dia, somado de todo mundo, e ele
 * estourou: o site inteiro ficou sem /api. Duas causas, as duas conferidas
 * aqui para não voltarem:
 * - cada coisa marcada sincronizava, a sincronização trocava a identidade
 *   do objeto da conta, e todo efeito com [nuvem] refazia o seu pedido (a
 *   ligação do Google, as listas abertas);
 * - o convite de duelo era consultado de 20 em 20 segundos em toda aba.
 *
 * O teste anota seis pendências (seis sincronizações), espera, e confere
 * que nenhuma rota foi chamada de novo por causa disso.
 *
 *   node testar-pedidos-tela.mjs [arquivo.html]
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
const user = { uid: 'uid-teste', email: 'teste@exemplo.com', displayName: 'Teste', getIdToken: async () => 'token-teste' };
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
const FB_STORE = `
export function getFirestore() { return {}; }
export function doc(db, ...p) { return { path: p.join('/') }; }
export async function setDoc() {}
export async function getDoc() { return { exists: () => false, data: () => ({}) }; }
export async function runTransaction(db, fn) { return fn({ get: async () => ({ exists: () => false, data: () => ({}) }), set() {} }); }
export function onSnapshot(ref, a, b) {
  const cb = typeof a === 'function' ? a : b;
  setTimeout(() => cb({ exists: () => false, metadata: { fromCache: false }, data: () => ({}) }), 40);
  return () => {};
}`;


const ids = [...fs.readFileSync(new URL('./curriculo.js', import.meta.url), 'utf8').matchAll(/\{ id: "([^"]+)"/g)].map((m) => m[1]).slice(0, 8);

function inicio(lista) {
  try {
    localStorage.setItem('cm-sem-pergunta-faculdade', '1');
    localStorage.setItem('cadencia:v3:convite-notificacoes-aparelho', 'teste');
    const antes = new Date(Date.now() - 100 * 86400000);
    const iso = `${antes.getFullYear()}-${String(antes.getMonth() + 1).padStart(2, '0')}-${String(antes.getDate()).padStart(2, '0')}`;
    const marks = {};
    for (const id of lista) marks[id] = { aula: true, date: iso };
    if (!localStorage.getItem('cadencia:v3')) {
      localStorage.setItem('cadencia:v3', JSON.stringify({ profile: { name: 'Teste', onboarded: true }, theme: 'dark', marks }));
    }
  } catch (e) { /* noop */ }
}

const servidor = http.createServer((req, res) => { if (servirSolto(req, res)) return;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(fs.readFileSync(alvo));
});
await new Promise((ok2) => servidor.listen(0, '127.0.0.1', ok2));
const ENDERECO = `http://127.0.0.1:${servidor.address().port}/`;
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const navegador = await chromium.launch({ args: ['--no-sandbox'], ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}) });
const errosDaPagina = [];
const RECURSOS = { assistente: true, cartoes: true, revisoes: true, provas: true, cronograma: true, rotina: true, amigos: true, metas: true, desempenho: true, simulados: true, progresso: true, meuplano: true, treino: false };

const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });
await ctx.addInitScript(inicio, ids);
await ctx.route('https://www.gstatic.com/firebasejs/**', (rr) => {
  const u = rr.request().url();
  rr.fulfill({ status: 200, contentType: 'text/javascript', body: u.endsWith('firebase-app.js') ? FB_APP : u.endsWith('firebase-auth.js') ? FB_AUTH : FB_STORE });
});
await ctx.route('https://accounts.google.com/gsi/client', (rr) => rr.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
const pedidos = [];
await ctx.route('**/api/**', (rr) => {
  const u = rr.request().url();
  let acao = '';
  try { acao = JSON.parse(rr.request().postData() || '{}').acao || ''; } catch (e) { /* sem corpo */ }
  pedidos.push(`${new URL(u).pathname}${acao ? ':' + acao : ''}`);
  if (u.includes('/api/plano') && !u.includes('plano-')) return rr.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, pro: true, plano: 'anual', validoAte: Date.now() + 86400000, recursos: RECURSOS }) });
  return rr.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
});
const pag = await ctx.newPage();
pag.on('pageerror', (e) => errosDaPagina.push(e.message));
await pag.goto(ENDERECO, { waitUntil: 'load' });
await pag.waitForTimeout(1800);

const esperar = async (fn, ms = 6000) => {
  const ate = Date.now() + ms;
  while (Date.now() < ate) { if (await fn()) return true; await pag.waitForTimeout(100); }
  return false;
};
const irPara = async (aba) => {
  const menu = pag.locator('button[aria-label="Abrir menu"]').first();
  if (await menu.count() && await menu.isVisible()) { await menu.click(); await pag.waitForTimeout(300); }
  await pag.locator(`nav button:has-text("${aba}")`).first().click();
  await pag.waitForTimeout(700);
};
const texto = () => pag.evaluate(() => document.querySelector('main').innerText);
const guardado = () => pag.evaluate(() => JSON.parse(localStorage.getItem('cadencia:v3') || '{}'));

await pag.waitForTimeout(3000);
const antes = pedidos.slice();
const conta = (lista) => lista.reduce((m, p) => { m[p] = (m[p] || 0) + 1; return m; }, {});

/* seis pendências, uma a cada 3,2 s: cada uma grava e sincroniza */
for (let i = 1; i <= 6; i += 1) {
  await pag.locator('main input[placeholder="Anotar"]').fill(`pendência ${i}`);
  await pag.locator('main input[placeholder="Anotar"]').press('Enter');
  await pag.waitForTimeout(3200);
}
await pag.waitForTimeout(5000);
const durante = pedidos.slice(antes.length);
const cDurante = conta(durante);
const guard = await pag.evaluate(() => JSON.parse(localStorage.getItem('cadencia:v3') || '{}'));
if ((guard.tasks || []).length === 6) ok('as seis pendências foram gravadas (seis sincronizações aconteceram)');
else falha('pendências gravadas: ' + (guard.tasks || []).length);

if (durante.length <= 3) ok(`marcar seis coisas não refaz pedidos ao servidor (${durante.length} pedidos em 24 s: ${JSON.stringify(cDurante)})`);
else falha(`pedidos demais enquanto a pessoa marcava: ${durante.length} · ${JSON.stringify(cDurante)}`);

const cTudo = conta(pedidos);
const repetidas = Object.entries(cTudo).filter(([, n]) => n > 3);
if (!repetidas.length) ok('nenhuma rota foi chamada mais de três vezes em meio minuto de uso');
else falha('rotas repetidas: ' + JSON.stringify(repetidas));
if ((cTudo['/api/duplas:listar'] || 0) <= 1) ok('o convite de duelo é consultado uma vez na abertura, e não de 20 em 20 segundos');
else falha('convite de duelo consultado ' + cTudo['/api/duplas:listar'] + ' vezes');
if ((cTudo['/api/google:estado'] || 0) <= 2) ok(`a ligação do Google é perguntada só na abertura, e não a cada sincronização (abertura inteira: ${JSON.stringify(cTudo)})`);
else falha('estado do Google perguntado ' + cTudo['/api/google:estado'] + ' vezes');

if (!errosDaPagina.length) ok('nenhum erro de JavaScript na página');
else falha('erros na página: ' + errosDaPagina.join(' | '));

await ctx.close();
await navegador.close();
servidor.close();
console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
