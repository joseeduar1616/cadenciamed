/* Capturas do app em alta resolução, para entrarem nos PDFs.
 *
 * Abre o teste.html (mesmo app, com o plano liberado), escreve a conta de
 * mentira no localStorage e fotografa cada aba com escala 3, que dá uma
 * imagem por volta de 4K de largura.
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { montarDados } from './dados-demo.mjs';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const ALVO = path.join(RAIZ, 'fonte/teste.html');
const SAIDA = path.join(RAIZ, 'material/capturas');
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/* largura de mesa: 1400 CSS x escala 3 = 4200px de largura na imagem */
const LARGURA = 1400;
const ESCALA = 3;

const ABAS = [
  ['hoje', 'Hoje'], ['foco', 'Foco'], ['materias', 'Matérias'],
  ['ciclo-clinico', 'Ciclo clínico'], ['cronograma', 'Cronograma'],
  ['temas', 'Temas'], ['assistente', 'Assistente'],
  ['cartoes', 'Cartões'], ['revisoes', 'Revisões'], ['rotina', 'Rotina'],
  ['amigos', 'Amigos'], ['metas', 'Metas'], ['desempenho', 'Desempenho'],
  ['progresso', 'Progresso'], ['planos', 'Plano'], ['configuracoes', 'Configurações'],
];

/* As mesmas telas no celular. Post de rede social é vertical, então estas
   costumam ser as mais usadas. */
const ABAS_CELULAR = [
  ['hoje', 'Hoje'], ['materias', 'Matérias'], ['cartoes', 'Cartões'],
  ['desempenho', 'Desempenho'], ['amigos', 'Amigos'], ['revisoes', 'Revisões'],
  ['cronograma', 'Cronograma'], ['progresso', 'Progresso'],
];

if (!fs.existsSync(ALVO)) {
  console.error('não achei fonte/teste.html: rode ./montar.sh antes');
  process.exit(1);
}
fs.mkdirSync(SAIDA, { recursive: true });

const dados = montarDados();
const nav = await chromium.launch({ args: ['--no-sandbox'], executablePath: CHROME });

async function novaPagina(largura, altura, escala) {
  const ctx = await nav.newContext({
    viewport: { width: largura, height: altura }, deviceScaleFactor: escala,
  });
  const pag = await ctx.newPage();
  pag.on('pageerror', (e) => console.log('  erro de página:', e.message));
  await pag.route('**/api/**', (r) => r.fulfill({
    status: 200, contentType: 'application/json', body: '{"ok":true,"salas":[],"baralhos":[]}',
  }));
  await pag.addInitScript((d) => {
    try { window.localStorage.setItem('cadencia:v3', JSON.stringify(d)); } catch (e) { /* noop */ }
  }, dados);
  await pag.goto('file://' + ALVO, { waitUntil: 'load' });
  await pag.waitForTimeout(2600);
  return { ctx, pag };
}

const irPara = async (pag, rotulo) => {
  const gaveta = pag.locator('button[aria-label="Abrir menu"]');
  if (await gaveta.count() > 0 && await gaveta.first().isVisible()) {
    await gaveta.first().click();
    await pag.waitForTimeout(350);
  }
  const b = pag.locator(`nav button:has-text("${rotulo}")`).first();
  if (await b.count() === 0) return false;
  await b.click();
  await pag.waitForTimeout(950);
  return true;
};

/* ── abas, em tela de mesa ─────────────────────────────────────────── */
{
  const { ctx, pag } = await novaPagina(LARGURA, 940, ESCALA);
  for (const [arq, rotulo] of ABAS) {
    if (!(await irPara(pag, rotulo))) { console.log('  pulei', rotulo); continue; }
    await pag.screenshot({ path: `${SAIDA}/${arq}.png` });
    const { width } = await pag.evaluate(() => ({ width: window.innerWidth }));
    console.log(`  ${arq}.png (${width * ESCALA}px de largura)`);
  }
  await ctx.close();
}

/* ── o miolo de algumas abas ─────────────────────────────────────────
   O topo da aba nem sempre é a parte que interessa: em Desempenho o que
   rende é o acerto por matéria, e em Cartões é o montador com IA. Estas
   capturas rolam até o cartão pedido antes de fotografar. */
{
  const { ctx, pag } = await novaPagina(LARGURA, 940, ESCALA);
  const ROLADAS = [
    ['desempenho-por-materia', 'Desempenho', 'Por matéria'],
    ['desempenho-por-area', 'Desempenho', 'Por área'],
    ['cartoes-montar-ia', 'Cartões', 'Montar flashcards com IA'],
    ['progresso-tempo', 'Progresso', 'Onde o tempo foi'],
    ['progresso-constancia', 'Progresso', 'Constância'],
    ['metas-simulados', 'Metas', 'Simulados'],
    ['rotina-semana', 'Rotina', 'Semana'],
  ];
  for (const [arq, rotulo, alvo] of ROLADAS) {
    if (!(await irPara(pag, rotulo))) { console.log('  pulei', arq); continue; }
    /* O título de cartão é desenhado com ícone ao lado, então o texto não
       fica sozinho num elemento: quem acha isso direito é o seletor de
       texto do próprio Playwright. */
    const titulo = pag.locator(`main >> text=${alvo}`).first();
    if (await titulo.count() === 0) { console.log('  não achei', alvo, 'em', rotulo); continue; }
    await titulo.scrollIntoViewIfNeeded();
    await pag.evaluate(() => window.scrollBy(0, -120));
    await pag.waitForTimeout(900);
    await pag.screenshot({ path: `${SAIDA}/${arq}.png` });
    console.log(`  ${arq}.png`);
  }
  await ctx.close();
}

/* ── a página de entrada, sem conta ──────────────────────────────────
   Aberta de um arquivo, sem rede, o Firebase não carrega e a página cai na
   entrada pelo nome. Segurar o módulo sem responder mantém a nuvem em
   "carregando", que é o estado em que aparece o formulário de conta: é ele
   que o tutorial precisa mostrar. */
{
  const ctx = await nav.newContext({ viewport: { width: LARGURA, height: 940 }, deviceScaleFactor: ESCALA });
  const pag = await ctx.newPage();
  await pag.route('**/firebasejs/**', () => {});
  await pag.goto('file://' + path.join(RAIZ, 'fonte/index.html'), { waitUntil: 'load' });
  await pag.waitForTimeout(2600);
  await pag.screenshot({ path: `${SAIDA}/entrada.png` });
  for (const secao of ['cronograma', 'conta', 'planos']) {
    await pag.evaluate((id) => document.getElementById(id)?.scrollIntoView({ block: 'start' }), secao);
    await pag.waitForTimeout(1300);
    await pag.screenshot({ path: `${SAIDA}/entrada-${secao}.png` });
  }
  console.log('  entrada.png e as seções');
  await ctx.close();
}

/* ── celular, para mostrar que roda no bolso ───────────────────────── */
{
  const { ctx, pag } = await novaPagina(390, 844, ESCALA);
  for (const [arq, rotulo] of ABAS_CELULAR) {
    if (!(await irPara(pag, rotulo))) { console.log('  pulei celular', rotulo); continue; }
    await pag.screenshot({ path: `${SAIDA}/celular-${arq}.png` });
    console.log(`  celular-${arq}.png`);
  }
  await ctx.close();
}

/* ── tema claro ──────────────────────────────────────────────────────
   Metade das pessoas usa o site no claro, e o post que só mostra o escuro
   parece outro produto para elas. */
{
  const { ctx, pag } = await novaPagina(LARGURA, 940, ESCALA);
  await pag.evaluate(() => {
    const bruto = window.localStorage.getItem('cadencia:v3');
    const d = bruto ? JSON.parse(bruto) : {};
    d.theme = 'light';
    window.localStorage.setItem('cadencia:v3', JSON.stringify(d));
  });
  await pag.reload({ waitUntil: 'load' });
  await pag.waitForTimeout(2600);
  for (const [arq, rotulo] of [['hoje', 'Hoje'], ['materias', 'Matérias'], ['desempenho', 'Desempenho']]) {
    if (!(await irPara(pag, rotulo))) continue;
    await pag.screenshot({ path: `${SAIDA}/claro-${arq}.png` });
    console.log(`  claro-${arq}.png`);
  }
  await ctx.close();
}

await nav.close();
console.log('capturas prontas em material/capturas');
