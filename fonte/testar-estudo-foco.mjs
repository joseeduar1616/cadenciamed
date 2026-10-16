/* Estudo interativo com o Foco rodando ao mesmo tempo · a tela.
 *
 * Com o cronômetro do Foco ligado, o tempo do bloco já é lançado pelo Foco.
 * O bloco concluído lança só as questões, com 0 minuto, para a mesma meia
 * hora não entrar duas vezes. Com o Foco parado, o bloco lança os minutos.
 * (Base copiada de testar-estudo-tela.mjs.)
 *
 *   node testar-estudo-foco.mjs [teste.html]
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
export function onSnapshot(ref, a, b) { return () => {}; }`;

/* a IA de mentira */
const PLANO = {
  ok: true, titulo: 'Insuficiência cardíaca', resumo: 'Do conceito ao tratamento.',
  blocos: [
    { titulo: 'O que é a IC', objetivo: 'Ao fim você sabe o conceito.', minutos: 12, topicos: ['definição', 'classificação'], figuras: ['F1'] },
    { titulo: 'Tratamento', objetivo: 'Ao fim você sabe tratar.', minutos: 15, topicos: ['diuréticos'], figuras: [] },
  ],
};
const BLOCO = {
  ok: true,
  slides: [
    { tipo: 'capa', titulo: 'Por que o coração cansa?', texto: 'Imagina uma bomba d\'água velha.', emoji: '🫀', pontos: [] },
    { tipo: 'pontos', titulo: 'O essencial da IC', texto: '', pontos: ['Primeiro ponto', 'Segundo ponto', 'Terceiro ponto'], figura: 'F1', legenda: 'A foto do material', emoji: '' },
    { tipo: 'quiz', titulo: 'Teste rápido', pontos: [], quiz: { pergunta: 'Qual a FE da IC sistólica?', opcoes: ['Abaixo de 40%', 'Acima de 70%'], certa: 0, explicacao: 'FE reduzida é abaixo de 40%.' } },
    { tipo: 'caso', titulo: 'Pense no caso', pontos: [], caso: { historia: 'Homem de 60 anos com dispneia.', pergunta: 'O que você pensa?', resposta: 'IC descompensada.' } },
    { tipo: 'esquema', titulo: 'O ciclo', texto: '', pontos: [], esquema: { forma: 'fluxo', passos: ['Lesão', 'Remodelamento', 'Falência'] } },
    { tipo: 'resumo', titulo: 'Para levar', pontos: ['FE abaixo de 40% é reduzida', 'Diurético alivia congestão'] },
  ],
  perguntas: [
    { tipo: 'caso', enunciado: 'PERGUNTA UM: paciente de 70 anos com dispneia. Conduta?', gabarito: ['IC descompensada', 'furosemida venosa'] },
    { tipo: 'conceito', enunciado: 'PERGUNTA DOIS: explique Frank-Starling.', gabarito: ['pré-carga'] },
    { tipo: 'conceito', enunciado: 'PERGUNTA TRÊS: diferencie IC sistólica e diastólica.', gabarito: ['FE'] },
  ],
};
let pedidos = [];

const servidor = http.createServer((req, res) => { if (servirSolto(req, res)) return;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(fs.readFileSync(alvo));
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const ENDERECO = `http://127.0.0.1:${servidor.address().port}/`;
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const navegador = await chromium.launch({ args: ['--no-sandbox'], ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}) });
const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR' });
await ctx.addInitScript(() => {
  if (location.protocol === 'about:' || sessionStorage.getItem('semeado')) return;
  sessionStorage.setItem('semeado', '1');
  localStorage.setItem('cadencia:v3:convite-notificacoes-aparelho', 'teste');
  localStorage.setItem('cadencia:v3', JSON.stringify({ profile: { name: 'Teste', onboarded: true }, theme: 'light', tema: { versaoVisual: 2 } }));
});
await ctx.route('https://www.gstatic.com/firebasejs/**', (rr) => {
  const u = rr.request().url();
  rr.fulfill({ status: 200, contentType: 'text/javascript', body: u.endsWith('firebase-app.js') ? FB_APP : u.endsWith('firebase-auth.js') ? FB_AUTH : FB_STORE });
});
await ctx.route('https://accounts.google.com/gsi/client', (rr) => rr.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
let correcoes = 0;
await ctx.route('**/api/**', async (rr) => {
  const u = rr.request().url();
  let corpo = {};
  try { corpo = JSON.parse(rr.request().postData() || '{}'); } catch (e) { /* GET */ }
  const responder = (j) => rr.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) });
  if (u.includes('/api/ler-foto')) { pedidos.push({ rota: 'ler-foto' }); return responder({ ok: true, texto: 'Texto lido da foto do material sobre fração de ejeção.' }); }
  if (!u.includes('/api/estudo-ia')) return responder({ ok: true });
  pedidos.push({ rota: 'estudo', ...corpo });
  if (corpo.acao === 'plano') return responder(PLANO);
  if (corpo.acao === 'bloco' && corpo.modo === 'rapido') return responder({ ...BLOCO, slides: BLOCO.slides.slice(0, 2), perguntas: BLOCO.perguntas.slice(1) });
  if (corpo.acao === 'bloco') return responder(corpo.indice === 1 ? { ...BLOCO, slides: [{ tipo: 'capa', titulo: 'Bloco dois', texto: 'oi', pontos: [] }, { tipo: 'resumo', titulo: 'Fim', pontos: ['x'] }] } : BLOCO);
  if (corpo.acao === 'simplificar') return responder({ ok: true, explicacao: 'EXPLICAÇÃO MAIS SIMPLES.', analogia: 'Uma mangueira.', lembrete: 'Guarde isto.' });
  if (corpo.acao === 'corrigir') {
    correcoes++;
    if (/PERGUNTA UM/.test(corpo.pergunta.enunciado)) {
      return responder({ ok: true, veredito: 'parcial', acertou: ['reconheceu a IC'], faltou: ['o diurético venoso'], explicacao: 'Faltou dizer a conduta.', reforco: { tipo: 'conceito', enunciado: 'REFORÇO: qual diurético e por qual via?', gabarito: ['furosemida', 'venosa'] } });
    }
    return responder({ ok: true, veredito: 'certo', acertou: ['tudo'], faltou: [], explicacao: 'Isso mesmo.', reforco: null });
  }
  return responder({ ok: true });
});

const pag = await ctx.newPage();
const errosDaPagina = [];
pag.on('pageerror', (e) => errosDaPagina.push(e.message));
await pag.clock.install({ time: new Date('2026-10-08T09:00:00') });
await pag.goto(ENDERECO, { waitUntil: 'load' });
await pag.waitForTimeout(1800);
const dados = () => pag.evaluate(() => JSON.parse(localStorage.getItem('cadencia:v3') || '{}'));
const sessoesDoEstudo = async () => ((await dados()).sessions || []).filter((x) => x.notes === 'estudo interativo');
/* a gravação espera o dedo parar; com o relógio de mentira, é preciso andar com ele */
const esperarSessoes = async (n) => {
  for (let k = 0; k < 20 && (await sessoesDoEstudo()).length < n; k++) await pag.clock.runFor(1000);
  return sessoesDoEstudo();
};

/* liga o Foco */
await pag.locator('nav button:has-text("Foco")').first().click();
await pag.waitForTimeout(500);
await pag.locator('main button:has-text("Começar")').first().click();
await pag.clock.runFor(2000);

/* monta a aula */
await pag.locator('nav button:has-text("Estudo interativo")').first().click();
await pag.waitForTimeout(600);
await pag.locator('[data-teste="estudo-texto"]').fill('A insuficiência cardíaca é uma síndrome clínica. '.repeat(12));
await pag.locator('[data-teste="estudo-montar"]').click();
await pag.waitForSelector('[data-teste="estudo-painel"]', { timeout: 10000 }).catch(() => {});
await pag.locator('[data-teste="estudo-continuar"]').click();
await pag.waitForSelector('[data-teste="estudo-slide"]', { timeout: 10000 }).catch(() => {});

/* estuda o bloco com o relógio andando: 5 minutos */
await pag.clock.runFor(5 * 60 * 1000);
const avancar = pag.locator('[data-teste="estudo-avancar"]');
const passarAteOCheckpoint = async () => {
  for (let k = 0; k < 30 && !(await pag.locator('[data-teste="estudo-checkpoint"]').count()); k++) {
    const t = await pag.locator('[data-teste="estudo-slide"]').getAttribute('data-tipo').catch(() => '');
    if (t === 'quiz' && await avancar.isDisabled().catch(() => false)) await pag.locator('[data-teste="estudo-opcao"]').first().click();
    if (t === 'caso' && await avancar.isDisabled().catch(() => false)) await pag.locator('[data-teste="estudo-ver-caso"]').click();
    await avancar.click().catch(() => {});
    await pag.clock.runFor(700);
  }
};
const responderTudo = async () => {
  for (let k = 0; k < 8 && !(await pag.locator('[data-teste="estudo-bloco-feito"]').count()); k++) {
    await pag.locator('[data-teste="estudo-resposta"]').fill('Furosemida venosa, pré-carga e FE.').catch(() => {});
    await pag.locator('[data-teste="estudo-enviar"]').click().catch(() => {});
    await pag.clock.runFor(900);
  }
};
await passarAteOCheckpoint();
await responderTudo();
await pag.clock.runFor(3000);
let sess = await esperarSessoes(1);
if (await pag.locator('[data-teste="estudo-bloco-feito"]').count()) ok('o bloco fecha com o Foco rodando junto');
else falha('o bloco não fechou');
if (sess.length === 1 && sess[0].minutes === 0 && sess[0].questions === 3) ok('com o Foco ligado, o bloco lança as questões e 0 minuto (o tempo fica só com o Foco)');
else falha('sessão com o Foco ligado: ' + JSON.stringify(sess));

/* para o Foco e estuda o bloco 2: agora os minutos contam */
await pag.locator('[aria-label="Pausar cronômetro"]').first().click().catch(async () => {
  await pag.locator('nav button:has-text("Foco")').first().click();
  await pag.locator('main button:has-text("Pausar")').first().click();
});
await pag.clock.runFor(1500);
await pag.locator('[data-teste="estudo-proximo-bloco"]').click().catch(() => {});
await pag.waitForSelector('[data-teste="estudo-slide"]', { timeout: 8000 }).catch(() => {});
await pag.clock.runFor(4 * 60 * 1000);
await passarAteOCheckpoint();
await responderTudo();
await pag.clock.runFor(3000);
sess = await esperarSessoes(2);
const nova = sess.find((x) => /Tratamento/.test(x.topic));
if (nova && nova.minutes >= 4 && nova.minutes <= 5) ok(`com o Foco parado, o bloco lança os próprios minutos (${nova.minutes})`);
else falha('sessão sem o Foco: ' + JSON.stringify(sess));

if (errosDaPagina.length) falha('erros na página: ' + errosDaPagina.join(' | '));
else ok('nenhum erro de JavaScript na página');
await navegador.close();
servidor.close();
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
