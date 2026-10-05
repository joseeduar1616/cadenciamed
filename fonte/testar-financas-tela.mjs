/* O financeiro do dono e o "Continuar com o Google", no navegador.
 *
 * Roda no index.html (o de produção): o teste.html libera tudo e marca
 * qualquer um como dono, e aqui o que se testa é justamente quem vê.
 * O Firebase e a IA são de mentira.
 *
 *   node testar-financas-tela.mjs index.html
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';

const alvo = path.resolve(process.argv[2] || 'index.html');
const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };
const DONO = 'joseeduardo1616@gmail.com';

const FB_APP = 'export function initializeApp(c) { window.__cfgFirebase = c; return { c }; }';
/* Auth de mentira com estado: começa logado (ou não), e o popup do Google
   abre a sessão e avisa quem estiver ouvindo, como o de verdade. */
const fbAuth = (email, nomeGoogle) => `
let user = ${email ? `{ uid: 'uid-x', email: '${email}', displayName: 'Teste', getIdToken: async () => 'token' }` : 'null'};
const ouvintes = [];
export function getAuth() { return { get currentUser() { return user; } }; }
export function onAuthStateChanged(a, cb) { ouvintes.push(cb); setTimeout(() => cb(user), 30); return () => {}; }
export async function setPersistence() {}
export const browserLocalPersistence = {}; export const browserSessionPersistence = {};
export async function signOut() {} export async function updateProfile() {}
export async function signInWithEmailAndPassword() { return { user }; }
export async function createUserWithEmailAndPassword() { return { user }; }
export async function sendPasswordResetEmail() {}
export class GoogleAuthProvider { addScope() {} setCustomParameters(p) { window.__paramsGoogle = p; } }
export async function signInWithPopup() {
  window.__popupGoogle = (window.__popupGoogle || 0) + 1;
  user = { uid: 'uid-google', email: 'nova@gmail.com', displayName: ${JSON.stringify(nomeGoogle || 'Ana Google')}, getIdToken: async () => 'token-g' };
  setTimeout(() => ouvintes.forEach((cb) => cb(user)), 10);
  return { user, _tokenResponse: { isNewUser: true } };
}
export function getAdditionalUserInfo(c) { return { isNewUser: !!(c && c._tokenResponse && c._tokenResponse.isNewUser) }; }
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
const TODAS = ['assistente', 'cartoes', 'revisoes', 'provas', 'cronograma', 'rotina', 'amigos', 'metas', 'desempenho', 'simulados', 'progresso', 'treino', 'financeiro'];
const recursos = (dono) => Object.fromEntries(TODAS.map((k) => [k, dono || !['treino', 'financeiro'].includes(k)]));

const servidor = http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(alvo)); });
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const ENDERECO = `http://127.0.0.1:${servidor.address().port}/`;
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const navegador = await chromium.launch({ args: ['--no-sandbox'], ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}) });
const errosDaPagina = [];
const pedidosFin = [];

async function abrir({ email, onboarded = true, largura = 1280 }) {
  const ctx = await navegador.newContext({ viewport: { width: largura, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
  await ctx.addInitScript((onb) => {
    if (location.protocol === 'about:' || window.name === 'semeado') return;
    window.name = 'semeado';
    try {
      localStorage.setItem('cadencia:v3:convite-notificacoes-aparelho', 'teste');
      if (onb && !localStorage.getItem('cadencia:v3')) localStorage.setItem('cadencia:v3', JSON.stringify({ profile: { name: 'Teste', onboarded: true }, theme: 'dark' }));
    } catch (e) { /* noop */ }
  }, onboarded);
  await ctx.route('https://www.gstatic.com/firebasejs/**', (r) => {
    const u = r.request().url();
    r.fulfill({ status: 200, contentType: 'text/javascript', body: u.endsWith('firebase-app.js') ? FB_APP : u.endsWith('firebase-auth.js') ? fbAuth(email) : FB_STORE });
  });
  await ctx.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await ctx.route('**/api/**', (r) => {
    const u = r.request().url();
    const corpo = JSON.parse(r.request().postData() || '{}');
    if (u.includes('/api/plano')) {
      const dono = email === DONO;
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, pro: true, plano: dono ? 'dono' : 'anual', validoAte: 0, recursos: recursos(dono) }) });
    }
    if (u.includes('/api/financas-ia')) {
      pedidosFin.push(corpo);
      if (corpo.acao === 'conversa') {
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, resposta: 'Registrei tudo. Sobra R$ 3.080,00.', acoes: [
          { tipo: 'renda', descricao: 'Salário', valor: 6500 },
          { tipo: 'fixo', descricao: 'Aluguel', valor: 1800, dia: 5, categoria: 'Moradia' },
          { tipo: 'gasto', descricao: 'Mercado', valor: 120, data: '2026-10-05', categoria: 'Mercado' },
          { tipo: 'meta', valor: 1500 },
        ] }) });
      }
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true,
        periodo: { inicio: '2026-09-01', fim: '2026-09-30' },
        movimentos: [
          { data: '2026-09-05', descricao: 'Aluguel', valor: 1800, tipo: 'saida', categoria: 'Moradia' },
          { data: '2026-09-08', descricao: 'Internet Vivo', valor: 120, tipo: 'saida', categoria: 'Contas da casa' },
          { data: '2026-09-12', descricao: 'Restaurante', valor: 85.5, tipo: 'saida', categoria: 'Alimentação fora' },
          { data: '2026-09-01', descricao: 'Salário', valor: 6500, tipo: 'entrada', categoria: 'Transferências' },
        ],
        fixos: [{ descricao: 'Aluguel', valor: 1850, dia: 5, categoria: 'Moradia' }, { descricao: 'Internet Vivo', valor: 120, dia: 8, categoria: 'Contas da casa' }],
        rendas: [{ descricao: 'Salário', valor: 6500 }], observacao: 'Aluguel subiu R$ 50.' }) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  const pag = await ctx.newPage();
  pag.on('pageerror', (e) => errosDaPagina.push(e.message));
  await pag.clock.setFixedTime(new Date('2026-10-05T10:00:00-03:00'));
  await pag.goto(ENDERECO, { waitUntil: 'load' });
  await pag.waitForTimeout(1800);
  return { ctx, pag };
}
const dados = (pag) => pag.evaluate(() => JSON.parse(localStorage.getItem('cadencia:v3') || '{}'));

/* ── 1. quem não é o dono não vê ─────────────────────────────────────── */
{
  const { ctx, pag } = await abrir({ email: 'aluna@email.com' });
  const tem = await pag.locator('nav button:has-text("Financeiro")').count();
  if (!tem) ok('conta que não é a do dono não tem a aba Financeiro');
  else falha('a aba Financeiro apareceu para quem não é o dono');
  await ctx.close();
}

/* ── 2. o dono: conversa, resumo, desfazer, extrato ──────────────────── */
{
  const { ctx, pag } = await abrir({ email: DONO });
  const aba = pag.locator('nav button:has-text("Financeiro")').first();
  if (await aba.count()) ok('o dono tem a aba Financeiro');
  else falha('o dono não vê a aba Financeiro');
  await aba.click();
  await pag.waitForTimeout(500);

  await pag.locator('[data-teste="campo-financeiro"]').fill('recebo 6500, aluguel 1800 dia 5, gastei 120 no mercado hoje, quero juntar 1500 por mês');
  await pag.keyboard.press('Enter');
  await pag.waitForFunction(() => /Sobra R\$ 3\.080/.test(document.querySelector('[data-teste="conversa-financeiro"]')?.innerText || ''), null, { timeout: 8000 }).catch(() => {});
  const conv = await pag.locator('[data-teste="conversa-financeiro"]').innerText();
  if (/Renda: Salário/.test(conv) && /Fixo: Aluguel/.test(conv) && /Meta de economia/.test(conv)) ok('a conversa registra renda, fixo, gasto e meta, e mostra o que registrou');
  else falha('conversa: ' + conv);
  const p = pedidosFin[pedidosFin.length - 1] || {};
  if (p.acao === 'conversa' && /Rendas mensais/.test(p.situacao || '') && p.hoje === '2026-10-05') ok('a IA recebe a situação atual e a data de hoje');
  else falha('pedido da conversa: ' + JSON.stringify(p).slice(0, 200));
  const resumo = await pag.locator('[data-teste="resumo-financeiro"]').innerText();
  const limpo = resumo.replace(/\s+/g, ' ').toLowerCase();
  if (/r\$\s?6\.500,00 renda/.test(limpo) && /r\$\s?1\.800,00 fixos/.test(limpo) && /r\$\s?120,00 gastos do mês/.test(limpo) && /r\$\s?1\.500,00 meta/.test(limpo) && /r\$\s?3\.080,00 sobra/.test(limpo)) {
    ok('o resumo do mês fecha a conta: 6.500 − 1.800 − 120 − 1.500 = 3.080 de sobra');
  } else falha('resumo: ' + limpo);

  await pag.locator('button:has-text("desfazer o último")').click();
  await pag.waitForTimeout(300);
  const depois = (await pag.locator('[data-teste="resumo-financeiro"]').innerText()).replace(/\s+/g, ' ');
  if (/R\$\s?0,00 Renda/i.test(depois)) ok('"desfazer o último" volta ao que era antes');
  else falha('desfazer: ' + depois);

  /* extrato */
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'extrato-'));
  const csv = path.join(pasta, 'extrato-setembro.csv');
  fs.writeFileSync(csv, 'Data;Descrição;Valor\n05/09/2026;ALUGUEL;-1800,00\n08/09/2026;VIVO INTERNET;-120,00\n12/09/2026;RESTAURANTE;-85,50\n01/09/2026;SALARIO;6500,00\n');
  await pag.locator('[data-teste="importar-extrato"]').setInputFiles(csv);
  await pag.waitForSelector('[data-teste="revisao-extrato"]', { timeout: 8000 }).catch(() => {});
  const pe = pedidosFin[pedidosFin.length - 1] || {};
  if (pe.acao === 'extrato' && /ALUGUEL/.test(pe.texto || '')) ok('o CSV do extrato é lido no navegador e vai como texto para a IA');
  else falha('pedido do extrato: ' + JSON.stringify(pe).slice(0, 200));
  const rev = await pag.locator('[data-teste="revisao-extrato"]').innerText().catch(() => '');
  if (/Gastos fixos encontrados \(2\)/i.test(rev) && /Internet Vivo/.test(rev) && /Rendas encontradas/i.test(rev) && /o gasto avulso do extrato, de R\$\s?85,50/.test(rev)) {
    ok('a revisão mostra os fixos e a renda achados, e oferece lançar o gasto avulso (o que não é fixo)');
  } else falha('revisão do extrato: ' + rev);
  await pag.locator('button:has-text("Salvar no financeiro")').click();
  await pag.waitForTimeout(2600);
  const d = await dados(pag);
  const f = d.financas || {};
  const nomesFixos = (f.fixos || []).map((x) => `${x.descricao}:${x.valor}`);
  if (nomesFixos.includes('Aluguel:1850') && nomesFixos.includes('Internet Vivo:120')) ok('salvar grava os fixos do extrato (e o aluguel novo substitui o antigo, sem duplicar)');
  else falha('fixos gravados: ' + JSON.stringify(f.fixos));
  if ((f.gastos || []).some((g) => g.descricao === 'Restaurante' && g.data === '2026-09-12') && !(f.gastos || []).some((g) => /Aluguel|Internet/.test(g.descricao))) {
    ok('o gasto avulso entra no mês dele (setembro), e os fixos não viram gasto avulso repetido');
  } else falha('gastos gravados: ' + JSON.stringify(f.gastos));
  if (f.ultimoExtrato && f.ultimoExtrato.nome === 'extrato-setembro.csv') ok('lembra qual foi o último extrato lido');
  else falha('último extrato: ' + JSON.stringify(f.ultimoExtrato));

  /* à mão */
  await pag.locator('[data-teste="meta-financeiro"]').fill('2.000,50');
  await pag.locator('[data-teste="meta-financeiro"]').press('Enter');
  await pag.waitForTimeout(400);
  const meta = (await pag.locator('[data-teste="resumo-financeiro"]').innerText()).replace(/\s+/g, ' ');
  if (/R\$\s?2\.000,50 Meta/i.test(meta)) ok('a meta digitada à mão ("2.000,50") vale');
  else falha('meta à mão: ' + meta);
  fs.rmSync(pasta, { recursive: true, force: true });
  await ctx.close();
}

/* ── 3. criar conta com o Google, na página de entrada ───────────────── */
{
  const { ctx, pag } = await abrir({ email: '', onboarded: false, largura: 390 });
  const botao = pag.locator('[data-teste="entrar-google"]:visible').first();
  if (await botao.count() && /Continuar com o Google/.test(await botao.innerText())) ok('a entrada tem "Continuar com o Google"');
  else falha('sem o botão do Google na entrada');
  await pag.locator('button:has-text("Criar conta · 3 dias grátis")').first().click();
  await pag.waitForTimeout(800);
  await pag.locator('[data-teste="entrar-google"]:visible').first().click();
  await pag.waitForTimeout(1500);
  const popup = await pag.evaluate(() => window.__popupGoogle || 0);
  const params = await pag.evaluate(() => window.__paramsGoogle || null);
  if (popup === 1 && params && params.prompt === 'select_account') ok('o botão abre o login do Google, pedindo para escolher a conta');
  else falha('popup: ' + popup + ' ' + JSON.stringify(params));
  const d = await dados(pag);
  if (d.profile && d.profile.onboarded && d.profile.name === 'Ana Google') ok('conta nova pelo Google fecha as boas-vindas com o nome do Google');
  else falha('perfil depois do Google: ' + JSON.stringify(d.profile));
  await ctx.close();
}

/* ── 4. o Google em Configurações ────────────────────────────────────── */
{
  const { ctx, pag } = await abrir({ email: '' });
  const semConta = pag.locator('button:has-text("usar sem conta")');
  if (await semConta.count()) { await semConta.first().click(); await pag.waitForTimeout(400); }
  await pag.locator('nav button:has-text("Configurações")').first().click();
  await pag.waitForTimeout(500);
  const n = await pag.locator('[data-teste="entrar-google"]').count();
  if (n >= 1) ok('Configurações › Conta também tem "Continuar com o Google"');
  else falha('Configurações sem o botão do Google');
  await ctx.close();
}

/* ── 5. de onde abre o login do Google ───────────────────────────────── */
{
  const { ctx, pag } = await abrir({ email: '' });
  const cfg = await pag.evaluate(() => window.__cfgFirebase || null);
  if (cfg && cfg.authDomain === 'cadencia-7c1f1.firebaseapp.com') ok('fora do domínio do site, o login abre pelo domínio padrão do Firebase');
  else falha('authDomain fora do site: ' + JSON.stringify(cfg && cfg.authDomain));
  await ctx.close();
}
{
  /* O mesmo app, mas aberto como cadenciamed.com.br (o nome aponta para o
     servidor local do teste). */
  const porta = servidor.address().port;
  const nav2 = await chromium.launch({ args: ['--no-sandbox', `--host-resolver-rules=MAP cadenciamed.com.br 127.0.0.1:${porta}`], ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}) });
  const ctx = await nav2.newContext();
  await ctx.route('https://www.gstatic.com/firebasejs/**', (r) => {
    const u = r.request().url();
    r.fulfill({ status: 200, contentType: 'text/javascript', body: u.endsWith('firebase-app.js') ? FB_APP : u.endsWith('firebase-auth.js') ? fbAuth('') : FB_STORE });
  });
  await ctx.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  const pag = await ctx.newPage();
  await pag.goto('http://cadenciamed.com.br/', { waitUntil: 'load' });
  await pag.waitForTimeout(1800);
  const cfg = await pag.evaluate(() => window.__cfgFirebase || null);
  if (cfg && cfg.authDomain === 'cadenciamed.com.br') ok('em cadenciamed.com.br, o login do Google abre e volta pelo próprio domínio (sem bloqueio entre domínios no Safari)');
  else falha('authDomain no site: ' + JSON.stringify(cfg && cfg.authDomain));
  await nav2.close();
}
{
  const sw = fs.readFileSync(new URL('./sw.js', import.meta.url), 'utf8');
  if (/url\.pathname\.startsWith\("\/__\/"\)\) return;/.test(sw)) ok('o service worker não guarda nem intercepta as páginas do Firebase (/__/)');
  else falha('o sw.js não deixa /__/ passar direto');
}

await navegador.close();
servidor.close();
if (!errosDaPagina.length) ok('nenhum erro de JavaScript na página');
else falha('erros: ' + errosDaPagina.slice(0, 3).join(' | '));
console.log(passos.join('\n'));
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
