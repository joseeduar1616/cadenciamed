/* As conversas guardadas, por pastas, na tela (Assistente e Mentoria).
 *
 * O servidor de conversas é de mentira (memória do teste), com as mesmas
 * ações da rota: listar por modo, abrir, salvar, renomear, mover, criar,
 * renomear e apagar pasta, apagar. O que se confere:
 * - cada conversa do Assistente vai guardada com modo "conversa", e uma
 *   conversa nova vira outra conversa, e não sobrescreve a anterior;
 * - a lista mostra as conversas, cria pasta, move para a pasta, renomeia,
 *   abre de novo a conversa com as mensagens;
 * - a Mentoria tem a lista dela (só as de modo "mentoria"), abre uma
 *   conversa antiga e continua nela (mesmo id);
 * - a mentoria recebe o plano da pessoa inteiro e a sequência do
 *   cronograma, que é o que faz ela seguir o plano em vez de inventar.
 *
 *   node testar-conversas-tela.mjs [arquivo.html]
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

function inicio() {
  try {
    localStorage.setItem('cm-sem-pergunta-faculdade', '1');
    localStorage.setItem('cadencia:v3:convite-notificacoes-aparelho', 'teste');
    const d = new Date();
    const hoje = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!localStorage.getItem('cadencia:v3')) {
      localStorage.setItem('cadencia:v3', JSON.stringify({
        profile: { name: 'Teste', onboarded: true, examDate: '2027-03-10' }, theme: 'dark',
        planoArquivo: { nome: 'Plano do teste', itens: [
          { id: 'p0', ordem: 0, dataOriginal: hoje, data: hoje, titulo: 'Cardiologia: insuficiência cardíaca', tipo: 'aula', minutos: 90, situacao: 'pendente' },
          { id: 'p1', ordem: 1, dataOriginal: hoje, data: hoje, titulo: '30 questões de nefrologia', tipo: 'questoes', minutos: 60, situacao: 'pendente' },
        ] },
      }));
    }
  } catch (e) { /* noop */ }
}

/* O servidor de conversas, em memória. */
const banco = { pastas: [], itens: new Map() };
let n = 0;
banco.itens.set('antiga-mentoria', { id: 'antiga-mentoria', titulo: 'Minha rotina de plantão', modo: 'mentoria', pasta: '', atualizadoEm: Date.now() - 86400000,
  mensagens: [{ papel: 'user', texto: 'Quero começar a mentoria.' }, { papel: 'claude', texto: 'Vamos lá. Como é a sua semana de plantões?' }] });
const salvos = [];
function conversas(corpo) {
  const a = corpo.acao;
  const resumo = (c) => ({ id: c.id, titulo: c.titulo, atualizadoEm: c.atualizadoEm, mensagens: c.mensagens.length, pasta: c.pasta, modo: c.modo });
  if (a === 'listar') return { conversas: [...banco.itens.values()].filter((c) => !corpo.modo || c.modo === corpo.modo).sort((x, y) => y.atualizadoEm - x.atualizadoEm).map(resumo), pastas: banco.pastas };
  if (a === 'abrir') { const c = banco.itens.get(corpo.id); return c ? { ...resumo(c), mensagens: c.mensagens } : { erro: 'não achei' }; }
  if (a === 'salvar') {
    salvos.push(corpo);
    const id = corpo.id || `c${++n}`;
    const velho = banco.itens.get(id) || { id, pasta: '', titulo: '' };
    const primeira = corpo.mensagens.find((m) => m.papel === 'user');
    banco.itens.set(id, { ...velho, modo: corpo.modo || 'conversa', mensagens: corpo.mensagens, atualizadoEm: Date.now(), titulo: velho.titulo || (primeira ? primeira.texto.slice(0, 60) : 'Conversa') });
    return { ok: true, id };
  }
  if (a === 'renomear') { const c = banco.itens.get(corpo.id); c.titulo = corpo.titulo; return { ok: true, id: c.id, titulo: c.titulo }; }
  if (a === 'mover') { const c = banco.itens.get(corpo.id); c.pasta = corpo.pasta || ''; if (c.pasta && !banco.pastas.includes(c.pasta)) banco.pastas.push(c.pasta); return { ok: true, id: c.id, pasta: c.pasta }; }
  if (a === 'criarPasta') { if (!banco.pastas.includes(corpo.nome)) banco.pastas.push(corpo.nome); return { ok: true, pastas: banco.pastas }; }
  if (a === 'renomearPasta') { banco.pastas = banco.pastas.map((p) => (p === corpo.de ? corpo.para : p)); for (const c of banco.itens.values()) if (c.pasta === corpo.de) c.pasta = corpo.para; return { ok: true, pastas: banco.pastas }; }
  if (a === 'apagarPasta') { banco.pastas = banco.pastas.filter((p) => p !== corpo.nome); for (const c of banco.itens.values()) if (c.pasta === corpo.nome) c.pasta = ''; return { ok: true, pastas: banco.pastas }; }
  if (a === 'apagar') { banco.itens.delete(corpo.id); return { ok: true }; }
  return { erro: 'ação' };
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
const pedidosIA = [];

const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' });
await ctx.addInitScript(inicio);
await ctx.route('https://www.gstatic.com/firebasejs/**', (rr) => {
  const u = rr.request().url();
  rr.fulfill({ status: 200, contentType: 'text/javascript', body: u.endsWith('firebase-app.js') ? FB_APP : u.endsWith('firebase-auth.js') ? FB_AUTH : FB_STORE });
});
await ctx.route('https://accounts.google.com/gsi/client', (rr) => rr.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
await ctx.route('**/api/**', (rr) => {
  const u = rr.request().url();
  const corpo = JSON.parse(rr.request().postData() || '{}');
  const responder = (j) => rr.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) });
  if (u.includes('/api/plano-estudo')) return responder({ ok: true });
  if (u.includes('/api/plano')) return responder({ ok: true, pro: true, plano: 'anual', validoAte: Date.now() + 86400000, recursos: RECURSOS });
  if (u.includes('/api/conversas')) return responder(conversas(corpo));
  if (u.includes('/api/assistente')) {
    pedidosIA.push(corpo);
    return responder(corpo.modo === 'mentoria'
      ? { texto: 'Hoje o seu plano pede insuficiência cardíaca e depois as questões de nefrologia.', opcoes: [], perfil: {}, plano: null, cortado: false }
      : { texto: 'Hoje, comece pelas revisões atrasadas.', cortado: false });
  }
  return responder({ ok: true });
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
const irParaAssistente = async () => {
  const menu = pag.locator('button[aria-label="Abrir menu"]').first();
  if (await menu.count() && await menu.isVisible()) { await menu.click(); await pag.waitForTimeout(300); }
  await pag.locator('nav button:has-text("Assistente")').first().click();
  await pag.waitForTimeout(700);
};
const texto = () => pag.evaluate(() => document.querySelector('main').innerText);
const larguraOk = () => pag.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

await irParaAssistente();

/* ── Assistente: guarda, separa, pastas ─────────────────────────────── */
const perguntar = async (t) => {
  await pag.locator('main input[placeholder="Escreva sua pergunta"]').fill(t);
  await pag.locator('main input[placeholder="Escreva sua pergunta"]').press('Enter');
};
await perguntar('O que eu estudo hoje?');
await esperar(async () => salvos.length >= 1);
if (salvos[0] && salvos[0].modo === 'conversa' && !salvos[0].id && salvos[0].mensagens.length === 2) ok('a primeira resposta guarda a conversa no servidor, marcada como do Assistente');
else falha('salvar 1: ' + JSON.stringify(salvos[0]));

await pag.locator('main button:has-text("Nova")').first().click();
await perguntar('Como está meu ritmo?');
await esperar(async () => salvos.length >= 2);
if (salvos[1] && !salvos[1].id && [...banco.itens.values()].filter((c) => c.modo === 'conversa').length === 2) ok('"Nova" começa outra conversa: a primeira continua guardada separada');
else falha('nova conversa sobrescreveu: ' + JSON.stringify(salvos[1]));

await pag.locator('main button:has-text("Conversas")').first().click();
await esperar(async () => /O que eu estudo hoje/.test(await texto()) && /Como está meu ritmo/.test(await texto()));
const t1 = await texto();
if (/O que eu estudo hoje/.test(t1) && /Como está meu ritmo/.test(t1) && !/Minha rotina de plantão/.test(t1)) ok('a lista do Assistente mostra as duas conversas, e não as da Mentoria');
else falha('lista: ' + t1.slice(0, 400));

await pag.locator('main button:has-text("Nova pasta")').click();
await pag.locator('main input[aria-label="Nome da nova pasta"]').fill('Cardio');
await pag.locator('main input[aria-label="Nome da nova pasta"]').press('Enter');
await esperar(async () => (await pag.locator('main [data-pasta="Cardio"]').count()) > 0);
if (banco.pastas.includes('Cardio') && await pag.locator('main [data-pasta="Cardio"]').count()) ok('cria a pasta pelo campo na própria lista (sem janela do navegador)');
else falha('criar pasta: ' + JSON.stringify(banco.pastas));

const idPrimeira = [...banco.itens.values()].find((c) => /estudo hoje/.test(c.titulo)).id;
await pag.locator(`main [data-conversa="${idPrimeira}"] button[aria-label^="Opções da conversa"]`).click();
await pag.locator(`main [data-conversa="${idPrimeira}"] select`).selectOption('Cardio');
await esperar(async () => (await pag.locator(`main [data-pasta="Cardio"] [data-conversa="${idPrimeira}"]`).count()) > 0);
if (banco.itens.get(idPrimeira).pasta === 'Cardio' && await pag.locator(`main [data-pasta="Cardio"] [data-conversa="${idPrimeira}"]`).count()) ok('move a conversa para a pasta, e ela aparece dentro dela');
else falha('mover: ' + JSON.stringify(banco.itens.get(idPrimeira)));

await pag.locator(`main [data-conversa="${idPrimeira}"] button[aria-label^="Opções da conversa"]`).click();
await pag.locator(`main [data-conversa="${idPrimeira}"] button:has-text("Renomear")`).click();
await pag.locator('main input[aria-label="Nome da conversa"]').fill('Plano de hoje');
await pag.locator('main input[aria-label="Nome da conversa"]').press('Enter');
await esperar(async () => /Plano de hoje/.test(await texto()));
if (banco.itens.get(idPrimeira).titulo === 'Plano de hoje' && /Plano de hoje/.test(await texto())) ok('renomeia a conversa');
else falha('renomear: ' + JSON.stringify(banco.itens.get(idPrimeira)));
if (await larguraOk()) ok('no celular, a lista com pastas cabe na tela sem rolar para o lado');
else falha('lista estoura a largura no celular');

await pag.locator(`main [data-conversa="${idPrimeira}"] button:has-text("Plano de hoje")`).click();
await esperar(async () => /comece pelas revisões atrasadas/.test(await texto()) && /O que eu estudo hoje/.test(await texto()));
await perguntar('E amanhã?');
await esperar(async () => salvos.length >= 3);
if (salvos[2] && salvos[2].id === idPrimeira && salvos[2].mensagens.length === 4) ok('abre a conversa da pasta e continua nela (mesma conversa, sem criar outra)');
else falha('continuar conversa: ' + JSON.stringify(salvos[2] || {}).slice(0, 200));

/* ── Mentoria: lista dela, abrir e continuar, e o plano da pessoa ──────── */
await pag.locator('main button[role="tab"]:has-text("Mentoria de estudo")').click();
await pag.waitForTimeout(500);
await pag.locator('main button:has-text("Conversas")').first().click();
await esperar(async () => /Minha rotina de plantão/.test(await texto()));
const t2 = await texto();
if (/Minha rotina de plantão/.test(t2) && !/Plano de hoje/.test(t2)) ok('a Mentoria tem a lista dela, separada da do Assistente');
else falha('lista da mentoria: ' + t2.slice(0, 400));
await pag.locator('main [data-conversa="antiga-mentoria"] button:has-text("Minha rotina de plantão")').click();
await esperar(async () => /semana de plantões/.test(await texto()));
await pag.locator('main textarea[placeholder="Responda do seu jeito"]').fill('O que faço hoje?');
await pag.locator('main textarea[placeholder="Responda do seu jeito"]').press('Enter');
await esperar(async () => salvos.some((s) => s.modo === 'mentoria'), 8000);
const sm = salvos.find((s) => s.modo === 'mentoria');
if (sm && sm.id === 'antiga-mentoria' && sm.mensagens.length === 4) ok('a Mentoria abre a conversa antiga e guarda a continuação nela');
else falha('salvar mentoria: ' + JSON.stringify(sm || {}).slice(0, 200));

const pm = pedidosIA.find((p) => p.modo === 'mentoria') || {};
const ctxM = String(pm.contexto || '');
if (/ITEM POR ITEM/.test(ctxM) && ctxM.indexOf('Cardiologia: insuficiência cardíaca') < ctxM.indexOf('30 questões de nefrologia') && ctxM.indexOf('30 questões de nefrologia') > 0) ok('a mentora recebe o plano da pessoa inteiro, na ordem, com os títulos do arquivo');
else falha('plano no contexto da mentoria: ' + ctxM.slice(0, 300));
if (/SEQUÊNCIA DO CRONOGRAMA/.test(ctxM) && /Próximas aulas, na ordem:\n- bloco 1 · Epidemiologia: Estudos Epidemiológicos/.test(ctxM) && !/undefined/.test(ctxM)) ok('e a sequência do cronograma, com as próximas aulas na ordem, pelo nome');
else falha('sequência do cronograma: ' + (ctxM.match(/SEQUÊNCIA DO CRONOGRAMA[^]{0,300}/) || [''])[0]);

await pag.locator('main button:has-text("Nova")').first().click();
await pag.waitForTimeout(300);
const t3 = await texto();
if (!/semana de plantões/.test(t3) && /O QUE ELA JÁ SABE DE VOCÊ/i.test(t3)) ok('"Nova" na Mentoria limpa a conversa mas mantém o que ela já sabe e o plano');
else falha('nova na mentoria: plantões=' + /semana de plantões/.test(t3) + ' sabe=' + /já sabe de você/i.test(t3));

if (!errosDaPagina.length) ok('nenhum erro de JavaScript na página');
else falha('erros na página: ' + errosDaPagina.join(' | '));

await ctx.close();
await navegador.close();
servidor.close();
console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
