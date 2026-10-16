/* O visual novo chegando para quem já usava, e a escolha na inscrição.
 *
 * Confere: dado guardado antes do visual limpo (sem tema.versaoVisual,
 * inclusive o de quem abriu nas primeiras horas, já gravado como "limpo")
 * abre no neon de sempre com o aviso do visual novo; as opções do aviso
 * trocam o site na hora; "Ficar com este visual" fecha o aviso de vez;
 * dado novo não vê aviso; conta nova escolhe o visual no formulário de
 * inscrição; e o erro do botão do Google mostra o código.
 *
 *   node testar-visual-migracao.mjs [arquivo.html]
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { servirSolto } from './servir-teste.mjs';

const alvo = path.resolve(process.argv[2] || 'teste.html');
if (!fs.existsSync(alvo)) { console.error('não achei', alvo); process.exit(1); }
const erros = [];
const ok = (m) => console.log('ok   ' + m);
const falha = (m) => { console.log('FALHA ' + m); erros.push(m); };

/* o Firebase de mentira, como em testar-teste-gratis.mjs; o login com o
   Google pode falhar de propósito, para ver a mensagem */
const FB_APP = 'export function initializeApp(c) { return { c }; }';
const fbAuth = (erroGoogle) => `
const user = null;
export function getAuth() { return { currentUser: user }; }
export function onAuthStateChanged(a, cb) { setTimeout(() => cb(user), 30); return () => {}; }
export async function setPersistence() {}
export const browserLocalPersistence = {}; export const browserSessionPersistence = {};
export async function signOut() {} export async function updateProfile() {}
export async function signInWithEmailAndPassword() { return { user }; }
export async function createUserWithEmailAndPassword() { return { user }; }
export async function sendPasswordResetEmail() {}
export class GoogleAuthProvider { addScope() {} setCustomParameters() {} }
export async function signInWithPopup() { ${erroGoogle ? `const e = new Error('x'); e.code = '${erroGoogle}'; throw e;` : 'return { user };'} }
export async function signInWithRedirect() {} export async function getRedirectResult() { return null; }`;
const FB_STORE = `
export function getFirestore() { return {}; }
export function doc(db, ...p) { return { path: p.join('/') }; }
export async function setDoc() {}
export async function getDoc() { return { exists: () => false, data: () => ({}) }; }
export function onSnapshot(ref, a, b) { return () => {}; }`;

const servidor = http.createServer((req, res) => { if (servirSolto(req, res)) return;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(fs.readFileSync(alvo));
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const ENDERECO = `http://127.0.0.1:${servidor.address().port}/`;
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const navegador = await chromium.launch({ args: ['--no-sandbox'], ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}) });
const errosDaPagina = [];

async function abrir({ semente, largura = 390, erroGoogle = '' }) {
  const ctx = await navegador.newContext({ viewport: { width: largura, height: 844 }, locale: 'pt-BR' });
  await ctx.addInitScript((s) => {
    if (location.protocol === 'about:' || sessionStorage.getItem('semeado')) return;
    sessionStorage.setItem('semeado', '1');
    try {
      localStorage.setItem('cadencia:v3:convite-notificacoes-aparelho', 'teste');
      if (s) localStorage.setItem('cadencia:v3', JSON.stringify(s));
    } catch (e) { /* segue */ }
  }, semente || null);
  await ctx.route('https://www.gstatic.com/firebasejs/**', (rr) => {
    const u = rr.request().url();
    rr.fulfill({ status: 200, contentType: 'text/javascript', body: u.endsWith('firebase-app.js') ? FB_APP : u.endsWith('firebase-auth.js') ? fbAuth(erroGoogle) : FB_STORE });
  });
  await ctx.route('https://accounts.google.com/gsi/client', (rr) => rr.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await ctx.route('**/api/**', (rr) => rr.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  const pag = await ctx.newPage();
  pag.on('pageerror', (e) => errosDaPagina.push(e.message));
  await pag.goto(ENDERECO, { waitUntil: 'load' });
  await pag.waitForTimeout(1800);
  return { ctx, pag };
}
const visual = (pag) => pag.evaluate(() => document.documentElement.getAttribute('data-visual'));
const tema = (pag) => pag.evaluate(() => (JSON.parse(localStorage.getItem('cadencia:v3') || '{}').tema || {}));
const aviso = (pag) => pag.locator('[data-teste="aviso-visual-novo"]');
const ANTIGO = { profile: { name: 'Ana', onboarded: true, examDate: '2027-03-10' }, theme: 'dark' };

/* ── 1. quem já usava: neon, com o aviso ─────────────────────────────── */
{
  const { ctx, pag } = await abrir({ semente: ANTIGO });
  if (await visual(pag) === 'neon') ok('quem já tinha dados abre no neon de sempre');
  else falha('conta antiga abriu em ' + await visual(pag));
  if (await aviso(pag).count() === 1) ok('e vê o aviso de que o site ganhou um visual novo');
  else falha('o aviso do visual novo não apareceu');
  /* O neon tem de ser leve: o desfoque nas auras animadas e o brilho
     animado da marca derrubavam o computador para poucos quadros por
     segundo, e o relógio de placas do Foco virava aos trancos. */
  const peso = await pag.evaluate(() => ({
    auras: [...document.querySelectorAll('.aura')].map((e) => getComputedStyle(e).filter),
    marca: [...document.querySelectorAll('.marca')].map((e) => getComputedStyle(e).animationName),
  }));
  if (peso.auras.length && peso.auras.every((f) => f === 'none')) ok('no neon, as auras não usam desfoque (o que travava o computador)');
  else falha('auras do neon: ' + JSON.stringify(peso.auras));
  if (peso.marca.every((n) => n === 'none')) ok('e o brilho da marca é parado, sem redesenho a cada quadro');
  else falha('a marca ainda anima o brilho: ' + JSON.stringify(peso.marca));
  const txt = await aviso(pag).innerText();
  if (/visual novo/i.test(txt) && /neon de sempre/i.test(txt)) ok('o aviso explica: continua no neon, e dá para experimentar');
  else falha('texto do aviso: ' + txt.slice(0, 160));

  await aviso(pag).locator('[data-teste="visual-limpo"]').click();
  await pag.waitForTimeout(400);
  if (await visual(pag) === 'limpo') ok('tocar em Limpo troca o site na hora');
  else falha('tocar em Limpo não trocou: ' + await visual(pag));
  if (await aviso(pag).count() === 1) ok('e o aviso continua lá, para seguir testando');
  else falha('o aviso sumiu antes de a pessoa decidir');
  if (await aviso(pag).locator('[data-teste="tom-azul"]').count()) ok('no limpo escuro, o aviso oferece o tom: preto ou azul-noite');
  else falha('o aviso não mostra o tom do escuro');
  await aviso(pag).locator('[data-teste="tom-azul"]').click();
  await pag.waitForTimeout(300);
  if (await pag.evaluate(() => document.documentElement.getAttribute('data-escuro')) === 'azul') ok('e o azul-noite também troca na hora');
  else falha('o tom azul-noite não trocou');
  await aviso(pag).locator('[data-teste="fundo-claro"]').click();
  await pag.waitForTimeout(300);
  if (await pag.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'light') ok('o fundo claro também dá para testar ali');
  else falha('o fundo claro não trocou');
  await aviso(pag).locator('[data-teste="visual-neon"]').click();
  await pag.waitForTimeout(300);
  if (await visual(pag) === 'neon') ok('e dá para voltar ao neon');
  else falha('não voltou ao neon');
  await aviso(pag).locator('[data-teste="visual-limpo"]').click();
  await aviso(pag).locator('[data-teste="aviso-visual-ficar"]').click();
  await pag.waitForTimeout(400);
  if (await aviso(pag).count() === 0) ok('"Ficar com este visual" fecha o aviso');
  else falha('o aviso não fechou');
  await pag.waitForFunction(() => { try { const t = JSON.parse(localStorage.getItem('cadencia:v3')).tema; return t.avisoVisual === false && t.visual === 'limpo'; } catch (e) { return false; } }, null, { timeout: 8000 }).catch(() => {});
  const t = await tema(pag);
  if (t.visual === 'limpo' && t.avisoVisual === false && t.versaoVisual === 2) ok('a escolha fica guardada');
  else falha('tema guardado: ' + JSON.stringify(t));
  await pag.reload({ waitUntil: 'load' });
  await pag.waitForTimeout(1600);
  if (await visual(pag) === 'limpo' && await aviso(pag).count() === 0) ok('ao voltar, fica no visual escolhido e o aviso não volta');
  else falha('depois de recarregar: ' + await visual(pag) + ', aviso ' + await aviso(pag).count());
  await ctx.close();
}

/* ── 2. quem abriu nas primeiras horas do limpo também volta ao neon ─── */
{
  const { ctx, pag } = await abrir({ semente: { ...ANTIGO, tema: { visual: 'limpo', escuro: 'preto' } } });
  if (await visual(pag) === 'neon' && await aviso(pag).count() === 1) ok('dado gravado como limpo sem escolha (primeiras horas) volta ao neon, com o aviso');
  else falha('primeiras horas: ' + await visual(pag) + ', aviso ' + await aviso(pag).count());
  /* seguir sem decidir: o aviso não atrapalha usar o site */
  await pag.locator('[data-teste="aviso-visual-novo"]').waitFor();
  if (await pag.locator('main').getByText(/Hoje/).first().isVisible()) ok('o aviso não cobre a página: dá para seguir usando');
  else falha('a página sumiu atrás do aviso');
  await ctx.close();
}

/* ── 3. quem já decidiu não vê o aviso ───────────────────────────────── */
{
  const { ctx, pag } = await abrir({ semente: { ...ANTIGO, tema: { visual: 'limpo', versaoVisual: 2, avisoVisual: false } } });
  if (await visual(pag) === 'limpo' && await aviso(pag).count() === 0) ok('dado de depois da mudança fica como está, sem aviso');
  else falha('dado novo: ' + await visual(pag) + ', aviso ' + await aviso(pag).count());
  await ctx.close();
}

/* ── 4. conta nova: escolhe o visual na inscrição ────────────────────── */
{
  const { ctx, pag } = await abrir({ semente: null });
  if (await visual(pag) === 'limpo') ok('quem chega pela primeira vez começa no limpo');
  else falha('primeira visita em ' + await visual(pag));
  await pag.locator('button:has-text("Criar conta · 3 dias grátis")').first().click();
  await pag.waitForTimeout(900);
  const bloco = pag.locator('[data-teste="inscricao-visual"]:visible').first();
  if (await bloco.count()) ok('o formulário de inscrição tem a escolha do visual');
  else falha('a inscrição não mostra a escolha do visual');
  if (await bloco.count()) {
    if (await bloco.locator('[data-teste="visual-limpo"][aria-pressed="true"]').count()) ok('com o limpo marcado de início');
    else falha('o limpo não vem marcado na inscrição');
    if (process.env.CAPTURA_INSCRICAO) { await bloco.scrollIntoViewIfNeeded(); await pag.waitForTimeout(1500); await pag.screenshot({ path: process.env.CAPTURA_INSCRICAO }); }
    await bloco.locator('[data-teste="visual-neon"]').click();
    await pag.waitForTimeout(400);
    if (await visual(pag) === 'neon') ok('escolher Neon na inscrição troca o site na hora');
    else falha('a escolha na inscrição não trocou o visual');
    await pag.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('cadencia:v3')).tema.visual === 'neon'; } catch (e) { return false; } }, null, { timeout: 8000 }).catch(() => {});
    const t = await tema(pag);
    if (t.visual === 'neon' && t.versaoVisual === 2 && t.avisoVisual === false) ok('e a escolha fica guardada, sem aviso depois');
    else falha('tema depois da inscrição: ' + JSON.stringify(t));
  }
  await ctx.close();
}

/* ── 5. o erro do Google diz o código ────────────────────────────────── */
{
  const { ctx, pag } = await abrir({ semente: null, largura: 1280, erroGoogle: 'auth/internal-error' });
  await pag.locator('button:has-text("Criar conta · 3 dias grátis")').first().click();
  await pag.waitForTimeout(700);
  await pag.locator('[data-teste="entrar-google"]:visible').first().click();
  await pag.waitForTimeout(800);
  const corpo = await pag.evaluate(() => document.body.innerText);
  if (/login com o Google não terminou/i.test(corpo) && /Código: internal-error/.test(corpo)) ok('se o Google falhar, a mensagem diz o código do erro');
  else falha('mensagem do Google: ' + ((corpo.match(/.{0,80}Google.{0,80}/g) || []).join(' | ')).slice(0, 300));
  await ctx.close();
}

if (!errosDaPagina.length) ok('nenhum erro de JavaScript na página');
else falha('erros: ' + errosDaPagina.slice(0, 3).join(' | '));

await navegador.close();
servidor.close();
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
