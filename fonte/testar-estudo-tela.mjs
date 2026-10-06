/* Estudo interativo · a tela (Chromium, com a IA e o Firebase de mentira).
 *
 * O caminho inteiro: texto colado e uma foto do material viram uma aula
 * em blocos com o tempo de cada um; o segundo bloco começa trancado; os
 * slides mostram a foto do material como figura, revelam os pontos um a
 * um, travam o avanço até responder o quiz e ver o caso; "Não entendi"
 * traz outra explicação; o checkpoint corrige por escrito e, no parcial,
 * pergunta de novo só o que faltou; com as três consolidadas o bloco
 * fecha e o seguinte abre; e o que errou vira flashcard.
 *
 *   node testar-estudo-tela.mjs [teste.html]
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';

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

const servidor = http.createServer((req, res) => {
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
await pag.goto(ENDERECO, { waitUntil: 'load' });
await pag.waitForTimeout(1800);
const foto = async (n) => { if (process.env.CAPTURAS) await pag.screenshot({ path: `${process.env.CAPTURAS}/${n}.png` }); };
const dados = () => pag.evaluate(() => JSON.parse(localStorage.getItem('cadencia:v3') || '{}'));

/* ── 1. a aba e a criação ────────────────────────────────────────────── */
const aba = pag.locator('nav button:has-text("Estudo interativo")').first();
if (await aba.count()) ok('a aba "Estudo interativo" está na barra');
else falha('a aba não aparece');
await aba.click();
await pag.waitForTimeout(600);
if (await pag.locator('[data-teste="estudo-criar"]').count()) ok('sem aula ainda, a aba abre direto em "montar uma aula"');
else falha('a criação não apareceu');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFWEXHbQSACj/P8Fu7N9hAAAAAElFTkSuQmCC', 'base64');
await pag.locator('[data-teste="estudo-arquivo"]').setInputFiles([{ name: 'pagina1.png', mimeType: 'image/png', buffer: PNG }]);
await pag.waitForTimeout(1200);
const mats = await pag.locator('[data-teste="estudo-materiais"]').innerText().catch(() => '');
if (/pagina1\.png/.test(mats) && /1 imagem/.test(mats)) ok('a foto do material entra na lista, com o texto lido e a própria foto como imagem');
else falha('materiais: ' + mats);
await pag.locator('[data-teste="estudo-texto"]').fill('A insuficiência cardíaca é uma síndrome clínica. '.repeat(12));
await pag.locator('[data-teste="estudo-montar"]').click();
await pag.waitForSelector('[data-teste="estudo-painel"]', { timeout: 10000 }).catch(() => {});
const pedPlano = pedidos.find((p) => p.acao === 'plano');
if (pedPlano && /=== Material 1: pagina1\.png ===/.test(pedPlano.texto) && /=== Material 2: Texto colado ===/.test(pedPlano.texto)) ok('mais de um material vai junto, cada um marcado');
else falha('texto do plano: ' + (pedPlano ? pedPlano.texto.slice(0, 200) : 'sem pedido'));
if (pedPlano && pedPlano.figuras.length === 1 && pedPlano.figuras[0].id === 'F1' && !pedPlano.figuras[0].dados) ok('a figura vai para a IA só como código e texto em volta, sem a imagem');
else falha('figuras do plano: ' + JSON.stringify(pedPlano && pedPlano.figuras));

/* ── 2. o painel ─────────────────────────────────────────────────────── */
await pag.waitForTimeout(500); await foto('0-painel');
const painel = await pag.locator('[data-teste="estudo-painel"]').innerText().catch(() => '');
if (/Insuficiência cardíaca/.test(painel) && /cerca de 27 ?min/.test(painel) && /2 blocos/.test(painel)) ok('o painel mostra a aula, os blocos e o tempo total estimado (12 + 15 min)');
else falha('painel: ' + painel.slice(0, 300));
const blocos = pag.locator('[data-teste="estudo-bloco"]');
if (await blocos.count() === 2 && await blocos.nth(1).isDisabled()) ok('o segundo bloco começa trancado');
else falha('blocos: ' + await blocos.count());
await pag.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('cadencia:v3')).estudos.length === 1; } catch (e) { return false; } }, null, { timeout: 8000 }).catch(() => {});
const est = (await dados()).estudos || [];
if (est.length === 1 && est[0].blocos.length === 2 && est[0].blocos[0].minutos === 12) ok('a aula entra no índice da conta, com os minutos de cada bloco');
else falha('índice: ' + JSON.stringify(est));

/* ── 3. os slides ────────────────────────────────────────────────────── */
await pag.locator('[data-teste="estudo-continuar"]').click();
await pag.waitForSelector('[data-teste="estudo-slide"]', { timeout: 10000 }).catch(() => {});
const tipo = () => pag.locator('[data-teste="estudo-slide"]').getAttribute('data-tipo');
await pag.waitForTimeout(600); await foto('1-capa');
if (await tipo() === 'capa') ok('o bloco abre na capa, com o gancho');
else falha('primeiro slide: ' + await tipo());
const avancar = pag.locator('[data-teste="estudo-avancar"]');
await avancar.click(); await pag.waitForTimeout(500);
const lis = () => pag.locator('[data-teste="estudo-slide"] li').count();
if (await tipo() === 'pontos' && await lis() === 1) ok('os pontos aparecem um de cada vez');
else falha('pontos: ' + await tipo() + ' / ' + await lis());
const img = await pag.locator('[data-teste="estudo-figura"] img').getAttribute('src').catch(() => '');
if (/^data:image\/jpeg;base64,/.test(img || '')) ok('a foto do próprio material aparece no slide, como figura');
else falha('figura do slide: ' + String(img).slice(0, 60));
const legenda = await pag.locator('[data-teste="estudo-figura"] figcaption').innerText().catch(() => '');
if (legenda === 'A foto do material' && !/pagina1|p\. 1/.test(legenda)) ok('a legenda diz o que a imagem mostra, sem citar de onde ela veio');
else falha('legenda da figura: ' + legenda);
await avancar.click(); await pag.waitForTimeout(250);
await avancar.click(); await pag.waitForTimeout(250);
await pag.waitForTimeout(500); await foto('2-pontos');
if (await lis() === 3 && await tipo() === 'pontos') ok('"Próximo ponto" revela os pontos antes de passar o slide');
else falha('revelar: ' + await lis());
/* tela cheia */
await pag.locator('[data-teste="estudo-tela-cheia"]').click();
await pag.waitForTimeout(400);
const cheia = await pag.evaluate(() => {
  const el = document.querySelector('[data-teste="estudo-cheia"]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { cobre: r.width >= innerWidth - 1 && r.height >= innerHeight - 1, slide: !!el.querySelector('[data-teste="estudo-slide"]'), noCorpo: el.parentElement === document.body };
});
await foto('7-tela-cheia');
if (cheia && cheia.cobre && cheia.slide && cheia.noCorpo) ok('"Tela cheia" põe a aula ocupando a tela toda, com o slide');
else falha('tela cheia: ' + JSON.stringify(cheia));
const ocupa = await pag.evaluate(() => {
  const r = document.querySelector('[data-teste="estudo-slide"]').getBoundingClientRect();
  return { altura: r.height / innerHeight, largura: r.width / innerWidth };
});
if (ocupa.altura > 0.6 && ocupa.largura > 0.85) ok(`na tela cheia o slide estica pela tela (${Math.round(ocupa.altura * 100)}% da altura, ${Math.round(ocupa.largura * 100)}% da largura)`);
else falha('slide na tela cheia: ' + JSON.stringify(ocupa));
await pag.keyboard.press('Escape');
await pag.waitForTimeout(400);
if (!(await pag.locator('[data-teste="estudo-cheia"]').count()) && await pag.locator('[data-teste="estudo-slide"]').count()) ok('Esc sai da tela cheia, no mesmo slide');
else falha('Esc não saiu da tela cheia');
await pag.locator('[data-teste="estudo-tela-cheia"]').click();
await pag.waitForTimeout(300);
await pag.locator('[data-teste="estudo-nao-entendi"]').click();
await pag.waitForSelector('[data-teste="estudo-ajuda"]', { timeout: 5000 }).catch(() => {});
if (/EXPLICAÇÃO MAIS SIMPLES/.test(await pag.locator('[data-teste="estudo-ajuda"]').innerText().catch(() => ''))) ok('"Não entendi" traz a explicação de outro jeito, com analogia');
else falha('"Não entendi" não mostrou nada');
await avancar.click(); await pag.waitForTimeout(500);
if (await tipo() === 'quiz' && await avancar.isDisabled()) ok('no quiz, só avança depois de responder');
else falha('quiz: ' + await tipo());
await pag.locator('[data-teste="estudo-opcao"]').nth(1).click();
await pag.waitForTimeout(300);
await pag.waitForTimeout(400); await foto('3-quiz');
const txtQuiz = await pag.locator('[data-teste="estudo-slide"]').innerText();
if (/Quase\./.test(txtQuiz) && /FE reduzida/.test(txtQuiz) && !(await avancar.isDisabled())) ok('errou o quiz: mostra a certa e a explicação, e libera');
else falha('depois do quiz: ' + txtQuiz.slice(0, 200));
await avancar.click(); await pag.waitForTimeout(500);
if (await tipo() === 'caso' && await avancar.isDisabled()) ok('no caso clínico, primeiro pensa, depois vê a resposta');
else falha('caso: ' + await tipo());
await pag.locator('[data-teste="estudo-ver-caso"]').click();
await avancar.click(); await pag.waitForTimeout(500);
if (await tipo() === 'esquema' && /Remodelamento/.test(await pag.locator('[data-teste="estudo-slide"]').innerText())) ok('o esquema mostra os passos');
else falha('esquema: ' + await tipo());
await pag.keyboard.press('ArrowRight'); await pag.waitForTimeout(500);
if (await tipo() === 'resumo') ok('a seta do teclado também passa o slide');
else falha('seta: ' + await tipo());
await pag.keyboard.press('ArrowRight'); await pag.waitForTimeout(250);
await pag.keyboard.press('ArrowRight'); await pag.waitForTimeout(250);
await avancar.click().catch(() => {}); await pag.waitForTimeout(600);

/* ── 4. o checkpoint ─────────────────────────────────────────────────── */
if (await pag.locator('[data-teste="estudo-checkpoint"]').count()) ok('depois do último slide vem o checkpoint');
else falha('o checkpoint não abriu');
const pergunta = () => pag.locator('[data-teste="estudo-pergunta"]').innerText().catch(() => '');
if (/PERGUNTA UM/.test(await pergunta())) ok('a primeira pergunta é para responder escrevendo');
else falha('pergunta: ' + await pergunta());
const responder = async (t) => {
  await pag.locator('[data-teste="estudo-resposta"]').fill(t);
  await pag.locator('[data-teste="estudo-enviar"]').click();
  await pag.waitForTimeout(700);
};
await responder('É insuficiência cardíaca.');
await foto('4-correcao');
const corr = await pag.locator('[data-teste="estudo-correcao"]').innerText().catch(() => '');
if (/Quase lá/.test(corr) && /Faltou:.*diurético/.test(corr) && /Faltou dizer a conduta/.test(corr)) ok('parcial: mostra o que acertou, o que faltou e explica');
else falha('correção: ' + corr);
if (/REFORÇO: qual diurético/.test(await pergunta())) ok('e pergunta de novo só o que faltou, sem passar para a próxima');
else falha('reforço: ' + await pergunta());
const ped = pedidos.filter((p) => p.acao === 'corrigir');
if (ped.length === 1 && ped[0].resposta === 'É insuficiência cardíaca.') ok('a correção leva a resposta escrita');
else falha('pedidos de correção: ' + JSON.stringify(ped).slice(0, 200));
await responder('Furosemida venosa.');
const ped2 = pedidos.filter((p) => p.acao === 'corrigir')[1] || {};
if ((ped2.antes || []).length === 1) ok('no reforço, a IA recebe a tentativa anterior junto');
else falha('tentativas anteriores: ' + JSON.stringify(ped2.antes));
if (/PERGUNTA DOIS/.test(await pergunta())) ok('consolidou: segue para a pergunta dois');
else falha('depois do reforço: ' + await pergunta());
await responder('Mais pré-carga, mais força.');
await responder('Sistólica tem FE reduzida.');
await pag.waitForSelector('[data-teste="estudo-bloco-feito"]', { timeout: 5000 }).catch(() => {});
await pag.waitForTimeout(800); await foto('5-feito');
if (await pag.locator('[data-teste="estudo-bloco-feito"]').count()) ok('as três consolidadas: o bloco fecha com a comemoração');
else falha('o bloco não fechou');
await pag.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('cadencia:v3')).estudos[0].blocos[0].feito; } catch (e) { return false; } }, null, { timeout: 8000 }).catch(() => {});
const b0 = ((await dados()).estudos || [])[0];
if (b0 && b0.blocos[0].feito && b0.blocos[0].dePrimeira === 2) ok('o progresso fica guardado: bloco feito, 2 de 3 de primeira');
else falha('progresso: ' + JSON.stringify(b0 && b0.blocos[0]));
if (pedidos.some((p) => p.acao === 'bloco' && p.indice === 1)) ok('o bloco seguinte já foi montado enquanto este era estudado');
else falha('o próximo bloco não foi pré-montado');

/* ── 5. o próximo bloco e os flashcards ──────────────────────────────── */
await pag.locator('[data-teste="estudo-proximo-bloco"]').click();
await pag.waitForSelector('[data-teste="estudo-slide"]', { timeout: 8000 }).catch(() => {});
if (await pag.locator('[data-teste="estudo-cheia"]').count()) ok('a tela cheia continua de um bloco para o outro');
else falha('a tela cheia saiu ao trocar de bloco');
if (/Bloco dois/.test(await pag.locator('[data-teste="estudo-slide"]').innerText().catch(() => ''))) ok('"Próximo bloco" abre o bloco 2 na hora, já montado');
else falha('bloco 2 não abriu');
const blocosAntes = pedidos.filter((p) => p.acao === 'bloco').length;
if (blocosAntes === 2) ok('sem pedir o bloco de novo à IA (usou o que já estava guardado)');
else falha('pedidos de bloco: ' + blocosAntes);
await pag.locator('button[aria-label="Voltar aos blocos"]').click();
await pag.waitForTimeout(500);
const blocos2 = pag.locator('[data-teste="estudo-bloco"]');
if (!(await blocos2.nth(1).isDisabled())) ok('no painel, o bloco 2 aparece liberado');
else falha('bloco 2 continua trancado');
await pag.locator('button:has-text("Criar flashcards do que errei")').click();
await pag.waitForFunction(() => { try { return (JSON.parse(localStorage.getItem('cadencia:v3')).flash || []).length > 0; } catch (e) { return false; } }, null, { timeout: 8000 }).catch(() => {});
const flash = (await dados()).flash || [];
const cartao = flash.find((c) => /PERGUNTA UM/.test(c.frente));
if (cartao && /furosemida venosa/.test(cartao.verso) && cartao.pasta === 'Estudo interativo' && flash.length === 1) ok('o que errou de primeira vira flashcard, na pasta "Estudo interativo"');
else falha('flashcards: ' + JSON.stringify(flash));

/* ── 6. transição, mesmo com "reduzir movimento" no sistema ─────────── */
await pag.emulateMedia({ reducedMotion: 'reduce' });
await pag.locator('[data-teste="estudo-bloco"]').first().click();
await pag.waitForSelector('[data-teste="estudo-slide"]', { timeout: 8000 }).catch(() => {});
await pag.waitForTimeout(700);
await pag.locator('[data-teste="estudo-avancar"]').click();
await pag.waitForTimeout(60);
const troca = await pag.evaluate(() => ({
  saindo: !!document.querySelector('[data-saindo]'),
  saida: (document.querySelector('[data-saindo]') && getComputedStyle(document.querySelector('[data-saindo]')).animationName) || '',
  entrada: getComputedStyle(document.querySelector('[data-teste="estudo-slide"]')).animationName,
  slides: document.querySelectorAll('[data-teste="estudo-slide"]').length,
}));
if (troca.saindo && /estudoSai/.test(troca.saida) && /estudoEntra/.test(troca.entrada)) ok('ao passar o slide, o antigo sai deslizando e o novo entra, mesmo com "reduzir movimento" ligado no sistema');
else falha('transição: ' + JSON.stringify(troca));
if (troca.slides === 1) ok('a cópia do slide que sai não conta como slide (nem duplica botões)');
else falha('slides na tela durante a troca: ' + troca.slides);
await pag.waitForTimeout(600);
if (!(await pag.locator('[data-saindo]').count())) ok('a cópia some quando a transição termina');
else falha('a cópia do slide antigo ficou na tela');
await pag.emulateMedia({ reducedMotion: 'no-preference' });
await pag.locator('button[aria-label="Voltar aos blocos"]').click();
await pag.waitForTimeout(400);

/* ── 7. celular ──────────────────────────────────────────────────────── */
await pag.setViewportSize({ width: 390, height: 844 });
await pag.locator('[data-teste="estudo-bloco"]').first().click();
await pag.waitForSelector('[data-teste="estudo-slide"]', { timeout: 8000 }).catch(() => {});
const larg = await pag.evaluate(() => document.documentElement.scrollWidth);
if (larg <= 392) ok('no celular, os slides cabem na largura');
else falha('o slide passa da tela no celular: ' + larg);
if (process.env.CAPTURA_ESTUDO) await pag.screenshot({ path: process.env.CAPTURA_ESTUDO });

if (!errosDaPagina.length) ok('nenhum erro de JavaScript na página');
else falha('erros: ' + errosDaPagina.slice(0, 3).join(' | '));
await navegador.close();
servidor.close();
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
