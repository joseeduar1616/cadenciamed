/* O estilo "Virar" do Foco: o relógio de placas (parte5).
 *
 * Confere: o estilo aparece nos Ajustes e fica guardado; o cronômetro vira
 * duas placas (minutos e segundos) com os números certos; a placa vira
 * quando o segundo muda; na tela cheia as placas ocupam a tela; e o tempo
 * corrido com hora ganha a terceira placa.
 *
 *   node testar-relogio-virar.mjs [arquivo.html]
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const alvo = path.resolve(process.argv[2] || 'teste.html');
if (!fs.existsSync(alvo)) { console.error('não achei', alvo); process.exit(1); }

const erros = [];
const ok = (m) => console.log('ok   ' + m);
const falha = (m) => { console.log('FALHA ' + m); erros.push(m); };

const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const navegador = await chromium.launch({
  args: ['--no-sandbox'],
  ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}),
});
const pag = await (await navegador.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errosDaPagina = [];
pag.on('pageerror', (e) => errosDaPagina.push(e.message));
await pag.clock.install({ time: new Date('2026-10-06T09:00:00') });

await pag.addInitScript(() => {
  try { const k = 'cadencia:v3:convite-notificacoes-aparelho'; if (!localStorage.getItem(k)) localStorage.setItem(k, '1'); } catch (e) { /* segue */ }
  if (sessionStorage.getItem('semeado')) return;
  sessionStorage.setItem('semeado', '1');
  localStorage.setItem('cadencia:v3', JSON.stringify({ profile: { name: 'Teste', onboarded: true, examDate: '2027-03-10' } }));
});

await pag.goto('file://' + alvo, { waitUntil: 'load' });
await pag.waitForTimeout(1800);
const semConta = pag.locator('button:has-text("usar sem conta")');
if (await semConta.count() > 0) { await semConta.first().click(); await pag.waitForTimeout(500); }
const dados = () => pag.evaluate(() => JSON.parse(localStorage.getItem('cadencia:v3')));
const placas = pag.locator('[data-teste="placa-virar"]');
const valores = () => placas.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));

await pag.locator('nav button:has-text("Foco")').first().click();
await pag.waitForTimeout(500);

/* ── 1. escolher o estilo ────────────────────────────────────────────── */
await pag.locator('main button:has-text("Ajustes")').first().click();
await pag.waitForTimeout(300);
const opcao = pag.locator('main button:has-text("Virar")');
if (await opcao.count()) ok('"Virar" aparece entre os estilos do cronômetro');
else falha('o estilo Virar não está nos Ajustes');
await opcao.first().click();
await pag.waitForTimeout(400);
if (JSON.stringify(await valores()) === JSON.stringify(['25', '00'])) ok('o cronômetro vira duas placas: 25 e 00');
else falha('placas: ' + JSON.stringify(await valores()));
await pag.waitForTimeout(1900);
if ((await dados()).pomo.estilo === 'virar') ok('o estilo fica guardado');
else falha('o estilo não foi guardado');

/* ── 2. a placa vira ─────────────────────────────────────────────────── */
await pag.locator('main button:has-text("Começar")').first().click();
/* o segundo vira em ~0,5 s (o relógio arredonda) e a virada dura 0,6 s:
   olhando em 0,7 s, ela está no meio */
await pag.clock.runFor(700);
const v = await valores();
if (v[0] === '24' && v[1] === '59') ok('um segundo depois: 24 e 59');
else falha('depois de um segundo: ' + JSON.stringify(v));
if (await pag.locator('.virar-cai').count() > 0) ok('e a placa que mudou faz a virada (a metade de cima cai)');
else falha('a virada não aconteceu');
/* A folha que cai é a metade de cima do número VELHO, e o verso que desce
   é a metade de baixo do NOVO. Invertido, a parte de cima trocaria
   sozinha antes da folha cair (o defeito relatado). */
const folhas = await pag.evaluate(() => ({
  cai: [...document.querySelectorAll('.virar-cai')].map((e) => e.textContent),
  desce: [...document.querySelectorAll('.virar-desce')].map((e) => e.textContent),
}));
/* as duas placas viram juntas aqui: 25→24 nos minutos, 00→59 nos segundos */
if (folhas.cai.join() === '25,00' && folhas.desce.join() === '24,59') ok('a folha que cai leva o número velho (25, 00) e o verso que desce traz o novo (24, 59)');
else falha('folhas da virada: ' + JSON.stringify(folhas));
const em3d = await pag.evaluate(() => [...document.styleSheets].some((ss) => { try { return [...ss.cssRules].some((r) => /virar-(cai|desce)/.test(r.cssText) && /rotateX/.test(r.cssText)); } catch (e) { return false; } }));
if (!em3d) ok('a virada é em 2D (no iPhone o 3D com face escondida sumia, e a parte de cima trocava sozinha)');
else falha('a virada ainda usa rotateX');
await pag.clock.runFor(800);
await pag.waitForTimeout(100);
if (await pag.locator('.virar-cai').count() <= 1) ok('a virada termina e não se acumula');
else falha('viradas acumuladas: ' + await pag.locator('.virar-cai').count());

/* ── 3. tela cheia ───────────────────────────────────────────────────── */
await pag.locator('main button:has-text("Tela cheia")').first().click();
await pag.waitForTimeout(400);
const larguras = await placas.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
if (larguras.length === 2 && larguras.every((w) => w >= 380)) ok(`na tela cheia, as placas ficam grandes (${Math.round(larguras[0])}px cada)`);
else falha('placas na tela cheia: ' + JSON.stringify(larguras));
const cabe = await placas.evaluateAll((els) => els.every((e) => { const r = e.getBoundingClientRect(); return r.right <= innerWidth && r.bottom <= innerHeight; }));
if (cabe) ok('e cabem na tela, sem cortar');
else falha('as placas passaram da tela');
/* sem a Oswald (o teste roda sem internet), a fonte de reserva é larga:
   os números têm de caber no cartão mesmo assim */
const numerosCabem = await placas.evaluateAll((els) => els.every((e) => {
  const c = e.getBoundingClientRect();
  return [...e.querySelectorAll('span')].every((sp) => {
    const faixa = document.createRange();
    faixa.selectNodeContents(sp);
    const r = faixa.getBoundingClientRect();   // o texto em si, já com o aperto aplicado
    return r.width <= c.width + 1;
  });
}));
if (numerosCabem) ok('os números cabem dentro do cartão, com qualquer fonte');
else falha('os números estouram o cartão');
if (process.env.CAPTURA_VIRAR) await pag.screenshot({ path: process.env.CAPTURA_VIRAR });
await pag.setViewportSize({ width: 390, height: 844 });
await pag.clock.runFor(1000);
await pag.waitForTimeout(200);
const cabeCel = await placas.evaluateAll((els) => els.every((e) => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }));
if (cabeCel) ok('no celular, as placas da tela cheia cabem na largura');
else falha('no celular as placas passaram da largura');
await pag.keyboard.press('Escape');
await pag.setViewportSize({ width: 1280, height: 900 });
await pag.waitForTimeout(300);

/* ── 4. tempo corrido com hora: três placas ──────────────────────────── */
await pag.locator('main button:has-text("Pausar")').first().click().catch(() => {});
await pag.locator('main button:has-text("Tempo corrido")').first().click().catch(() => {});
await pag.waitForTimeout(300);
await pag.locator('main button:has-text("Começar")').first().click().catch(() => {});
await pag.clock.fastForward(3600 * 1000 + 5000);
await pag.clock.runFor(1000);
await pag.waitForTimeout(300);
const v3 = await valores();
if (v3.length === 3 && v3[0] === '01') ok('no tempo corrido, passando de uma hora aparece a terceira placa: ' + v3.join(':'));
else falha('tempo corrido com hora: ' + JSON.stringify(v3));

/* ── 5. "reduzir movimento": troca sem folha parada no meio ───────────── */
await pag.emulateMedia({ reducedMotion: 'reduce' });
await pag.reload({ waitUntil: 'load' });
await pag.clock.runFor(1500);
await pag.waitForTimeout(300);
if (await pag.locator('nav button:has-text("Foco")').count()) {
  await pag.locator('nav button:has-text("Foco")').first().click();
  await pag.clock.runFor(1200);
  await pag.waitForTimeout(200);
  if (!(await pag.locator('.virar-cai, .virar-desce').count())) ok('com "reduzir movimento", o número só troca, sem folhas paradas mostrando meio número');
  else falha('com movimento reduzido, apareceram folhas paradas');
} else falha('não voltei ao Foco depois de recarregar');

if (!errosDaPagina.length) ok('nenhum erro de JavaScript na página');
else falha('erros: ' + errosDaPagina.slice(0, 3).join(' | '));

await navegador.close();
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
