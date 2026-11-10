/* A fila de revisão do dia, na tela (celular).
 *
 * Quem ficou meses sem revisar via um paredão: oito degraus vencidos por
 * aula, todos pedindo um clique. O que se confere aqui:
 * - a aba abre com a fila do dia (a cota), e não com a escada inteira;
 * - "Revisei" e uma resposta recuperam a aula: ela sai da fila, o contador
 *   anda, e nenhum degrau dela fica vencido;
 * - a cota muda nos botões e fica guardada;
 * - o Hoje mostra a mesma cota (e o dia pode fechar sem zerar o atraso);
 * - sem data da prova, o Hoje pede a data, e guardar some com o pedido.
 *
 *   node testar-revisao-tela.mjs [arquivo.html]
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
await ctx.route('**/api/**', (rr) => {
  const u = rr.request().url();
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

/* ── Hoje: a cota, e o pedido da data da prova ───────────────────────── */
let t = await texto();
if (/0\/5 aulas de hoje revisadas\. 8 na fila\./.test(t)) ok('o Hoje fala da cota do dia (0/5 aulas), e não de dezenas de revisões vencidas');
else falha('atividade de revisão no Hoje: ' + (t.match(/Revisões das aulas[^]{0,90}/) || [''])[0]);
if (await pag.locator('[data-teste="pedir-data-prova"]').count()) ok('sem data da prova, o Hoje pede a data');
else falha('pedido da data da prova não apareceu');
const daqui = new Date(Date.now() + 200 * 86400000);
const isoProva = `${daqui.getFullYear()}-${String(daqui.getMonth() + 1).padStart(2, '0')}-${String(daqui.getDate()).padStart(2, '0')}`;
await pag.locator('[data-teste="pedir-data-prova"] input[type="date"]').fill(isoProva);
await pag.locator('[data-teste="pedir-data-prova"] button:has-text("guardar")').click();
await esperar(async () => !(await pag.locator('[data-teste="pedir-data-prova"]').count()));
await pag.waitForTimeout(2100);
if (!(await pag.locator('[data-teste="pedir-data-prova"]').count()) && ((await guardado()).profile || {}).examDate === isoProva) ok('guardar a data some com o pedido e grava a data no perfil');
else falha('data da prova: ' + JSON.stringify((await guardado()).profile));

/* ── Revisões: a fila do dia ─────────────────────────────────────────── */
await irPara('Revisões');
const fila = pag.locator('[data-teste="fila-revisao"]');
await esperar(async () => (await fila.locator('[data-fila]').count()) > 0);
if ((await fila.locator('[data-fila]').count()) === 5 && /0\s*de 5 aulas hoje/.test(await fila.innerText()) && /8 aulas na fila/.test(await fila.innerText())) ok('a aba abre com a fila do dia: 5 aulas da cota, de 8 na fila');
else falha('fila: ' + (await fila.innerText()).slice(0, 200));
if (!(await pag.locator('main button[title^="vence em"]').count()) && /ver a escada de cada aula \(8\)/.test(await texto())) ok('a escada de cada aula (os oito degraus) nasce recolhida');
else falha('a escada inteira apareceu aberta');
const larguraOk = await pag.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
if (larguraOk) ok('no celular, a fila cabe na tela sem rolar para o lado');
else falha('fila estoura a largura');

const primeira = await fila.locator('[data-fila]').first().getAttribute('data-fila');
await fila.locator(`[data-fila="${primeira}"] button:has-text("Revisei")`).click();
await fila.locator(`[data-fila="${primeira}"] button:has-text("ok")`).click();
await esperar(async () => /1\s*de 5 aulas hoje/.test(await fila.innerText()));
await pag.waitForTimeout(2100);
const rec = ((await guardado()).reviews || {})[primeira] || {};
const hojeIso = await pag.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
if (/1\s*de 5 aulas hoje/.test(await fila.innerText()) && !(await fila.locator(`[data-fila="${primeira}"]`).count()) && (await fila.locator('[data-fila]').count()) === 4) ok('"Revisei" e uma resposta tiram a aula da fila e o contador anda');
else falha('depois de revisar: ' + (await fila.innerText()).slice(0, 200));
if (rec.ultimaRevisao === hojeIso && rec.recuperado === hojeIso && Object.values(rec.done || {}).every((d) => d === hojeIso) && Object.keys(rec.done || {}).length >= 1) ok('a revisão fica gravada como UMA revisão de hoje que recupera a aula');
else falha('registro da revisão: ' + JSON.stringify(rec));

await pag.locator('main button:has-text("ver a escada de cada aula")').click();
await pag.waitForTimeout(400);
const vencidosDaPrimeira = await pag.evaluate(() => [...document.querySelectorAll('main .breathe')].length);
await pag.locator('main button:has-text("só os atrasados")').click();
await pag.waitForTimeout(300);
const cartoesAtrasados = await pag.evaluate(() => [...document.querySelectorAll('main input[type="range"]')].length);
if (cartoesAtrasados === 7 && vencidosDaPrimeira > 0) ok('na escada, a aula revisada não tem mais degrau vencido (sobram 7 atrasadas)');
else falha(`escada: ${cartoesAtrasados} atrasadas`);

await pag.locator('[data-teste="fila-revisao"] button[aria-label="Mais aulas por dia"]').click();
await esperar(async () => /de 6 aulas hoje/.test(await fila.innerText()));
await pag.waitForTimeout(2100);
if (/1\s*de 6 aulas hoje/.test(await fila.innerText()) && ((await guardado()).revisao || {}).cota === 6) ok('a cota muda no botão e fica guardada');
else falha('cota: ' + JSON.stringify((await guardado()).revisao));

await irPara('Hoje');
t = await texto();
if (/1\/6 aulas de hoje revisadas\. 7 na fila\./.test(t)) ok('o Hoje acompanha: 1/6 aulas revisadas, 7 na fila');
else falha('Hoje depois da revisão: ' + (t.match(/Revisões das aulas[^]{0,90}/) || [''])[0]);

if (!errosDaPagina.length) ok('nenhum erro de JavaScript na página');
else falha('erros na página: ' + errosDaPagina.join(' | '));

await ctx.close();
await navegador.close();
servidor.close();
console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
