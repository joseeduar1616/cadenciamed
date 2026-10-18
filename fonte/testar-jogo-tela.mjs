/* Modo jogo do estudo interativo · a tela (Chromium, com a IA e o Firebase de mentira).
 *
 * O caminho inteiro, num celular: a aula vira uma trilha de lições; a lição
 * ocupa a tela, ensina antes de cobrar e corrige cada tipo de exercício
 * (escolha, verdadeiro ou falso, lacuna, pares e ordem); errar tira vida e o
 * exercício volta no fim; o fim mostra o XP certo, o acerto e a ofensiva; o
 * XP vai para a conta e a próxima lição abre; a lição perfeita ganha a
 * coroa; sem vidas, a lição para e leva aos slides do bloco.
 *
 *   node testar-jogo-tela.mjs [teste.html]
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

/* a IA de mentira */
const PLANO = {
  ok: true, titulo: 'Insuficiência cardíaca', resumo: 'Do conceito ao tratamento.',
  blocos: [
    { titulo: 'O que é a IC', objetivo: 'Ao fim você sabe o conceito.', minutos: 12, topicos: ['definição'], figuras: [] },
    { titulo: 'Tratamento', objetivo: 'Ao fim você sabe tratar.', minutos: 15, topicos: ['diuréticos'], figuras: [] },
  ],
};
const LICAO = [
  { tipo: 'ensina', titulo: 'ENSINA: a fração de ejeção', texto: 'É o quanto o ventrículo esvazia.', emoji: '🫀' },
  { tipo: 'escolha', contexto: 'Homem de 60 anos com dispneia.', pergunta: 'PERGUNTA E1: FE reduzida é abaixo de?', opcoes: ['70%', '40%', '55%'], certa: 1, explicacao: 'EXPLICA E1: abaixo de 40%.' },
  { tipo: 'vf', afirmacao: 'VF: diurético alivia a congestão.', verdadeiro: true, explicacao: 'Tira volume.' },
  { tipo: 'lacuna', frase: 'O IECA pode dar ___ seca.', opcoes: ['febre', 'tosse', 'diarreia'], certa: 1, explicacao: 'Bradicinina.' },
  { tipo: 'pares', titulo: 'PARES: droga e efeito', pares: [{ a: 'IECA', b: 'tosse' }, { a: 'Betabloqueador', b: 'bradicardia' }, { a: 'Espironolactona', b: 'hipercalemia' }], explicacao: '' },
  { tipo: 'ordem', titulo: 'ORDEM: a história da IC', passos: ['Lesão', 'Remodelamento', 'Falência'], explicacao: '' },
  { tipo: 'escolha', pergunta: 'PERGUNTA E2', opcoes: ['certa2', 'errada2'], certa: 0, explicacao: '' },
  { tipo: 'escolha', pergunta: 'PERGUNTA E3', opcoes: ['errada3', 'certa3'], certa: 1, explicacao: '' },
  { tipo: 'escolha', pergunta: 'PERGUNTA E4', opcoes: ['certa4', 'errada4'], certa: 0, explicacao: '' },
];
const LICAO2 = Array.from({ length: 7 }, (_, i) => ({ tipo: 'escolha', pergunta: `SEGUNDA ${i}`, opcoes: ['certa', 'errada'], certa: 0, explicacao: '' }));
let pedidos = [];

const servidor = http.createServer((req, res) => { if (servirSolto(req, res)) return;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(fs.readFileSync(alvo));
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const ENDERECO = `http://127.0.0.1:${servidor.address().port}/`;
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const navegador = await chromium.launch({ args: ['--no-sandbox'], ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}) });
const ctx = await navegador.newContext({ viewport: { width: 420, height: 860 }, locale: 'pt-BR', isMobile: true, hasTouch: true });
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
await ctx.route('**/api/**', async (rr) => {
  const u = rr.request().url();
  let corpo = {};
  try { corpo = JSON.parse(rr.request().postData() || '{}'); } catch (e) { /* GET */ }
  const responder = (j) => rr.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) });
  if (!u.includes('/api/estudo-ia')) return responder({ ok: true });
  pedidos.push({ rota: 'estudo', ...corpo });
  if (corpo.acao === 'plano') return responder(PLANO);
  if (corpo.acao === 'licao') return responder({ ok: true, exercicios: corpo.indice === 1 ? LICAO2 : LICAO });
  if (corpo.acao === 'bloco') return responder({ ok: true, slides: [{ tipo: 'capa', titulo: 'SLIDE DO BLOCO', texto: 'oi', pontos: [] }, { tipo: 'resumo', titulo: 'Fim', pontos: ['x'] }], perguntas: [{ tipo: 'conceito', enunciado: 'P', gabarito: ['g'] }] });
  return responder({ ok: true });
});

const pag = await ctx.newPage();
const errosDaPagina = [];
pag.on('pageerror', (e) => errosDaPagina.push(e.message));
await pag.goto(ENDERECO, { waitUntil: 'load' });
await pag.waitForTimeout(1800);
const foto = async (n) => { if (process.env.CAPTURAS) await pag.screenshot({ path: `${process.env.CAPTURAS}/${n}.png` }); };
const dados = () => pag.evaluate(() => JSON.parse(localStorage.getItem('cadencia:v3') || '{}'));
const hoje = await pag.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
const texto = (sel) => pag.locator(sel).innerText().catch(() => '');

/* ── 1. uma aula e a troca para o modo jogo ──────────────────────────── */
const menu = pag.locator('button[aria-label="Abrir menu"]').first();
if (await menu.count() && await menu.isVisible()) { await menu.click(); await pag.waitForTimeout(500); }
await pag.locator('nav button:has-text("Estudo interativo")').first().click();
await pag.waitForTimeout(600);
await pag.locator('[data-teste="estudo-texto"]').fill('A insuficiência cardíaca é uma síndrome clínica. '.repeat(12));
await pag.locator('[data-teste="estudo-montar"]').click();
await pag.waitForSelector('[data-teste="estudo-painel"]', { timeout: 10000 }).catch(() => {});
await pag.locator('[data-teste="estudo-aba-jogo"]').click();
await pag.waitForTimeout(500); await foto('jogo-0-trilha');
const nos = pag.locator('[data-teste="jogo-no"]');
if (await nos.count() === 2 && !(await nos.nth(0).isDisabled()) && await nos.nth(1).isDisabled()) ok('modo jogo: a trilha tem uma lição por bloco, e só a primeira abre');
else falha('trilha: ' + await nos.count());
if (!(await pag.locator('[data-teste="estudo-bloco"]').first().isVisible())) ok('no modo jogo, a lista de blocos dos slides some');
else falha('lista dos slides continua à vista');
if (await pag.evaluate(() => localStorage.getItem('cadencia:v3:estudo-jogo')) === '1') ok('a escolha do modo jogo fica lembrada no aparelho');
else falha('modo jogo não lembrado');

/* ── 2. a lição ──────────────────────────────────────────────────────── */
pedidos = [];
await nos.nth(0).click();
await pag.waitForSelector('[data-teste="jogo-ex-ensina"]', { timeout: 10000 }).catch(() => {});
const pLicao = pedidos.find((p) => p.acao === 'licao' && p.indice === 0);
if (pLicao && /insuficiência/i.test(pLicao.texto) && pLicao.plano && pLicao.plano.blocos.length === 2) ok('a lição é pedida à IA com o material e o plano da aula');
else falha('pedido da lição: ' + JSON.stringify(pedidos.map((p) => [p.acao, p.indice])));
await pag.waitForFunction(() => true, null, { timeout: 200 }).catch(() => {});
const cheia = await pag.evaluate(() => { const el = document.querySelector('[data-teste="jogo-licao"]'); if (!el) return null; const r = el.getBoundingClientRect(); return el.parentElement === document.body && r.width >= innerWidth - 1 && r.height >= innerHeight - 1; });
if (cheia) ok('a lição ocupa a tela toda, como nos apps de idioma');
else falha('lição não ocupa a tela');
await foto('jogo-1-ensina');
if (/ENSINA: a fração de ejeção/.test(await texto('[data-teste="jogo-licao"]'))) ok('a lição começa ensinando antes de cobrar');
else falha('cartão de ensinar não apareceu');
await pag.locator('[data-teste="jogo-continuar-ex"]').click(); await pag.waitForTimeout(450);

const vidas = async () => Number((await texto('[data-teste="jogo-vidas"]')).replace(/\D/g, ''));
const verificar = async () => { await pag.locator('[data-teste="jogo-verificar"]').click(); await pag.waitForTimeout(350); };
const continuar = async () => { await pag.locator('[data-teste="jogo-continuar-ex"]').click(); await pag.waitForTimeout(450); };
const opcao = (t) => pag.locator('[data-teste="jogo-opcao"]', { hasText: t }).first();

/* múltipla escolha, errando */
if (await pag.locator('[data-teste="jogo-verificar"]').isDisabled()) ok('"Verificar" só libera depois de escolher');
else falha('verificar liberado sem resposta');
await opcao('70%').click(); await verificar(); await foto('jogo-2-errou');
const errouTxt = await texto('[data-teste="jogo-errou"]');
if (/40%/.test(await texto('[data-teste="jogo-certa"]')) && /EXPLICA E1/.test(errouTxt) && await vidas() === 4) ok('errou: perde uma vida e vê a certa com a explicação');
else falha('depois de errar: ' + errouTxt.slice(0, 160) + ' / vidas ' + await vidas());
await continuar();

/* verdadeiro ou falso */
await opcao('Verdadeiro').click(); await verificar();
if (await pag.locator('[data-teste="jogo-acertou"]').count()) ok('verdadeiro ou falso: acertou');
else falha('vf não marcou o acerto');
await continuar();
/* lacuna */
await pag.locator('[data-teste="jogo-palavra"]', { hasText: 'tosse' }).click();
if (/tosse/.test(await texto('[data-teste="jogo-lacuna"]'))) ok('lacuna: a palavra escolhida entra na frase');
else falha('lacuna vazia');
await verificar(); await continuar();
/* pares, com uma ligação errada no meio */
if (await pag.locator('[data-teste="jogo-verificar"]').isDisabled()) ok('pares: só verifica com tudo ligado');
else falha('pares: verificar liberado antes');
const parA = (t) => pag.locator('[data-teste="jogo-par-a"]', { hasText: t }).first();
const parB = (t) => pag.locator('[data-teste="jogo-par-b"]', { hasText: t }).first();
await parA('IECA').click(); await parB('tosse').click(); await pag.waitForTimeout(200);
if (await parA('IECA').isDisabled()) ok('pares: o par certo fica ligado');
else falha('par certo não ficou ligado');
await parA('Betabloqueador').click(); await parB('bradicardia').click(); await pag.waitForTimeout(200);
await parA('Espironolactona').click(); await parB('hipercalemia').click(); await pag.waitForTimeout(300);
await verificar(); await continuar();
/* ordem */
for (const t of ['Lesão', 'Remodelamento', 'Falência']) { await pag.locator('[data-teste="jogo-passo"]', { hasText: t }).click(); await pag.waitForTimeout(120); }
await verificar();
if (await pag.locator('[data-teste="jogo-acertou"]').count()) ok('ordem: tocar os passos do primeiro ao último acerta');
else falha('ordem não acertou');
await continuar();
for (const t of ['certa2', 'certa3']) { await opcao(t).click(); await verificar(); await continuar(); }
if (/\d/.test(await texto('[data-teste="jogo-combo"]'))) ok('a sequência de acertos aparece no topo');
else falha('combo não apareceu');
await opcao('certa4').click(); await verificar(); await continuar();
/* a errada volta no fim */
if (/PERGUNTA E1/.test(await texto('[data-teste="jogo-ex-escolha"]'))) ok('o exercício que errou volta no fim da lição');
else falha('a errada não voltou');
await opcao('40%').click(); await verificar(); await continuar();

/* ── 3. o fim ────────────────────────────────────────────────────────── */
await pag.waitForSelector('[data-teste="jogo-fim"]', { timeout: 5000 }).catch(() => {});
await pag.waitForTimeout(1500); await foto('jogo-3-fim');
const xpTela = Number((await texto('[data-teste="jogo-fim-xp"]')).replace(/\D/g, ''));
/* 7 de primeira (errou a E1), maior sequência 8 (+2), não perfeita */
if (xpTela === 19 && /Lição concluída/.test(await texto('[data-teste="jogo-fim-titulo"]'))) ok('fim: 19 XP (10 da lição, 7 de primeira, 2 da sequência de 8)');
else falha('XP do fim: ' + xpTela + ' / ' + await texto('[data-teste="jogo-fim-titulo"]'));
if (/88%/.test(await texto('[data-teste="jogo-fim-acerto"]')) && /1 dia de ofensiva/.test(await texto('[data-teste="jogo-fim-ofensiva"]'))) ok('fim: acerto de primeira (7 de 8) e o primeiro dia de ofensiva');
else falha('fim: ' + await texto('[data-teste="jogo-fim"]'));
await pag.waitForTimeout(600);
let d = await dados();
if (d.jogo && d.jogo.xp === 19 && d.jogo.dias[hoje] === 19) ok('o XP vai para a conta, no total e no dia');
else falha('XP na conta: ' + JSON.stringify(d.jogo));
const b0 = ((d.estudos || [])[0] || { blocos: [] }).blocos[0] || {};
if (b0.licoes === 1 && b0.melhorLicao === 88 && b0.perfeita === false) ok('o bloco guarda a lição feita e o melhor acerto');
else falha('bloco depois da lição: ' + JSON.stringify(b0));
await pag.locator('[data-teste="jogo-continuar"]').click(); await pag.waitForTimeout(500);
if (!(await nos.nth(1).isDisabled())) ok('depois da lição, a próxima da trilha abre');
else falha('a segunda lição continua trancada');
if (/19\/50 XP hoje/.test(await texto('[data-teste="jogo-meta"]')) && /1 dia/.test(await texto('[data-teste="jogo-ofensiva"]'))) ok('o placar mostra a ofensiva e o XP de hoje contra a meta');
else falha('placar: ' + await texto('[data-teste="jogo-placar"]'));
if (await pag.locator('button:has-text("Criar flashcards do que errei")').count()) ok('o que errou no jogo pode virar flashcard');
else falha('sem o botão de flashcards do que errou');

/* ── 4. lição perfeita ───────────────────────────────────────────────── */
await nos.nth(0).click();
await pag.waitForSelector('[data-teste="jogo-ex-ensina"]', { timeout: 8000 }).catch(() => {});
if (!pedidos.filter((p) => p.acao === 'licao' && p.indice === 0).slice(1).length) ok('refazer a lição usa a que já está no aparelho, sem chamar a IA de novo');
else falha('refazer chamou a IA de novo');
await continuar();
await opcao('40%').click(); await verificar(); await continuar();
await opcao('Verdadeiro').click(); await verificar(); await continuar();
await pag.locator('[data-teste="jogo-palavra"]', { hasText: 'tosse' }).click(); await verificar(); await continuar();
for (const [a, b] of [['IECA', 'tosse'], ['Betabloqueador', 'bradicardia'], ['Espironolactona', 'hipercalemia']]) { await parA(a).click(); await parB(b).click(); await pag.waitForTimeout(200); }
await verificar(); await continuar();
for (const t of ['Lesão', 'Remodelamento', 'Falência']) { await pag.locator('[data-teste="jogo-passo"]', { hasText: t }).click(); await pag.waitForTimeout(120); }
await verificar(); await continuar();
for (const t of ['certa2', 'certa3', 'certa4']) { await opcao(t).click(); await verificar(); await continuar(); }
await pag.waitForSelector('[data-teste="jogo-fim"]', { timeout: 5000 }).catch(() => {});
await pag.waitForTimeout(1500); await foto('jogo-4-perfeita');
if (/Lição perfeita/.test(await texto('[data-teste="jogo-fim-titulo"]')) && Number((await texto('[data-teste="jogo-fim-xp"]')).replace(/\D/g, '')) === 25) ok('sem errar nada: "Lição perfeita!" e 25 XP (10 + 8 + 5 + 2)');
else falha('perfeita: ' + await texto('[data-teste="jogo-fim"]'));
await pag.waitForTimeout(500);
d = await dados();
if (d.jogo.xp === 44 && d.estudos[0].blocos[0].perfeita === true && d.estudos[0].blocos[0].licoes === 2 && d.estudos[0].blocos[0].melhorLicao === 100) ok('XP soma (44) e o bloco ganha a coroa de perfeita');
else falha('depois da perfeita: ' + JSON.stringify([d.jogo, d.estudos[0].blocos[0]]));
await pag.locator('[data-teste="jogo-continuar"]').click(); await pag.waitForTimeout(500);

/* ── 5. sem vidas ────────────────────────────────────────────────────── */
await nos.nth(1).click();
await pag.waitForSelector('[data-teste="jogo-ex-escolha"]', { timeout: 8000 }).catch(() => {});
for (let i = 0; i < 5; i += 1) { await opcao('errada').click(); await verificar(); await continuar(); }
await foto('jogo-5-sem-vidas');
if (await pag.locator('[data-teste="jogo-sem-vidas"]').count()) ok('cinco erros: acabam as vidas e a lição para');
else falha('sem vidas não apareceu');
d = await dados();
if (d.jogo.xp === 44 && !(d.estudos[0].blocos[1].licoes > 0)) ok('lição perdida não dá XP nem conta como feita');
else falha('sem vidas mexeu no XP: ' + JSON.stringify(d.jogo));
await pag.locator('[data-teste="jogo-ver-slides"]').click();
await pag.waitForSelector('[data-teste="estudo-player"]', { timeout: 8000 }).catch(() => {});
if (/Tratamento/.test(await texto('[data-teste="estudo-player"]'))) ok('"Ver os slides do bloco" abre os slides daquele bloco para rever');
else falha('slides do bloco não abriram');

if (!errosDaPagina.length) ok('nenhum erro de JavaScript na página');
else falha('erros: ' + errosDaPagina.slice(0, 3).join(' | '));
await navegador.close();
servidor.close();
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
