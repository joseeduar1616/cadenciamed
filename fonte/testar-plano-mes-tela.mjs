/* O plano do mês na aba Treino, no navegador: importar a planilha, o
 * controle do dia, a alimentação com a IA e o que sobrevive ao recarregar.
 *
 * A data é presa em 03/11/2025, uma segunda-feira dentro do período da
 * planilha de mentira (planilha-de-teste.mjs), para "hoje é Treino A" e
 * "cintura só às segundas" serem verificáveis. A IA é trocada por uma
 * resposta pronta: o que se testa aqui é a tela, e a rota tem o teste
 * dela (testar-refeicao-ia.mjs).
 *
 *   node testar-plano-mes-tela.mjs teste.html
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { xlsx, FOLHAS } from './planilha-de-teste.mjs';

const alvo = path.resolve(process.argv[2] || 'teste.html');
const erros = [];
const passos = [];
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
export function onSnapshot(ref, a, b) {
  const cb = typeof a === 'function' ? a : b;
  setTimeout(() => cb({ exists: () => false, metadata: { fromCache: false }, data: () => ({}) }), 40);
  return () => {};
}`;

const ANALISE = {
  itens: [
    { nome: 'Arroz branco cozido', quantidade: '4 col. sopa (100 g)', kcal: 128, proteina: 2.5, carbo: 28.1, gordura: 0.2 },
    { nome: 'Frango grelhado', quantidade: '150 g', kcal: 240, proteina: 45, carbo: 0, gordura: 5.4 },
  ],
  total: { kcal: 368, proteina: 47.5, carbo: 28.1, gordura: 5.6 },
  confianca: 'media',
  observacao: 'O óleo do preparo não aparece na foto.',
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'plano-mes-'));
const arquivoPlanilha = path.join(tmp, 'Plano_Novembro.xlsx');
fs.writeFileSync(arquivoPlanilha, xlsx(FOLHAS));
/* Um PDF de verdade só no começo: quem lê é o pdf.js de mentira abaixo. O
   que se testa é o caminho (reconhecer o PDF pelo conteúdo, tirar o texto,
   mandar para a IA, conferir o que volta), não o pdf.js. */
const arquivoPdf = path.join(tmp, 'Plano_Dezembro.pdf');
fs.writeFileSync(arquivoPdf, '%PDF-1.4\n% plano de mentira\n');
const TEXTO_PDF = 'Plano Dezembro 01/12 a 31/12/2025 Treino A Superior Supino reto 4 6 a 8 2 min';
const PDFJS_FALSO = `window.pdfjsLib = { GlobalWorkerOptions: {}, OPS: {}, getDocument: () => ({ promise: Promise.resolve({
  numPages: 1, getPage: async () => ({ getTextContent: async () => ({ items: [{ str: ${JSON.stringify(TEXTO_PDF)} }] }) }) }) }) };`;
const PLANO_DO_PDF = {
  meta: { titulo: 'Plano Dezembro', inicio: '2025-12-01', fim: '2025-12-31', pesoInicial: 88, perdaAlvo: 3 },
  semana: [{ atividade: 'Treino A', descricao: 'Superior' }],
  plano: { nome: 'Treino · Dezembro', dias: [{ nome: 'Treino A · Superior', exercicios: [{ nome: 'Supino reto', series: 4, reps: '6 a 8', descanso: 120 }] }] },
  cardapio: { refeicoes: [] },
};
const arquivoFoto = path.join(tmp, 'prato.png');
fs.writeFileSync(arquivoFoto, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));

const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const navegador = await chromium.launch({ args: ['--no-sandbox'], ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}) });
const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 }, locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' });
await ctx.addInitScript(() => {
  try {
    const k = 'cadencia:v3:convite-notificacoes-aparelho';
    if (!localStorage.getItem(k)) localStorage.setItem(k, 'teste');
    if (!localStorage.getItem('cadencia:v3')) localStorage.setItem('cadencia:v3', JSON.stringify({ profile: { name: 'Teste', onboarded: true }, theme: 'dark' }));
  } catch (e) { /* noop */ }
});
await ctx.route('https://www.gstatic.com/firebasejs/**', (r) => {
  const u = r.request().url();
  const body = u.endsWith('firebase-app.js') ? FB_APP : u.endsWith('firebase-auth.js') ? FB_AUTH : FB_STORE;
  r.fulfill({ status: 200, contentType: 'text/javascript', body });
});
await ctx.route('https://accounts.google.com/gsi/client', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));

const pedidosIA = [];
const pedidosPlano = [];
await ctx.route('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: PDFJS_FALSO }));
await ctx.route('**/api/**', (r) => {
  const u = r.request().url();
  if (u.includes('/api/plano-ia')) {
    pedidosPlano.push(JSON.parse(r.request().postData() || '{}'));
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ plano: PLANO_DO_PDF }) });
  }
  if (u.includes('/api/refeicao-ia')) {
    pedidosIA.push(JSON.parse(r.request().postData() || '{}'));
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ANALISE) });
  }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
});

const pag = await ctx.newPage();
pag.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
await pag.clock.setFixedTime(new Date('2025-11-03T10:00:00-03:00'));
await pag.goto('file://' + alvo, { waitUntil: 'load' });
await pag.waitForTimeout(1800);
const semConta = pag.locator('button:has-text("usar sem conta")');
if (await semConta.count() > 0 && await semConta.first().isVisible()) { await semConta.first().click(); await pag.waitForTimeout(400); }

const texto = () => pag.evaluate(() => (document.querySelector('main') || document.body).innerText);
const irPara = async (nome) => {
  const menu = pag.locator('button[aria-label="Abrir menu"]').first();
  if (await menu.count() && await menu.isVisible()) { await menu.click(); await pag.waitForTimeout(400); }
  await pag.locator(`nav button:has-text("${nome}")`).first().click();
  await pag.waitForTimeout(600);
};
const vista = async (nome) => {
  await pag.locator('main').getByRole('button', { name: nome, exact: true }).first().click();
  await pag.waitForTimeout(500);
};
/* CAPTURAS=pasta guarda uma foto de cada tela, para conferir o visual. */
const foto = async (nome) => {
  if (!process.env.CAPTURAS) return;
  await pag.screenshot({ path: path.join(process.env.CAPTURAS, nome + '.png'), fullPage: true });
};

try {
  let t = '';
  await irPara('Treino');

  /* ── importar ── */
  await vista('Mês');
  if (/Importar o plano do mês/i.test(await texto())) ok('mês: sem plano, a tela oferece importar a planilha');
  else falha('mês: não ofereceu importar');
  const seletor = pag.locator('input[type="file"][aria-label="Arquivo do plano"]').first();
  if (await seletor.getAttribute('accept') === null) ok('importar: o seletor não filtra tipo (no iPhone, filtrar deixava a planilha cinza)');
  else falha('importar: o seletor filtra ' + await seletor.getAttribute('accept'));

  /* o PDF do plano, pela IA */
  await seletor.setInputFiles(arquivoPdf);
  await pag.waitForTimeout(900);
  const pp = pedidosPlano[0] || {};
  if (pp.token === 'token-teste' && pp.texto && pp.texto.includes('Supino reto 4 6 a 8')) ok('PDF: o texto do PDF vai para a IA com o token');
  else falha('PDF: pedido ' + JSON.stringify(pp).slice(0, 200));
  t = await texto();
  if (/em Plano_Dezembro\.pdf/.test(t) && /1 fichas de treino/.test(t) && /período de 01\/12\/2025/.test(t)) ok('PDF: mostra o que a IA achou antes de aplicar');
  else falha('PDF: resumo ' + t.slice(0, 400));
  await pag.getByRole('button', { name: 'cancelar', exact: true }).click();
  await pag.waitForTimeout(300);
  if (!/Plano_Dezembro/.test(await texto())) ok('PDF: cancelar não aplica nada');
  else falha('PDF: cancelar não sumiu com o resumo');

  await seletor.setInputFiles(arquivoPlanilha);
  await pag.waitForTimeout(700);
  t = await texto();
  if (/2 fichas de treino/.test(t) && /cardápio com 2 refeições/.test(t) && /período de 01\/11\/2025 a 30\/11\/2025/.test(t)) ok('importar: mostra o que achou antes de aplicar');
  else falha('importar: resumo não apareceu: ' + t.slice(0, 400));
  await foto('1-importar');
  await pag.getByRole('button', { name: 'importar', exact: true }).click();
  await pag.waitForTimeout(700);
  t = await texto();
  if (/Plano Novembro · Modo firme/i.test(t) && /Resumo por semana/i.test(t) && /Semana 5/.test(t)) ok('mês: título, resumo com as 5 semanas');
  else falha('mês: painel incompleto: ' + t.slice(0, 500));
  if (/Nada de ficar abaixo de 1\.700 kcal/.test(t) && /Natação/.test(t)) ok('mês: regras de ouro e a semana de atividades');
  else falha('mês: faltou regras ou semana');

  /* ── hoje ── */
  await vista('Hoje');
  await foto('3-hoje');
  t = await texto();
  if (/Segunda/i.test(t) && /Treino A/.test(t) && /Superior \+ cardio/.test(t)) ok('hoje: segunda-feira é Treino A, com o que fazer');
  else falha('hoje: atividade do dia errada: ' + t.slice(0, 400));
  if (await pag.getByRole('button', { name: /começar Treino A · Empurrar/i }).count()) ok('hoje: botão para começar a ficha do dia');
  else falha('hoje: sem o botão da ficha do dia');
  if (await pag.locator('input[placeholder="hoje é dia"]').count()) ok('hoje: segunda-feira pede a cintura');
  else falha('hoje: não lembrou da cintura na segunda');
  await pag.locator('input[placeholder="ao acordar"]').fill('89,4');
  await pag.locator('input[placeholder="hoje é dia"]').fill('94,5');
  await pag.getByRole('button', { name: /anotar/i }).first().click();
  await pag.waitForTimeout(400);
  await pag.getByRole('button', { name: '+250 ml' }).click();
  await pag.getByRole('button', { name: '+500 ml' }).click();
  await pag.waitForTimeout(300);
  if (/0,75 de 2 L/.test(await texto())) ok('hoje: a água soma copo a copo');
  else falha('hoje: água não somou');
  await pag.getByRole('button', { name: /começar Treino A · Empurrar/i }).click();
  await pag.waitForTimeout(500);
  if (/Supino inclinado/.test(await texto()) && /treino em andamento/.test(await texto())) ok('hoje: o botão começa o treino da ficha certa');
  else falha('hoje: não começou o treino');

  await vista('Mês');
  await foto('2-mes');
  t = await texto();
  if (/89,4 kg/.test(t) && /0,6 kg/.test(t) && /94,5 cm/.test(t)) ok('mês: o peso e a cintura anotados hoje entram no painel');
  else falha('mês: peso anotado não apareceu: ' + t.slice(0, 500));

  /* ── alimentação ── */
  await vista('Alimentação');
  await pag.getByRole('button', { name: /Do cardápio/ }).click();
  await pag.getByRole('button', { name: /anotar/ }).first().click();
  await pag.waitForTimeout(400);
  t = await texto();
  if (/210/.test(t) && /Café da manhã/.test(t) && /do cardápio/.test(t)) ok('alimentação: a refeição do cardápio entra com um toque');
  else falha('alimentação: cardápio não anotou: ' + t.slice(0, 400));

  await pag.getByRole('button', { name: /^Foto$/ }).click();
  await pag.locator('input[type="file"][accept="image/*"]').setInputFiles(arquivoFoto);
  await pag.waitForTimeout(600);
  if (await pag.locator('img[alt="Foto 1 do prato"]').count()) ok('alimentação: a foto aparece antes de mandar');
  else falha('alimentação: miniatura da foto não apareceu');
  await pag.locator('textarea').first().fill('frango 150 g');
  await pag.getByRole('button', { name: /Calcular com IA/ }).click();
  await pag.waitForTimeout(800);
  const p = pedidosIA[0] || {};
  if (p.token === 'token-teste' && p.imagens && p.imagens.length === 1 && p.imagens[0].tipo === 'image/jpeg' && p.descricao === 'frango 150 g' && p.refeicao) ok('alimentação: a foto vai reduzida em JPEG, com o token, a descrição e a refeição');
  else falha('alimentação: pedido à IA: ' + JSON.stringify({ ...p, imagens: (p.imagens || []).length }));
  t = await texto();
  if (/Confira antes de salvar/i.test(t) && /Frango grelhado/.test(t) && /368 kcal/.test(t) && /óleo/.test(t)) ok('alimentação: a estimativa aparece para conferir, com a observação');
  else falha('alimentação: conferência: ' + t.slice(0, 500));
  await foto('4-conferir');
  const protArroz = pag.locator('input[aria-label="prot. g de Arroz branco cozido"]');
  await protArroz.fill('');
  await protArroz.pressSequentially('12,5');
  await pag.waitForTimeout(200);
  if (await protArroz.inputValue() === '12,5' && /57,5 g proteína/.test(await texto())) ok('alimentação: dá para digitar "12,5" na correção, e o total acompanha');
  else falha('alimentação: correção com vírgula: campo "' + await protArroz.inputValue() + '"');
  await pag.getByRole('button', { name: 'dobro' }).click();
  await pag.waitForTimeout(200);
  if (/736 kcal/.test(await texto())) ok('alimentação: "comi o dobro" dobra o total');
  else falha('alimentação: porção não mudou o total');
  await pag.getByRole('button', { name: /salvar a refeição/ }).click();
  await pag.waitForTimeout(500);
  t = await texto();
  if (/946/.test(t) && /pela foto/.test(t)) ok('alimentação: salva, e o total do dia soma 210 + 736');
  else falha('alimentação: total do dia: ' + t.slice(0, 500));
  if (/abaixo da meta: faltam 954 kcal/.test(t)) ok('alimentação: diz quanto falta para o mínimo');
  else falha('alimentação: status das calorias não apareceu');

  await pag.getByRole('button', { name: /^Descrever$/ }).click();
  await pag.locator('textarea').first().fill('2 bananas');
  await pag.getByRole('button', { name: /Calcular com IA/ }).click();
  await pag.waitForTimeout(700);
  if (pedidosIA.length === 2 && (pedidosIA[1].imagens || []).length === 0) ok('alimentação: só a descrição vai sem foto nenhuma');
  else falha('alimentação: descrição mandou foto junto');
  await pag.getByRole('button', { name: 'descartar' }).click();

  /* ── recarregar ── */
  await pag.reload({ waitUntil: 'load' });
  await pag.waitForTimeout(1800);
  await irPara('Treino');
  await vista('Alimentação');
  t = await texto();
  if (/946/.test(t)) ok('recarregar: as refeições do dia continuam lá');
  else falha('recarregar: refeições sumiram');
  await vista('Mês');
  if (/Plano Novembro/i.test(await texto())) ok('recarregar: o plano importado continua lá');
  else falha('recarregar: o plano sumiu');
  await vista('Cargas');
  if (/Registro de cargas do mês/i.test(await texto()) && /Supino inclinado/.test(await texto())) ok('cargas: a tabela do mês com os exercícios da ficha');
  else falha('cargas: tabela do mês não apareceu');

  /* ── celular: nada passa da largura ── */
  await pag.setViewportSize({ width: 390, height: 844 });
  for (const v of ['Hoje', 'Mês', 'Alimentação', 'Plano']) {
    await vista(v);
    await foto('cel-' + v);
    const vaza = await pag.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (!vaza) ok(`celular: ${v} cabe em 390 px`);
    else falha(`celular: ${v} passou da largura da tela`);
  }
} catch (e) {
  falha('o teste parou: ' + e.message.split('\n')[0]);
}

await navegador.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(passos.join('\n'));
if (erros.length) {
  console.log(`\n${erros.length} PROBLEMA(S):\n${erros.join('\n')}`);
  process.exit(1);
}
console.log('\nnenhum erro');
