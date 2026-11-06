/* O Meu plano na tela, com servidor e Firebase de mentira.
 *
 * O que se confere: a aba existe; o plano colado vai para a IA com o
 * começo, a data de hoje e o currículo; os itens aparecem por dia; marcar
 * feito fica guardado na conta; o cartão "Seu plano hoje" aparece em Hoje;
 * a aula marcada no cronograma dá o item por feito sozinha; um item de
 * ontem não feito aparece remarcado; e no celular nada passa da largura.
 *
 *   node testar-meu-plano-tela.mjs teste.html
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
const user = { uid: 'uid-teste', email: 'aluna@email.com', displayName: 'Teste', getIdToken: async () => 'token-teste' };
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
export function onSnapshot(ref, a, b) {
  const cb = typeof a === 'function' ? a : b;
  setTimeout(() => cb({ exists: () => false, metadata: { fromCache: false }, data: () => ({}) }), 40);
  return () => {};
}`;

const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const mais = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const HOJE = hojeSP();
const ONTEM = mais(HOJE, -1);
const AMANHA = mais(HOJE, 1);
const RESPOSTA = {
  ok: true, nome: 'Plano de teste', inicio: '', fim: '', ignoradas: 1,
  itens: [
    { data: ONTEM, tipo: 'aula', minutos: 60, aula: '', fixo: false, titulo: 'Pneumonia (aula de ontem)' },
    { data: HOJE, tipo: 'aula', minutos: 90, aula: 'cardiologia-arritmias-i', fixo: false, titulo: 'Arritmias I, taquiarritmias' },
    { data: HOJE, tipo: 'questoes', minutos: 0, aula: '', fixo: false, titulo: '30 questões de arritmia' },
    { data: AMANHA, tipo: 'revisao', minutos: 30, aula: '', fixo: false, titulo: 'Revisão de nefrologia' },
  ],
};

const servidor = http.createServer((req, res) => { if (servirSolto(req, res)) return;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(fs.readFileSync(alvo));
});
await new Promise((ok2) => servidor.listen(0, '127.0.0.1', ok2));
const ENDERECO = `http://127.0.0.1:${servidor.address().port}/`;
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const navegador = await chromium.launch({ args: ['--no-sandbox'], ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}) });
const errosDaPagina = [];
const RECURSOS = { assistente: true, cartoes: true, revisoes: true, provas: true, meuplano: true, cronograma: true, rotina: true, amigos: true, metas: true, desempenho: true, simulados: true, progresso: true, estudo: true, motivacao: true };

async function abrir({ largura = 1280 } = {}) {
  const ctx = await navegador.newContext({ viewport: { width: largura, height: largura < 600 ? 844 : 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('cm-sem-pergunta-faculdade', '1');
      localStorage.setItem('cadencia:v3:convite-notificacoes-aparelho', 'teste');
      if (!localStorage.getItem('cadencia:v3')) localStorage.setItem('cadencia:v3', JSON.stringify({ profile: { name: 'Teste', onboarded: true }, theme: 'dark', tema: { visual: 'limpo' } }));
    } catch (e) { /* noop */ }
  });
  await ctx.route('https://www.gstatic.com/firebasejs/**', (rr) => {
    const u = rr.request().url();
    rr.fulfill({ status: 200, contentType: 'text/javascript', body: u.endsWith('firebase-app.js') ? FB_APP : u.endsWith('firebase-auth.js') ? FB_AUTH : FB_STORE });
  });
  await ctx.route('https://accounts.google.com/gsi/client', (rr) => rr.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  const pedidos = [];
  await ctx.route('**/api/**', (rr) => {
    const u = rr.request().url();
    const responder = (c, s = 200) => rr.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(c) });
    if (u.includes('/api/plano-estudo')) { pedidos.push(JSON.parse(rr.request().postData() || '{}')); return responder(RESPOSTA); }
    if (u.includes('/api/plano')) return responder({ ok: true, pro: true, plano: 'anual', validoAte: Date.now() + 86400000, recursos: RECURSOS });
    return responder({ ok: true });
  });
  const pag = await ctx.newPage();
  pag.on('pageerror', (e) => errosDaPagina.push(e.message));
  await pag.goto(ENDERECO, { waitUntil: 'load' });
  await pag.waitForTimeout(1800);
  return { ctx, pag, pedidos };
}
const ir = async (pag, rotulo) => {
  const menu = pag.locator('button[aria-label="Abrir menu"]').first();
  if (await menu.count() && await menu.isVisible()) { await menu.click(); await pag.waitForTimeout(400); }
  const aba = pag.locator(`nav button:has-text("${rotulo}")`).first();
  if (!(await aba.count())) return false;
  await aba.click();
  await pag.waitForTimeout(700);
  return true;
};
const esperar = async (pag, fn, ms = 6000) => {
  const ate = Date.now() + ms;
  while (Date.now() < ate) { if (await fn()) return true; await pag.waitForTimeout(100); }
  return false;
};
const dados = (pag) => pag.evaluate(() => JSON.parse(localStorage.getItem('cadencia:v3') || '{}'));
const texto = (pag, t) => pag.evaluate((sel) => (document.querySelector(sel) || {}).innerText || '', t);

{
  const { ctx, pag, pedidos } = await abrir();
  if (await ir(pag, 'Meu plano')) ok('a aba Meu plano aparece para quem tem o recurso');
  else falha('sem aba Meu plano');
  await pag.locator('[data-teste="meu-plano"] summary').click();
  await pag.locator('[data-teste="meu-plano"] textarea').fill('Semana 1\nSegunda: arritmias, aula 1h30 e 30 questões\nTerça: revisão de nefrologia');
  await pag.locator('[data-teste="meu-plano"] button:has-text("ler o plano colado")').click();
  await esperar(pag, async () => (await pag.locator('[data-teste="item-plano"]').count()) >= 3);
  const p = pedidos[0] || {};
  if (p.token && p.hoje === HOJE && /arritmias/.test(p.texto) && Array.isArray(p.curriculo) && p.curriculo.some((a) => a.id === 'cardiologia-arritmias-i')) ok('o plano vai para a IA com o token, a data de hoje e o currículo para ligar as aulas');
  else falha('pedido à IA: ' + JSON.stringify(p).slice(0, 300));
  const t = await texto(pag, '[data-teste="meu-plano"]');
  if (/hoje/i.test(t) && /Arritmias I, taquiarritmias/.test(t) && /Revisão de nefrologia/.test(t)) ok('os itens aparecem por dia, com hoje marcado');
  else falha('lista: ' + t.slice(0, 500));
  if (/Pneumonia \(aula de ontem\)/.test(t) && /era /.test(t)) ok('o item de ontem que não foi feito aparece remarcado, dizendo a data em que era');
  else falha('remarcado: ' + t.slice(0, 600));
  if (/1h estimado|1h00 estimado|60min estimado|estimado/.test(t)) ok('item sem tempo no plano mostra que o tempo é estimado');
  else falha('sem "estimado": ' + t.slice(0, 400));

  /* marcar como feito */
  await pag.locator('[data-teste="item-plano"]:has-text("30 questões de arritmia") button[aria-label="Marcar como feito"]').click();
  await pag.waitForTimeout(1900);
  let d = await dados(pag);
  const q = ((d.planoArquivo || {}).itens || []).find((i) => /30 questões/.test(i.titulo));
  if (q && q.situacao === 'feito' && q.feitoEm === HOJE) ok('marcar feito fica guardado na conta, com o dia');
  else falha('feito: ' + JSON.stringify(q));

  /* aula marcada no cronograma dá o item por feito sozinha */
  await pag.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('cadencia:v3'));
    d.marks = { ...(d.marks || {}), 'cardiologia-arritmias-i': { aula: true, date: d.planoArquivo.itens[1].dataOriginal } };
    localStorage.setItem('cadencia:v3', JSON.stringify(d));
  });
  await pag.reload({ waitUntil: 'load' });
  await pag.waitForTimeout(2600);
  d = await dados(pag);
  const a = ((d.planoArquivo || {}).itens || []).find((i) => i.aula === 'cardiologia-arritmias-i');
  if (a && a.situacao === 'feito' && a.auto) ok('a aula marcada no cronograma dá o item do plano por feito, sem a pessoa marcar de novo');
  else falha('auto pelo cronograma: ' + JSON.stringify(a));

  /* o cartão em Hoje */
  await ir(pag, 'Hoje');
  await esperar(pag, async () => (await pag.locator('[data-teste="plano-de-hoje"]').count()) > 0);
  const h = await texto(pag, '[data-teste="plano-de-hoje"]');
  if (/Seu plano hoje/i.test(h) && /feitos/.test(h)) ok('Hoje mostra o cartão "Seu plano hoje" com o que já foi feito');
  else falha('cartão em Hoje: ' + h);
  await ctx.close();
}

/* ── no celular ─────────────────────────────────────────────────────── */
{
  const { ctx, pag } = await abrir({ largura: 390 });
  await ir(pag, 'Meu plano');
  await pag.locator('[data-teste="meu-plano"] summary').click();
  await pag.locator('[data-teste="meu-plano"] textarea').fill('Semana 1\nSegunda: arritmias, aula 1h30 e 30 questões');
  await pag.locator('[data-teste="meu-plano"] button:has-text("ler o plano colado")').click();
  await esperar(pag, async () => (await pag.locator('[data-teste="item-plano"]').count()) >= 3);
  const larg = await pag.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  if (larg[0] === larg[1]) ok('no celular o plano cabe na largura, sem rolagem lateral');
  else falha('celular: ' + larg.join('/'));
  await ctx.close();
}

await navegador.close();
servidor.close();
if (!errosDaPagina.length) ok('nenhum erro de JavaScript na página');
else falha('erros: ' + [...new Set(errosDaPagina)].slice(0, 3).join(' | '));
console.log(passos.join('\n'));
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
