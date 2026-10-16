/* Painel de motivação · a tela (Chromium, com a IA e o Firebase de mentira).
 *
 * O caminho: a aba abre com o convite; a conversa faz uma pergunta por vez,
 * aceita resposta, sugestão e "Pular"; com 3 respostas já dá para montar o
 * painel; o painel mostra o resumo e os cartões por categoria, com filtro e
 * favorito; dá para acrescentar um motivo próprio; "Preciso de motivação
 * agora" pergunta como a pessoa está, traz a mensagem e a ação, que leva ao
 * Foco; os cartões passam um a um; e o Hoje mostra um motivo do dia.
 *
 *   node testar-motivacao-tela.mjs [teste.html]
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { servirSolto } from './servir-teste.mjs';

const alvo = path.resolve(process.argv[2] || 'teste.html');
const erros = [];
const ok = (m) => console.log('ok   ' + m);
const falha = (m) => { console.log('FALHA ' + m); erros.push(m); };

const FB_AUTH = `
const user = { uid: 'u', email: 't@e.com', getIdToken: async () => 'tk' };
export function getAuth() { return { currentUser: user }; }
export function onAuthStateChanged(a, cb) { setTimeout(() => cb(user), 30); return () => {}; }
export async function setPersistence() {}
export const browserLocalPersistence = {}; export const browserSessionPersistence = {};
export async function signOut() {} export async function updateProfile() {}
export class GoogleAuthProvider { setCustomParameters() {} }
export async function getRedirectResult() { return null; }`;
const FB_STORE = 'export function getFirestore() { return {}; } export function doc() { return {}; } export async function setDoc() {} export function onSnapshot() { return () => {}; }';

const PERGUNTAS = ['Por que você escolheu medicina?', 'Por quem você estuda?', 'Você tem fé ou religião que te sustenta? Pode pular.', 'Qual o seu sonho de especialidade?'];
const pedidos = [];
const servidor = http.createServer((q, r) => { if (servirSolto(q, r)) return; r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(fs.readFileSync(alvo)); });
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const navegador = await chromium.launch({ args: ['--no-sandbox'], ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}) });
const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => {
  if (location.protocol === 'about:' || sessionStorage.getItem('semeado')) return;
  sessionStorage.setItem('semeado', '1');
  localStorage.setItem('cadencia:v3:convite-notificacoes-aparelho', 'teste');
  localStorage.setItem('cadencia:v3', JSON.stringify({ profile: { name: 'Ana', onboarded: true, examDate: '2027-03-10' }, tema: { versaoVisual: 2 } }));
});
await ctx.route('https://www.gstatic.com/firebasejs/**', (r) => {
  const u = r.request().url();
  r.fulfill({ status: 200, contentType: 'text/javascript', body: u.endsWith('firebase-app.js') ? 'export function initializeApp(c) { return { c }; }' : u.endsWith('firebase-auth.js') ? FB_AUTH : FB_STORE });
});
await ctx.route('**/api/**', (r) => {
  let corpo = {};
  try { corpo = JSON.parse(r.request().postData() || '{}'); } catch (e) { /* GET */ }
  const resp = (j) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) });
  if (!r.request().url().includes('/api/motivacao-ia')) return resp({ ok: true });
  pedidos.push(corpo);
  if (corpo.acao === 'pergunta') {
    const n = (corpo.entrevista || []).length;
    return resp({ ok: true, pergunta: PERGUNTAS[n] || 'Obrigado, vou montar seu painel.', sugestoes: n === 0 ? ['Minha avó', 'Quero cuidar de gente'] : [], fim: n >= PERGUNTAS.length });
  }
  if (corpo.acao === 'painel') {
    return resp({ ok: true, resumo: 'Você estuda pela vó Lurdes e pelo sonho da cardio.', cartoes: [
      { categoria: 'pessoas', titulo: 'Pela vó Lurdes', texto: 'Ela cuidou de você. Agora é a sua vez de cuidar.', emoji: '👵' },
      { categoria: 'futuro', titulo: 'Primeiro dia no InCor', texto: 'Imagina o jaleco com seu nome.', emoji: '🩺' },
      { categoria: 'conquistas', titulo: 'Você já venceu', texto: 'Escola pública e passou em medicina.', emoji: '🏆' },
      { categoria: 'lembrete', titulo: 'Quando der medo', texto: 'Medo é sinal de que importa.', emoji: '🫶' },
    ] });
  }
  if (corpo.acao === 'agora') return resp({ ok: true, mensagem: 'MENSAGEM PARA AGORA: lembra da vó Lurdes.', acao: 'foco', acaoTexto: 'Um bloco de 25 minutos.', apoio: false });
  return resp({ ok: true });
});
const pag = await ctx.newPage();
const errosDaPagina = [];
pag.on('pageerror', (e) => errosDaPagina.push(e.message));
await pag.goto(`http://127.0.0.1:${servidor.address().port}/`, { waitUntil: 'load' });
await pag.waitForTimeout(1500);
const foto = async (n) => { if (process.env.CAPTURAS) await pag.screenshot({ path: `${process.env.CAPTURAS}/${n}.png` }); };
const dados = () => pag.evaluate(() => JSON.parse(localStorage.getItem('cadencia:v3') || '{}'));

/* ── 1. a aba e a conversa ───────────────────────────────────────────── */
const aba = pag.locator('nav button:has-text("Motivação")').first();
if (await aba.count()) ok('a aba "Motivação" está na barra');
else falha('a aba não aparece');
await aba.click();
await pag.waitForTimeout(500);
if (await pag.locator('[data-teste="motivacao-inicio"]').count()) ok('sem painel ainda, a aba convida para a conversa');
else falha('o convite não apareceu');
let falharPrimeira = true;
await ctx.route('**/api/motivacao-ia', async (r) => {
  if (falharPrimeira) { falharPrimeira = false; return r.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ erro: 'A IA não conseguiu formular a pergunta. Tente de novo.' }) }); }
  return r.fallback();
});
await pag.locator('[data-teste="motivacao-comecar"]').click();
await pag.waitForTimeout(800);
const tentar = pag.locator('[data-teste="motivacao-entrevista"] button:has-text("Tentar de novo")');
if (await tentar.count()) ok('se a IA falhar, a conversa mostra "Tentar de novo" em vez de ficar vazia');
else falha('sem botão de tentar de novo depois do erro');
await tentar.click().catch(() => {});
await pag.waitForSelector('[data-teste="motivacao-pergunta"]', { timeout: 6000 }).catch(() => {});
const pergunta = () => pag.locator('[data-teste="motivacao-pergunta"]').innerText().catch(() => '');
if (/Por que você escolheu medicina/.test(await pergunta())) ok('a IA faz a primeira pergunta');
else falha('primeira pergunta: ' + await pergunta());
await pag.locator('button:has-text("Minha avó")').click();
const valor = await pag.locator('[data-teste="motivacao-resposta"]').inputValue();
if (valor === 'Minha avó') ok('tocar numa sugestão escreve a resposta');
else falha('sugestão: ' + valor);
await pag.locator('[data-teste="motivacao-resposta"]').fill('Por causa da minha avó Lurdes.');
await pag.locator('[data-teste="motivacao-responder"]').click();
await pag.waitForFunction(() => /Por quem/.test((document.querySelector('[data-teste="motivacao-pergunta"]') || {}).innerText || ''), null, { timeout: 6000 }).catch(() => {});
if (/Por quem você estuda/.test(await pergunta())) ok('respondeu: vem a próxima pergunta');
else falha('segunda pergunta: ' + await pergunta());
const p2 = pedidos.filter((p) => p.acao === 'pergunta')[1] || {};
if ((p2.entrevista || [])[0] && /avó Lurdes/.test(p2.entrevista[0].r) && p2.nome === 'Ana') ok('a IA recebe a resposta anterior e o nome');
else falha('pedido da segunda pergunta: ' + JSON.stringify(p2));
await pag.locator('[data-teste="motivacao-resposta"]').fill('Pela minha mãe e pelo meu irmão.');
await pag.locator('[data-teste="motivacao-responder"]').click();
await pag.waitForFunction(() => /fé/.test((document.querySelector('[data-teste="motivacao-pergunta"]') || {}).innerText || ''), null, { timeout: 6000 }).catch(() => {});
await pag.locator('button:has-text("Pular")').click();
await pag.waitForFunction(() => /sonho/.test((document.querySelector('[data-teste="motivacao-pergunta"]') || {}).innerText || ''), null, { timeout: 6000 }).catch(() => {});
await pag.waitForFunction(() => { try { return (JSON.parse(localStorage.getItem('cadencia:v3')).motivacao.entrevista || []).length === 3; } catch (e) { return false; } }, null, { timeout: 8000 }).catch(() => {});
await foto('m0-conversa');
const ent = ((await dados()).motivacao || {}).entrevista || [];
if (ent.length === 3 && ent[2].pulou === true) ok('"Pular" segue a conversa, e a pergunta fica marcada como pulada');
else falha('entrevista guardada: ' + JSON.stringify(ent));
if (!(await pag.locator('button:has-text("Montar meu painel já")').count())) ok('com só 2 respostas ainda não dá para montar o painel');
else falha('ofereceu montar com 2 respostas');
await pag.locator('[data-teste="motivacao-resposta"]').fill('Cardiologia no InCor.');
await pag.locator('[data-teste="motivacao-responder"]').click();
await pag.waitForSelector('[data-teste="motivacao-montar"]', { timeout: 6000 }).catch(() => {});
if (await pag.locator('button:has-text("Montar meu painel já")').count()) ok('com 3 respostas aparece "Montar meu painel já"');
else falha('não ofereceu montar com 3 respostas');

/* ── 2. o painel ─────────────────────────────────────────────────────── */
await pag.locator('[data-teste="motivacao-montar"]').click();
await pag.waitForSelector('[data-teste="motivacao-painel"]', { timeout: 6000 }).catch(() => {});
if (/vó Lurdes/.test(await pag.locator('[data-teste="motivacao-resumo"]').innerText().catch(() => ''))) ok('o painel abre com o resumo dos motivos');
else falha('resumo do painel');
await pag.waitForTimeout(400); await foto('m1-painel');
const cartoes = pag.locator('[data-teste="motivacao-cartao"]');
if (await cartoes.count() === 4) ok('os cartões aparecem, com a categoria de cada um');
else falha('cartões: ' + await cartoes.count());
await pag.locator('[data-teste="motivacao-filtros"] button:has-text("Pessoas")').click();
if (await cartoes.count() === 1) ok('o filtro por categoria mostra só os daquele tipo');
else falha('filtro: ' + await cartoes.count());
await cartoes.first().locator('button[aria-label="Favoritar"]').click();
await pag.locator('[data-teste="motivacao-filtros"] button:has-text("Favoritos")').click();
if (await cartoes.count() === 1 && /vó Lurdes/.test(await cartoes.first().innerText())) ok('o coração guarda nos favoritos');
else falha('favoritos: ' + await cartoes.count());
await pag.locator('[data-teste="motivacao-filtros"] button:has-text("Todos")').click();
await pag.locator('[data-teste="motivacao-novo"]').fill('Meu pai vai me ver de jaleco.');
await pag.locator('button:has-text("Acrescentar")').click();
await pag.waitForTimeout(300);
if (await cartoes.count() === 5 && /Meu pai vai me ver de jaleco/.test(await pag.locator('[data-teste="motivacao-painel"]').innerText())) ok('dá para acrescentar um motivo próprio');
else falha('motivo próprio: ' + await cartoes.count());
await pag.waitForFunction(() => { try { const m = JSON.parse(localStorage.getItem('cadencia:v3')).motivacao; return m.painel && m.painel.cartoes.some((c) => c.fav) && m.meus.length === 1; } catch (e) { return false; } }, null, { timeout: 8000 }).catch(() => {});
const mot = (await dados()).motivacao || {};
if (mot.painel && mot.painel.cartoes.length === 4 && mot.painel.cartoes.some((c) => c.fav) && mot.meus.length === 1) ok('o painel, o favorito e o motivo próprio ficam guardados na conta');
else falha('guardado: ' + JSON.stringify(mot).slice(0, 300));

/* ── 3. preciso de motivação agora ───────────────────────────────────── */
await pag.locator('[data-teste="motivacao-agora"]').click();
await pag.waitForSelector('[data-teste="motivacao-agora-tela"]', { timeout: 4000 }).catch(() => {});
if (await pag.locator('[data-teste="motivacao-agora-tela"]').count()) ok('"Preciso de motivação agora" abre na tela toda');
else falha('a tela de agora não abriu');
await pag.locator('[data-teste="motivacao-humor"]:has-text("Cansado")').click();
await pag.locator('[data-teste="motivacao-pedir"]').click();
await pag.waitForSelector('[data-teste="motivacao-mensagem"]', { timeout: 6000 }).catch(() => {});
if (/MENSAGEM PARA AGORA/.test(await pag.locator('[data-teste="motivacao-mensagem"]').innerText().catch(() => ''))) ok('a IA responde para como a pessoa está agora');
else falha('mensagem do agora');
await pag.waitForTimeout(500); await foto('m2-agora');
const pAgora = pedidos.find((p) => p.acao === 'agora') || {};
if (pAgora.humor === 'cansado' && (pAgora.cartoes || []).length === 5 && pAgora.momento && pAgora.momento.diasParaProva > 0) ok('vai junto: o humor, os cartões (inclusive o próprio) e quantos dias faltam para a prova');
else falha('pedido do agora: ' + JSON.stringify(pAgora).slice(0, 300));
const antes = await pag.locator('[data-teste="motivacao-agora-tela"] [data-teste="motivacao-cartao"]').innerText().catch(() => '');
await pag.locator('[data-teste="motivacao-proximo"]').click();
await pag.waitForTimeout(300);
const depois = await pag.locator('[data-teste="motivacao-agora-tela"] [data-teste="motivacao-cartao"]').innerText().catch(() => '');
if (antes && depois && antes !== depois) ok('"Outro motivo" passa para o próximo cartão');
else falha('carrossel: ' + antes + ' / ' + depois);
await pag.locator('[data-teste="motivacao-acao"]').click();
await pag.waitForTimeout(500);
if (!(await pag.locator('[data-teste="motivacao-agora-tela"]').count()) && /Foco/.test(await pag.locator('main').innerText())) ok('a ação "começar um bloco no Foco" leva ao Foco');
else falha('ação não levou ao Foco');

/* ── 4. o motivo do dia no Hoje ──────────────────────────────────────── */
await pag.locator('nav button:has-text("Hoje")').first().click();
await pag.waitForTimeout(500);
const dia = await pag.locator('[data-teste="motivo-do-dia"]').innerText().catch(() => '');
if (/Lembra por quê/i.test(dia)) ok('o Hoje mostra um motivo do painel por dia');
else falha('motivo do dia: ' + dia);

if (!errosDaPagina.length) ok('nenhum erro de JavaScript na página');
else falha('erros: ' + errosDaPagina.slice(0, 3).join(' | '));
await navegador.close();
servidor.close();
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
