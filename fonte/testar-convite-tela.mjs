/* O convite de notificações e o Foco em tempo corrido, num Chromium de
 * verdade.
 *
 * Confere o convite de notificações aparecer uma vez só por aparelho, a
 * tela cheia do Foco cobrir a tela toda e o cronômetro correr direto, sem
 * pergunta nenhuma no meio (o "Você está aí?" de 30 em 30 minutos saiu, a
 * pedido), inclusive com o site fechado.
 *
 * O relógio da página é falso (page.clock): uma hora passa em um instante.
 *
 *   node testar-convite-tela.mjs index.html
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const alvo = path.resolve(process.argv[2] || 'index.html');
if (!fs.existsSync(alvo)) { console.error('não achei', alvo); process.exit(1); }

const erros = [];
const passos = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const navegador = await chromium.launch({
  args: ['--no-sandbox'],
  ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}),
});
const ctx = await navegador.newContext({ viewport: { width: 1280, height: 860 } });
const pag = await ctx.newPage();
pag.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
await pag.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));

await pag.clock.install({ time: new Date('2026-09-28T09:00:00-03:00') });
await pag.goto('file://' + alvo, { waitUntil: 'load' });
await pag.waitForTimeout(1500);

const semConta = pag.locator('button:has-text("usar sem conta")');
if (await semConta.count() > 0) { await semConta.first().click(); await pag.waitForTimeout(300); }
const campoNome = pag.locator('input[placeholder="Seu nome"]');
if (await campoNome.count() > 0) {
  await campoNome.fill('Teste');
  await pag.locator('button:has-text("Começar")').first().click();
  await pag.waitForTimeout(800);
}

/* ── o convite de notificações, uma vez por aparelho ──────────────────── */
const permissao = await pag.evaluate(() => ('Notification' in window ? Notification.permission : 'sem'));
const convite = pag.locator('[role="dialog"]:has-text("Ativar as notificações")');
await pag.clock.fastForward(3000);
await pag.waitForTimeout(400);
if (permissao === 'default') {
  if (await convite.count() === 1) ok('no primeiro acesso do aparelho, convida a ativar as notificações');
  else falha('o convite de notificações não apareceu no primeiro acesso');
  await convite.locator('button:has-text("agora não")').click();
  await pag.waitForTimeout(300);
  if (await convite.count() === 0) ok('"agora não" fecha o convite');
  else falha('o convite não fechou');
  await pag.reload({ waitUntil: 'load' });
  await pag.waitForTimeout(800);
  await pag.clock.fastForward(4000);
  await pag.waitForTimeout(400);
  if (await convite.count() === 0) ok('no segundo acesso do mesmo aparelho, não convida de novo');
  else falha('o convite voltou no segundo acesso');
} else {
  /* com a permissão já decidida, não há o que pedir */
  if (await convite.count() === 0) ok(`permissão "${permissao}" neste navegador: sem convite, como deve ser`);
  else falha(`convite apareceu com a permissão já "${permissao}"`);
}

/* ── o Foco em tempo corrido ──────────────────────────────────────────── */
await pag.locator('nav button:has-text("Foco")').first().click();
await pag.waitForTimeout(400);

/* A tela cheia do Foco cobre a tela INTEIRA. Dentro da página, o "fixed"
   ficava preso ao bloco com animação de entrada: o relógio saía por cima
   do cabeçalho, com o menu e o rodapé em volta (1120 × 59, no meio). */
await pag.evaluate(() => window.scrollTo(0, 300));
await pag.locator('main button:has-text("Tela cheia")').first().click();
await pag.waitForTimeout(400);
const cheia = await pag.evaluate(() => {
  const b = document.querySelector('button[aria-label="Sair da tela cheia"]');
  if (!b) return null;
  const r = b.parentElement.getBoundingClientRect();
  return { top: r.top, left: r.left, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight };
});
if (cheia && cheia.top === 0 && cheia.left === 0 && cheia.w === cheia.vw && cheia.h === cheia.vh) {
  ok('a tela cheia do Foco cobre a tela inteira, mesmo com a página rolada');
} else falha('a tela cheia do Foco não cobre a tela: ' + JSON.stringify(cheia));
await pag.locator('button[aria-label="Sair da tela cheia"]').first().click();
await pag.waitForTimeout(300);
await pag.evaluate(() => window.scrollTo(0, 0));

await pag.locator('button:has-text("Tempo corrido")').first().click();
await pag.waitForTimeout(300);
await pag.locator('main button:has-text("Começar")').first().click();
await pag.waitForTimeout(300);

const emSegundos = (t) => String(t).split(':').map(Number).reduce((a, n) => a * 60 + n, 0);
const relogio = async () => pag.evaluate(() => {
  const m = (document.querySelector('main')?.innerText || '').match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/);
  return m ? m[0] : '';
});
const pergunta = () => pag.evaluate(() => /Você está aí\?|Estou aqui/.test(document.body.innerText));

await pag.clock.fastForward('31:00');
await pag.waitForTimeout(400);
if (!(await pergunta())) ok('aos 31 minutos, nada de "Você está aí?"');
else falha('ainda pergunta "Você está aí?" aos 30 minutos');
await pag.clock.fastForward('40:00');
await pag.waitForTimeout(400);
if (await pag.locator('main button:has-text("Pausar")').count() > 0 && !(await pergunta())) ok('passada mais de uma hora, o cronômetro segue correndo sem perguntar nada');
else falha('o cronômetro parou ou perguntou depois de uma hora');
const umaHora = emSegundos(await relogio());
if (umaHora >= 71 * 60 && umaHora <= 71 * 60 + 8) ok(`o tempo conta tudo (${await relogio()})`);
else falha('tempo contado: ' + (await relogio()) + ' (esperado perto de 1:11:00)');

/* ── o site fechado: o tempo corrido continua ────────────────────────── */
await pag.locator('main button:has-text("Pausar")').first().click();
await pag.waitForTimeout(200);
await pag.locator('main button:has-text("Zerar")').first().click();
await pag.waitForTimeout(200);
await pag.evaluate(() => {
  const agora = Date.now();
  const umaHora = 60 * 60 * 1000;
  const t = JSON.parse(localStorage.getItem('cadencia:v3:timer') || '{}');
  localStorage.setItem('cadencia:v3:timer', JSON.stringify({
    ...t, modo: 'corrido', running: true, swAcum: 0, swInicio: agora - umaHora, em: agora - umaHora,
  }));
});
const guardado = await pag.evaluate(() => localStorage.getItem('cadencia:v3:timer'));
await pag.reload({ waitUntil: 'load' });
await pag.evaluate((g) => { if (!localStorage.getItem('cadencia:v3:timer')) { localStorage.setItem('cadencia:v3:timer', g); location.reload(); } }, guardado).catch(() => {});
await pag.waitForTimeout(1200);
await pag.clock.fastForward(1000);
await pag.waitForTimeout(400);
const foco = pag.locator('nav button:has-text("Foco")').first();
if (await foco.count()) { await foco.click(); await pag.waitForTimeout(300); }
if (await pag.locator('main button:has-text("Pausar")').count() > 0) ok('reabrindo 1 h depois, o cronômetro segue correndo');
else falha('reabrindo 1 h depois, o cronômetro parou');
const reaberto = emSegundos(await relogio());
if (reaberto >= 3600 && reaberto <= 3610) ok(`e contou a hora em que o site esteve fechado (${await relogio()})`);
else falha('tempo contado com o site fechado: ' + (await relogio()) + ' (esperado 1:00:00)');

await navegador.close();
console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
