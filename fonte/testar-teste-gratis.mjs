/* O teste grátis de 3 dias: a regra no servidor e o que a tela mostra.
 *
 * Servidor (worker/api/plano.js e cupom.js, com o Google e o banco de
 * mentira): conta criada há pouco ganha o plano completo até 3 dias depois
 * da criação, gravado uma vez só e sem passar por cima de cupom gravado no
 * mesmo instante; conta antiga não ganha; teste vencido volta para a versão
 * gratuita dizendo que era teste; e o cupom resgatado durante o teste vale.
 *
 * Tela (Chromium com o Firebase de mentira): o cadastro mostra os 3 dias
 * e os preços sem cobrar; durante o teste, Hoje e Planos dizem quanto falta
 * e as abas pagas abrem; vencido, avisam que acabou e as abas pagas fecham.
 *
 *   node testar-teste-gratis.mjs index.html
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';

/* index.html, o de produção: o teste.html libera o plano de propósito
   (montar_teste.py), e aqui o que se testa é justamente o plano. */
const alvo = path.resolve(process.argv[2] || 'index.html');
const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };
const DIA = 86400000;

/* ── 1. o servidor ───────────────────────────────────────────────────── */
const { generateKeyPairSync } = await import('node:crypto');
const CONTA = {
  client_email: 'teste@exemplo.iam.gserviceaccount.com',
  private_key: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }),
};
const env = { FIREBASE_API_KEY: 'k', FIREBASE_SERVICE_ACCOUNT: JSON.stringify(CONTA), CUPONS: 'amigo:anual' };
let QUEM = null;
let DOCS = {};                 // uid -> fields
let gravacoes = [];
let antesDeGravar = null;      // simula um cupom gravado entre a leitura e a gravação
const resp = (c, s = 200) => new Response(JSON.stringify(c), { status: s, headers: { 'Content-Type': 'application/json' } });
const fetchReal = globalThis.fetch;
globalThis.fetch = async (url, op = {}) => {
  const u = String(url);
  const metodo = op.method || 'GET';
  if (u.includes('identitytoolkit')) return resp({ users: [QUEM] });
  if (u.includes('oauth2.googleapis.com/token')) return resp({ access_token: 't' });
  if (u.includes('/documents/config/recursos') || u.includes('/documents/cupons/') || u.includes('/documents/mentores/')) return resp({}, 404);
  const m = /\/documents\/assinaturas\/([^/?]+)(\?[^]*)?$/.exec(u);
  if (m) {
    const uid = m[1];
    if (metodo === 'GET') return DOCS[uid] ? resp({ fields: DOCS[uid] }) : resp({}, 404);
    if (metodo === 'PATCH') {
      if (antesDeGravar) { antesDeGravar(); antesDeGravar = null; }
      const corpo = JSON.parse(op.body);
      gravacoes.push({ uid, url: u, campos: corpo.fields });
      if ((m[2] || '').includes('currentDocument.exists=false') && DOCS[uid]) return resp({ error: { status: 'FAILED_PRECONDITION' } }, 400);
      DOCS[uid] = corpo.fields;
      return resp({ name: uid });
    }
  }
  return fetchReal(url, op);
};
const plano = (await import('../worker/api/plano.js')).onRequest;
const cupom = (await import('../worker/api/cupom.js')).onRequest;
const { validoAte } = await import('../worker/api/_comum.js');
const pedir = async (fn, corpo) => {
  const r = await fn({ request: new Request('http://x/api', { method: 'POST', body: JSON.stringify({ token: 'tk', ...corpo }) }), env });
  return { status: r.status, corpo: await r.json() };
};

const agora = Date.now();
QUEM = { localId: 'uid-nova', email: 'nova@email.com', createdAt: String(agora - 3600000) };
let r = await pedir(plano, {});
const g = gravacoes[0];
if (r.corpo.pro === true && r.corpo.plano === 'teste' && r.corpo.teste === true) ok('conta criada há 1 hora: plano completo como teste grátis');
else falha('conta nova: ' + JSON.stringify(r.corpo));
if (Math.abs(r.corpo.validoAte - (agora - 3600000 + 3 * DIA)) < 1000) ok('o teste vai até 3 dias depois da criação da conta');
else falha('validoAte do teste: ' + r.corpo.validoAte);
if (g && /currentDocument\.exists=false/.test(g.url) && g.campos.plano.stringValue === 'teste') ok('gravado com "só se não existir", para nunca passar por cima de um plano');
else falha('gravação do teste: ' + JSON.stringify(g));
if (r.corpo.recursos && r.corpo.recursos.cartoes === true) ok('com o teste, as abas pagas abrem');
else falha('recursos no teste: ' + JSON.stringify(r.corpo.recursos));
if (await validoAte('t', 'uid-nova') > Date.now()) ok('toda rota paga (validoAte) já reconhece o teste');
else falha('validoAte não reconhece o teste');
gravacoes = [];
await pedir(plano, {});
if (!gravacoes.length) ok('o teste é gravado uma vez só: abrir de novo não regrava nem estica');
else falha('regravou o teste');

/* cupom durante o teste: vale, e troca o teste pelo plano do cupom */
r = await pedir(cupom, { codigo: 'amigo' });
if (r.corpo.ok && !r.corpo.jaTinha && DOCS['uid-nova'].plano.stringValue === 'anual') ok('cupom resgatado durante o teste vale (não diz "já liberado"), e o plano vira o do cupom');
else falha('cupom no teste: ' + JSON.stringify(r.corpo));

/* cupom gravado no mesmo instante do primeiro /api/plano */
QUEM = { localId: 'uid-corrida', email: 'c@email.com', createdAt: String(agora - 60000) };
antesDeGravar = () => { DOCS['uid-corrida'] = { plano: { stringValue: 'anual' }, validoAte: { doubleValue: agora + 300 * DIA } }; };
r = await pedir(plano, {});
if (r.corpo.plano === 'anual' && DOCS['uid-corrida'].plano.stringValue === 'anual') ok('cupom gravado no mesmo instante não é atropelado pelo teste');
else falha('corrida cupom x teste: ' + JSON.stringify(r.corpo));

/* conta antiga, sem nada: não ganha teste retroativo */
QUEM = { localId: 'uid-antiga', email: 'a@email.com', createdAt: String(agora - 10 * DIA) };
gravacoes = [];
r = await pedir(plano, {});
if (r.corpo.pro === false && !gravacoes.length && !r.corpo.teste) ok('conta criada há 10 dias, sem plano: continua na versão gratuita, sem teste');
else falha('conta antiga: ' + JSON.stringify(r.corpo));

/* teste vencido */
QUEM = { localId: 'uid-vencida', email: 'v@email.com', createdAt: String(agora - 4 * DIA) };
DOCS['uid-vencida'] = { plano: { stringValue: 'teste' }, validoAte: { doubleValue: agora - DIA } };
r = await pedir(plano, {});
if (r.corpo.pro === false && r.corpo.teste === true && r.corpo.recursos.cartoes === false) ok('teste vencido: volta para a versão gratuita, avisando que era teste');
else falha('teste vencido: ' + JSON.stringify(r.corpo));

/* conta sem data de criação (o Google não mandou): sem teste, sem erro */
QUEM = { localId: 'uid-sem-data', email: 's@email.com' };
r = await pedir(plano, {});
if (r.status === 200 && r.corpo.pro === false) ok('sem a data de criação, não inventa teste');
else falha('sem data: ' + JSON.stringify(r));
globalThis.fetch = fetchReal;

/* ── 2. a tela ───────────────────────────────────────────────────────── */
const FB_APP = 'export function initializeApp(c) { return { c }; }';
const fbAuth = (logado) => `
const user = ${logado ? "{ uid: 'uid-teste', email: 'teste@exemplo.com', displayName: 'Teste', getIdToken: async () => 'token-teste' }" : 'null'};
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

const servidor = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(fs.readFileSync(alvo));
});
await new Promise((ok2) => servidor.listen(0, '127.0.0.1', ok2));
const ENDERECO = `http://127.0.0.1:${servidor.address().port}/`;
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const navegador = await chromium.launch({ args: ['--no-sandbox'], ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}) });
const errosDaPagina = [];

async function abrir({ logado, respostaPlano, onboarded = true, largura = 1280 }) {
  const ctx = await navegador.newContext({ viewport: { width: largura, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.addInitScript((onb) => {
    try {
      localStorage.setItem('cadencia:v3:convite-notificacoes-aparelho', 'teste');
      if (onb && !localStorage.getItem('cadencia:v3')) localStorage.setItem('cadencia:v3', JSON.stringify({ profile: { name: 'Teste', onboarded: true }, theme: 'dark' }));
    } catch (e) { /* noop */ }
  }, onboarded);
  await ctx.route('https://www.gstatic.com/firebasejs/**', (rr) => {
    const u = rr.request().url();
    rr.fulfill({ status: 200, contentType: 'text/javascript', body: u.endsWith('firebase-app.js') ? FB_APP : u.endsWith('firebase-auth.js') ? fbAuth(logado) : FB_STORE });
  });
  await ctx.route('https://accounts.google.com/gsi/client', (rr) => rr.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await ctx.route('**/api/**', (rr) => {
    if (rr.request().url().includes('/api/plano') && respostaPlano) {
      return rr.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(respostaPlano) });
    }
    return rr.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  const pag = await ctx.newPage();
  pag.on('pageerror', (e) => errosDaPagina.push(e.message));
  await pag.goto(ENDERECO, { waitUntil: 'load' });
  await pag.waitForTimeout(1800);
  return { ctx, pag };
}
const RECURSOS = (pro) => ({ assistente: pro, cartoes: pro, revisoes: pro, provas: pro, cronograma: true, rotina: true, amigos: true, metas: true, desempenho: true, simulados: true, progresso: true, treino: false });
const texto = (pag) => pag.evaluate(() => document.body.innerText);

/* 2a. o cadastro, na página de entrada */
{
  const { ctx, pag } = await abrir({ logado: false, onboarded: false, largura: 390 });
  const t0 = await texto(pag);
  if (/Criar conta · 3 dias grátis/.test(t0) && /3 dias grátis com todas as funções liberadas, sem cartão/.test(t0)) ok('a entrada já diz: 3 dias grátis, com todas as funções liberadas, sem cartão');
  else falha('entrada sem o teste grátis');
  if (!/\b(90|213)\b/.test(t0)) ok('a entrada não fala em "90 aulas" nem "213 tópicos"');
  else falha('a entrada ainda mostra a contagem de aulas/tópicos: ' + (t0.match(/.{0,40}\b(90|213)\b.{0,40}/) || [''])[0]);
  const criar = pag.locator('button:has-text("Criar conta · 3 dias grátis")').first();
  await criar.click();
  await pag.waitForTimeout(900);
  const aviso = pag.locator('[data-teste="aviso-teste-gratis"]:visible').first();
  if (await aviso.count()) {
    const ta = await aviso.innerText();
    if (/3 dias grátis com todas as funções liberadas/.test(ta) && /todas as funções do site/.test(ta) && /R\$ 39/.test(ta) && /R\$ 300/.test(ta) && /Nada é cobrado agora/.test(ta)) {
      ok('no formulário de criar conta: os 3 dias grátis e os preços (R$ 39 e R$ 300), sem cobrar nada');
    } else falha('aviso do cadastro incompleto: ' + ta);
    const caixa = await aviso.boundingBox();
    if (caixa && caixa.x >= 0 && caixa.x + caixa.width <= 390) ok('o aviso cabe na tela do celular');
    else falha('aviso fora da tela: ' + JSON.stringify(caixa));
  } else falha('o aviso dos 3 dias não aparece no criar conta');
  const entrar = pag.locator('button:has-text("Entrar"):visible').first();
  if (await entrar.count()) {
    await entrar.click();
    await pag.waitForTimeout(400);
    if (!(await pag.locator('[data-teste="aviso-teste-gratis"]:visible').count())) ok('em "Entrar" (conta que já existe), o aviso some');
    else falha('o aviso aparece também no Entrar');
  }
  await ctx.close();
}

/* 2b. durante o teste */
{
  const ate = Date.now() + 2.5 * DIA;
  const { ctx, pag } = await abrir({ logado: true, respostaPlano: { ok: true, pro: true, plano: 'teste', teste: true, validoAte: ate, recursos: RECURSOS(true) } });
  const banner = pag.locator('[data-teste="banner-teste"]');
  if (await banner.count() && /todas as funções liberadas · faltam 3 dias/.test(await banner.innerText())) ok('Hoje mostra o teste grátis (todas as funções liberadas) e quanto falta');
  else falha('banner do teste em Hoje: ' + (await banner.count() ? await banner.innerText() : 'não apareceu'));
  if (!/Você está na versão gratuita/.test(await texto(pag))) ok('e não chama a conta de "versão gratuita" durante o teste');
  else falha('durante o teste aparece "versão gratuita"');
  const rodape = await pag.evaluate(() => (document.querySelector('footer') || {}).innerText || '');
  if (rodape && !/atalhos/i.test(rodape)) ok('o rodapé do site não tem mais "atalhos de teclado"');
  else falha('rodapé: ' + rodape);
  const textoApp = await texto(pag);
  if (!/\b(90|213) (aulas|tópicos)\b/.test(textoApp)) ok('dentro do app também não aparece "90 aulas" nem "213 tópicos"');
  else falha('o app ainda fala a contagem: ' + (textoApp.match(/.{0,40}\b(90|213) (aulas|tópicos).{0,40}/) || [''])[0]);
  await pag.locator('nav button:has-text("Cartões")').first().click();
  await pag.waitForTimeout(500);
  if (!/Recurso do plano completo/.test(await texto(pag))) ok('Cartões (aba paga) abre durante o teste');
  else falha('Cartões trancado durante o teste');
  await banner.count();
  await pag.locator('nav button:has-text("Hoje")').first().click();
  await pag.waitForTimeout(300);
  await pag.locator('[data-teste="banner-teste"] button:has-text("Ver planos")').click();
  await pag.waitForTimeout(500);
  const card = pag.locator('[data-teste="planos-em-teste"]');
  if (await card.count() && /Nada foi\s+cobrado/.test(await card.innerText())) ok('Planos explica: teste grátis até tal dia, nada cobrado, e o que acontece depois');
  else falha('Planos sem o aviso do teste');
  if (/Pague com\s+teste@exemplo\.com/.test(await texto(pag))) ok('e lembra de pagar com o e-mail da conta, para quem quiser assinar já');
  else falha('falta o lembrete do e-mail em Planos durante o teste');
  await ctx.close();
}

/* 2c. teste vencido */
{
  const { ctx, pag } = await abrir({ logado: true, respostaPlano: { ok: true, pro: false, plano: 'teste', teste: true, validoAte: Date.now() - DIA, recursos: RECURSOS(false) } });
  const t1 = await texto(pag);
  if (/Seu teste grátis acabou/.test(t1) && /seus dados continuam aqui/.test(t1)) ok('vencido, Hoje avisa que o teste acabou e que os dados continuam');
  else falha('Hoje com o teste vencido não avisa');
  await pag.locator('nav button:has-text("Cartões")').first().click();
  await pag.waitForTimeout(500);
  if (/Recurso do plano completo/.test(await texto(pag))) ok('e as abas pagas voltam a fechar');
  else falha('Cartões continuou aberto depois do teste');
  await ctx.close();
}

await navegador.close();
servidor.close();
if (!errosDaPagina.length) ok('nenhum erro de JavaScript na página');
else falha('erros: ' + errosDaPagina.slice(0, 3).join(' | '));
console.log(passos.join('\n'));
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
