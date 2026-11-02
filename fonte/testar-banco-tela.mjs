/* O banco de questões na tela, com servidor e Firebase de mentira.
 *
 * O que se confere: a aba aparece para quem tem o plano e some para quem
 * não tem; os filtros mostram as contagens e se encadeiam (área, depois
 * especialidade, depois tema); a questão aparece fechada e só depois da
 * escolha mostra o gabarito e o comentário de todas as alternativas; a
 * divergência com o gabarito oficial aparece; a resposta fica guardada e
 * os filtros "não respondi" e "errei" usam isso; a errada vai para o
 * caderno de erros; o dono vê o painel de montar e põe uma prova no banco
 * em lotes; e no celular nada passa da largura da tela.
 *
 *   node testar-banco-tela.mjs index.html
 */
import { chromium } from 'playwright';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { servirSolto } from './servir-teste.mjs';

/* index.html, o de produção: no teste.html todo mundo é dono e tem plano,
   e aqui o que se confere é justamente quem vê o quê. */
const alvo = path.resolve(process.argv[2] || 'index.html');
if (!fs.existsSync(alvo)) { console.error('não achei', alvo); process.exit(1); }
const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

const FB_APP = 'export function initializeApp(c) { return { c }; }';
const fbAuth = (email) => `
const user = { uid: 'uid-teste', email: '${email}', displayName: 'Teste', getIdToken: async () => 'token-teste' };
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

/* ── o banco de mentira ─────────────────────────────────────────────── */
const qz = (id, area, esp, tema, inst, ano, certa, extra = {}) => ({
  id, prova: id.split('-')[0], instituicao: inst, ano, numero: Number(id.split('-')[1]),
  area, esp, tema,
  enunciado: `Enunciado ${id}: paciente com ${tema}. Qual a melhor conduta?${extra.figura ? ' [[img:ecg1]]' : ''}`,
  alternativas: ['Opção alfa', 'Opção beta', 'Opção gama', 'Opção delta'],
  comentarios: ['Comentário da A', 'Comentário da B', 'Comentário da C', 'Comentário da D'],
  certaIA: extra.certaIA !== undefined ? extra.certaIA : certa, oficial: extra.oficial !== undefined ? extra.oficial : certa,
  certa, anulada: false, divergente: !!extra.divergente, fonte: 'Diretriz brasileira', seguranca: 'alta', avisos: '', figura: !!extra.figura,
});
const QUESTOES = [
  qz('enare2024-1', 'CL', 'Cardiologia', 'Insuficiência cardíaca', 'ENARE', 2024, 1),
  qz('enare2024-2', 'CL', 'Cardiologia', 'Insuficiência cardíaca', 'ENARE', 2024, 0, { certaIA: 2, divergente: true, figura: true }),
  qz('enare2024-3', 'CL', 'Cardiologia', 'Fibrilação atrial', 'ENARE', 2024, 3),
  qz('enare2024-4', 'GO', 'Obstetrícia', 'Pré-eclâmpsia', 'ENARE', 2024, 2),
  qz('usp2023-1', 'PE', 'Respiratório pediátrico', 'Bronquiolite', 'USP-SP', 2023, 1),
];
const RESUMOS = [
  { codigo: 'enare2024', instituicao: 'ENARE', ano: 2024, total: 4, areas: { CL: 3, GO: 1 }, esps: { 'CL|Cardiologia': 3, 'GO|Obstetrícia': 1 }, temas: { 'CL|Cardiologia|Insuficiência cardíaca': 2, 'CL|Cardiologia|Fibrilação atrial': 1, 'GO|Obstetrícia|Pré-eclâmpsia': 1 }, divergentes: 1, anuladas: 0 },
  { codigo: 'usp2023', instituicao: 'USP-SP', ano: 2023, total: 1, areas: { PE: 1 }, esps: { 'PE|Respiratório pediátrico': 1 }, temas: { 'PE|Respiratório pediátrico|Bronquiolite': 1 }, divergentes: 0, anuladas: 0 },
];
const casa = (q, f) => (!f.area || q.area === f.area) && (!f.esp || q.esp === f.esp) && (!f.tema || q.tema === f.tema)
  && (!f.instituicao || q.instituicao === f.instituicao) && (!f.ano || q.ano === f.ano);

const servidor = http.createServer((req, res) => { if (servirSolto(req, res)) return;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(fs.readFileSync(alvo));
});
await new Promise((ok2) => servidor.listen(0, '127.0.0.1', ok2));
const ENDERECO = `http://127.0.0.1:${servidor.address().port}/`;
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const navegador = await chromium.launch({ args: ['--no-sandbox'], ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}) });
const errosDaPagina = [];
const RECURSOS = (banco) => ({ assistente: true, cartoes: true, revisoes: true, provas: true, banco, cronograma: true, rotina: true, amigos: true, metas: true, desempenho: true, simulados: true, progresso: true, treino: false, financeiro: false, estudo: true, motivacao: true });

async function abrir({ email = 'aluna@email.com', banco = true, largura = 1280 } = {}) {
  const ctx = await navegador.newContext({ viewport: { width: largura, height: largura < 600 ? 844 : 900 }, locale: 'pt-BR' });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('cm-sem-pergunta-faculdade', '1');
      localStorage.setItem('cadencia:v3:convite-notificacoes-aparelho', 'teste');
      if (!localStorage.getItem('cadencia:v3')) localStorage.setItem('cadencia:v3', JSON.stringify({ profile: { name: 'Teste', onboarded: true }, theme: 'dark', tema: { visual: 'limpo' } }));
    } catch (e) { /* noop */ }
  });
  await ctx.route('https://www.gstatic.com/firebasejs/**', (rr) => {
    const u = rr.request().url();
    rr.fulfill({ status: 200, contentType: 'text/javascript', body: u.endsWith('firebase-app.js') ? FB_APP : u.endsWith('firebase-auth.js') ? fbAuth(email) : FB_STORE });
  });
  await ctx.route('https://accounts.google.com/gsi/client', (rr) => rr.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  const pedidos = [];
  await ctx.route('**/api/**', (rr) => {
    const u = rr.request().url();
    const corpo = JSON.parse(rr.request().postData() || '{}');
    const responder = (c, s = 200) => rr.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(c) });
    if (u.includes('/api/plano')) return responder({ ok: true, pro: true, plano: 'anual', validoAte: Date.now() + 86400000, recursos: RECURSOS(banco) });
    if (u.includes('/api/banco')) {
      pedidos.push(corpo);
      if (corpo.acao === 'filtros') return responder({ ok: true, provas: RESUMOS });
      if (corpo.acao === 'buscar') {
        const todas = QUESTOES.filter((q) => casa(q, corpo.filtros || {}));
        const i = corpo.cursor ? todas.findIndex((q) => q.id === corpo.cursor) + 1 : 0;
        const pag = todas.slice(i, i + 2);           // páginas de 2, para exercitar o "buscar mais"
        return responder({ ok: true, questoes: pag, cursor: pag.length ? pag[pag.length - 1].id : '', fim: i + 2 >= todas.length });
      }
      if (corpo.acao === 'fontes') return responder({ ok: true, provas: [{ codigo: 'sus2025', prova: 'SUS-SP 2025', questoes: 30, noBanco: false }] });
      if (corpo.acao === 'indexar') {
        const proximo = (corpo.inicio || 0) + 25;
        return responder(proximo < 30 ? { ok: true, feitas: 25, total: 30, proximo, fim: false } : { ok: true, feitas: 30, total: 30, fim: true, resumo: { divergentes: 2 } });
      }
    }
    return responder({ ok: true });
  });
  const pag = await ctx.newPage();
  pag.on('pageerror', (e) => errosDaPagina.push(e.message));
  await pag.goto(ENDERECO, { waitUntil: 'load' });
  await pag.waitForTimeout(1800);
  return { ctx, pag, pedidos };
}
const irParaBanco = async (pag) => {
  const menu = pag.locator('button[aria-label="Abrir menu"]').first();
  if (await menu.count() && await menu.isVisible()) { await menu.click(); await pag.waitForTimeout(400); }
  const aba = pag.locator('nav button:has-text("Banco de questões")').first();
  if (!(await aba.count())) return false;
  await aba.click();
  await pag.waitForTimeout(700);
  return true;
};
const esperar = async (pag, fn, ms = 5000) => {
  const ate = Date.now() + ms;
  while (Date.now() < ate) { if (await fn()) return true; await pag.waitForTimeout(100); }
  return false;
};
const textoBanco = (pag) => pag.evaluate(() => (document.querySelector('[data-teste="banco"]') || {}).innerText || '');
const dados = (pag) => pag.evaluate(() => JSON.parse(localStorage.getItem('cadencia:v3') || '{}'));

/* ── sem o plano: sem aba ───────────────────────────────────────────── */
{
  const { ctx, pag } = await abrir({ banco: false });
  if (!(await irParaBanco(pag))) ok('sem o recurso liberado, a aba Banco de questões não aparece');
  else falha('a aba aparece sem o recurso');
  await ctx.close();
}

/* ── assinante, no computador ───────────────────────────────────────── */
{
  const { ctx, pag, pedidos } = await abrir();
  if (await irParaBanco(pag)) ok('com o plano, a aba aparece no menu e abre');
  else falha('aba não encontrada');
  await esperar(pag, async () => /5 questões de 2 provas/.test(await textoBanco(pag)));
  if (/5 questões de 2 provas no banco/.test(await textoBanco(pag))) ok('o topo diz quantas questões e provas o banco tem');
  else falha('resumo: ' + (await textoBanco(pag)).slice(0, 300));
  if (!(await pag.locator('[data-teste="banco-montar"]').count())) ok('quem não é o dono não vê o painel de montar o banco');
  else falha('painel do dono visível para assinante');

  /* filtros encadeados */
  const opcoesArea = await pag.locator('[data-teste="filtro-area"] option').allInnerTexts();
  if (opcoesArea.some((t) => /Clínica \(3\)/.test(t)) && opcoesArea.some((t) => /Pediatria \(1\)/.test(t))) ok('o filtro de área mostra a contagem de cada uma');
  else falha('opções de área: ' + opcoesArea.join(' | '));
  if (await pag.locator('[data-teste="filtro-esp"]').isDisabled()) ok('especialidade fica travada até escolher a área');
  else falha('especialidade destravada sem área');
  await pag.selectOption('[data-teste="filtro-area"]', 'CL');
  const esps = await pag.locator('[data-teste="filtro-esp"] option').allInnerTexts();
  if (esps.length === 2 && /Cardiologia \(3\)/.test(esps[1])) ok('escolhida a área, a especialidade lista só as dela, com contagem');
  else falha('especialidades: ' + esps.join(' | '));
  await pag.selectOption('[data-teste="filtro-esp"]', 'Cardiologia');
  const temas = await pag.locator('[data-teste="filtro-tema"] option').allInnerTexts();
  if (temas.some((t) => /Insuficiência cardíaca \(2\)/.test(t)) && temas.some((t) => /Fibrilação atrial \(1\)/.test(t))) ok('e o tema lista os temas da especialidade, com contagem');
  else falha('temas: ' + temas.join(' | '));
  if (/3 questões neste filtro/.test(await pag.locator('[data-teste="banco-contagem"]').innerText())) ok('a contagem do filtro acompanha a escolha');
  else falha('contagem: ' + await pag.locator('[data-teste="banco-contagem"]').innerText());
  const anos = await pag.locator('[data-teste="filtro-ano"] option').allInnerTexts();
  if (anos.includes('2024') && anos.includes('2023')) ok('o filtro de ano lista os anos das provas do banco');
  else falha('anos: ' + anos.join(' | '));

  /* treino */
  await pag.locator('[data-teste="banco"] button:has-text("Começar")').click();
  await esperar(pag, async () => (await pag.locator('[data-teste="alternativa-A"]').count()) > 0);
  const busca = pedidos.find((p) => p.acao === 'buscar');
  if (busca && busca.filtros.area === 'CL' && busca.filtros.esp === 'Cardiologia' && busca.token === 'token-teste') ok('a busca vai ao servidor com os filtros e o token da conta');
  else falha('pedido de busca: ' + JSON.stringify(busca));
  let t = await textoBanco(pag);
  if (/ENARE 2024 · questão 1/.test(t) && /Clínica/.test(t) && /Insuficiência cardíaca/.test(t)) ok('a questão mostra prova, ano, número, área e tema');
  else falha('meta da questão: ' + t.slice(0, 400));
  if (!/Comentário da A/.test(t) && !(await pag.locator('[data-teste="banco-gabarito"]').count())) ok('antes de responder, nem gabarito nem comentário aparecem');
  else falha('gabarito visível antes de responder');

  await pag.locator('[data-teste="alternativa-C"]').click();
  await pag.waitForTimeout(200);
  t = await textoBanco(pag);
  if (/Você marcou C\. A resposta é B\./.test(t) && /Comentário da A/.test(t) && /Comentário da D/.test(t)) ok('ao errar: diz o que marcou, a certa, e mostra o comentário de todas as alternativas');
  else falha('depois de responder: ' + t.slice(0, 500));
  if (/Gabarito oficial da banca: B/.test(t) && /consenso firme · Diretriz brasileira/.test(t)) ok('mostra o gabarito oficial e a segurança e a fonte do comentário');
  else falha('oficial/segurança: ' + t.slice(0, 500));
  await pag.waitForTimeout(1900);          // o app grava no disco 1,5 s depois da última mudança
  let d = await dados(pag);
  if (d.banco && d.banco.r && d.banco.r['enare2024-1'] === 'C0CL') ok('a resposta fica guardada na conta no formato curto (C, errou, clínica)');
  else falha('resposta guardada: ' + JSON.stringify(d.banco));
  await pag.locator('[data-teste="banco"] button:has-text("Mandar para o caderno de erros")').click();
  await pag.waitForTimeout(1900);
  d = await dados(pag);
  const ficha = (d.erros || []).find((e) => e.id === 'b-enare2024-1');
  if (ficha && /B\) Opção beta/.test(ficha.certa) && /C\) Opção gama/.test(ficha.marquei) && ficha.fonte === 'ENARE 2024') ok('a errada vai para o caderno de erros com o que marcou, a certa e a prova');
  else falha('ficha no caderno: ' + JSON.stringify(ficha));

  /* questão divergente, com figura */
  await pag.locator('[data-teste="banco"] button:has-text("Próxima")').click();
  await pag.waitForTimeout(300);
  t = await textoBanco(pag);
  if (/questão 2/.test(t) && /tem uma figura/.test(t) && !/\[\[img/.test(t)) ok('questão com figura: aviso no lugar da imagem, sem o marcador cru');
  else falha('figura: ' + t.slice(0, 400));
  await pag.locator('[data-teste="alternativa-A"]').click();
  await pag.waitForTimeout(200);
  t = await textoBanco(pag);
  if (/Você acertou\./.test(t) && (await pag.locator('[data-teste="banco-divergente"]').count()) && /oficial é A, mas o comentário .* defende C/.test(t)) ok('na divergente, acerto pelo gabarito oficial, com o aviso de que o comentário defende outra letra');
  else falha('divergente: ' + t.slice(0, 600));
  if (/Nesta sessão: 1 de 2 \(50%\)/.test(t)) ok('o placar da sessão soma');
  else falha('placar: ' + t.slice(-300));

  /* a terceira vem de outra página do servidor */
  await pag.locator('[data-teste="banco"] button:has-text("Próxima")').click();
  await esperar(pag, async () => /questão 3/.test(await textoBanco(pag)));
  if (/Fibrilação atrial/.test(await textoBanco(pag)) && pedidos.filter((p) => p.acao === 'buscar').length >= 2) ok('acabou a página, busca a próxima sozinho');
  else falha('segunda página: ' + (await textoBanco(pag)).slice(0, 300));

  /* só as que não respondi */
  await pag.selectOption('[data-teste="filtro-status"]', 'nao');
  await pag.locator('[data-teste="banco"] button:has-text("Recomeçar com estes filtros")').click();
  await esperar(pag, async () => /questão 3/.test(await textoBanco(pag)));
  if (/questão 3/.test(await textoBanco(pag))) ok('"só as que não respondi" pula a 1 e a 2, já respondidas');
  else falha('não respondidas: ' + (await textoBanco(pag)).slice(0, 300));
  await pag.selectOption('[data-teste="filtro-status"]', 'errei');
  await pag.locator('[data-teste="banco"] button:has-text("Recomeçar com estes filtros")').click();
  await esperar(pag, async () => /questão 1/.test(await textoBanco(pag)));
  t = await textoBanco(pag);
  if (/questão 1/.test(t) && /Você marcou C/.test(t)) ok('"só as que errei" traz a 1, já com a resposta que a pessoa deu');
  else falha('erradas: ' + t.slice(0, 300));

  /* acerto por área */
  if (/Seu acerto no banco, por área/i.test(t) && /50%/.test(t) && /1 de 2/.test(t)) ok('o acerto por área soma o que foi respondido');
  else falha('acerto por área: ' + t.slice(-400));
  await ctx.close();
}

/* ── o dono monta o banco ───────────────────────────────────────────── */
{
  const { ctx, pag, pedidos } = await abrir({ email: 'joseeduardo1616@gmail.com' });
  await irParaBanco(pag);
  await esperar(pag, async () => /SUS-SP 2025/.test(await textoBanco(pag)));
  if (await pag.locator('[data-teste="banco-montar"]').count() && /fora do banco/.test(await textoBanco(pag))) ok('o dono vê o painel com as provas publicadas e o que está fora do banco');
  else falha('painel do dono: ' + (await textoBanco(pag)).slice(-400));
  await pag.locator('[data-teste="banco-montar"] button:has-text("Pôr no banco")').click();
  const botao = pag.locator('[data-teste="banco-montar"] button:has-text("Classificar e pôr no banco")');
  if (await botao.isDisabled()) ok('sem banca e ano, o botão de classificar fica travado');
  else falha('botão destravado sem banca e ano');
  await pag.locator('[data-teste="banco-montar"] input[placeholder="ex.: ENARE"]').fill('SUS-SP');
  await pag.locator('[data-teste="banco-montar"] input[placeholder="ex.: 2024"]').fill('2025');
  await pag.locator('[data-teste="banco-montar"] textarea').fill('1-A 2-B 3-C');
  await botao.click();
  await esperar(pag, async () => pedidos.filter((p) => p.acao === 'indexar').length >= 2 && /Gabarito oficial \(cole/.test(await textoBanco(pag)) === false);
  const idx = pedidos.filter((p) => p.acao === 'indexar');
  if (idx.length === 2 && idx[0].inicio === 0 && idx[1].inicio === 25 && idx[0].instituicao === 'SUS-SP' && idx[0].ano === 2025 && idx[0].gabarito === '1-A 2-B 3-C') ok('classificar chama o servidor em lotes (0 e 25), com banca, ano e gabarito');
  else falha('lotes: ' + JSON.stringify(idx));
  await ctx.close();
}

/* ── no celular ─────────────────────────────────────────────────────── */
{
  const { ctx, pag } = await abrir({ largura: 390 });
  await irParaBanco(pag);
  await esperar(pag, async () => /5 questões/.test(await textoBanco(pag)));
  await pag.locator('[data-teste="banco"] button:has-text("Começar")').click();
  await esperar(pag, async () => (await pag.locator('[data-teste="alternativa-A"]').count()) > 0);
  await pag.locator('[data-teste="alternativa-B"]').click();
  await pag.waitForTimeout(300);
  const larg = await pag.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  const caixa = await pag.locator('[data-teste="alternativa-A"]').boundingBox();
  if (larg[0] === larg[1] && caixa && caixa.x >= 0 && caixa.x + caixa.width <= 390) ok('no celular, filtros, questão e comentários cabem na largura, sem rolagem lateral');
  else falha('celular: ' + larg.join('/') + ' ' + JSON.stringify(caixa));
  await ctx.close();
}

await navegador.close();
servidor.close();
if (!errosDaPagina.length) ok('nenhum erro de JavaScript na página');
else falha('erros: ' + [...new Set(errosDaPagina)].slice(0, 3).join(' | '));
console.log(passos.join('\n'));
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
