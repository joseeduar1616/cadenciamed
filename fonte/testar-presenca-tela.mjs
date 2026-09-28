/* O "Você está aí?" e o convite de notificações, num Chromium de verdade.
 *
 * A regra em si (quando perguntar, onde parar) tem teste próprio, em
 * testar-presenca.mjs. Este confere o que só aparece com a página aberta:
 * a pergunta surgir na hora certa por cima do site, "Estou aqui" manter o
 * cronômetro correndo, o silêncio pará-lo com o tempo contado só até a
 * pergunta, o site fechado não inflar as horas, e o convite de
 * notificações aparecer uma vez só por aparelho.
 *
 * O relógio da página é falso (page.clock): meia hora passa em um instante.
 *
 *   node testar-presenca-tela.mjs index.html
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

const pergunta = pag.locator('[role="alertdialog"]:has-text("Você está aí?")');
const emSegundos = (t) => String(t).split(':').map(Number).reduce((a, n) => a * 60 + n, 0);
const relogio = async () => pag.evaluate(() => {
  const m = (document.querySelector('main')?.innerText || '').match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/);
  return m ? m[0] : '';
});

await pag.clock.fastForward('29:00');
await pag.waitForTimeout(400);
if (await pergunta.count() === 0) ok('aos 29 minutos, nada de pergunta');
else falha('perguntou antes dos 30 minutos');

await pag.clock.fastForward('01:05');
await pag.waitForTimeout(400);
if (await pergunta.count() === 1) ok('aos 30 minutos, aparece "Você está aí?" por cima do site');
else falha('a pergunta não apareceu aos 30 minutos');
const textoPergunta = (await pergunta.innerText().catch(() => '')) || '';
if (/para em \d+s/.test(textoPergunta)) ok('a pergunta mostra quantos segundos faltam');
else falha('a pergunta não mostra a contagem: ' + textoPergunta);

/* A pergunta é do site inteiro, não da tela do Foco: fica fora do <main>
   (onde as abas trocam) e cobre tudo, inclusive o menu. */
const foraDoMain = await pag.evaluate(() => {
  const d = document.querySelector('[role="alertdialog"]');
  return !!d && !d.closest('main') && getComputedStyle(d).position === 'fixed';
});
if (foraDoMain) ok('a pergunta cobre o site inteiro, e não só a aba do Foco');
else falha('a pergunta ficou presa dentro da aba');

await pergunta.locator('button:has-text("Estou aqui")').click();
await pag.waitForTimeout(300);
if (await pergunta.count() === 0) ok('"Estou aqui" fecha a pergunta');
else falha('"Estou aqui" não fechou a pergunta');

await pag.locator('nav button:has-text("Foco")').first().click();
await pag.waitForTimeout(300);
if (await pag.locator('main button:has-text("Pausar")').count() > 0) ok('depois de responder, o cronômetro continua correndo');
else falha('o cronômetro parou mesmo com resposta');

/* meia hora depois da resposta, pergunta de novo; sem resposta, para */
await pag.clock.fastForward('30:00');
await pag.waitForTimeout(400);
if (await pergunta.count() === 1) ok('meia hora depois da resposta, pergunta de novo');
else falha('não perguntou de novo meia hora depois da resposta');
await pag.clock.fastForward('01:05');
await pag.waitForTimeout(500);
if (await pergunta.count() === 0) ok('passado o minuto, a pergunta sai da tela');
else falha('a pergunta ficou na tela depois do minuto');
if (await pag.locator('main button:has-text("Retomar")').count() > 0) ok('sem resposta, o cronômetro para');
else falha('sem resposta, o cronômetro continuou');
const parado = await relogio();
/* Começou em 0, respondeu aos 30:05, a pergunta seguinte veio aos 60:05.
   Alguns segundos de folga: o relógio falso também anda nas esperas de
   verdade entre um passo e outro do teste. O que não pode é passar de
   1:01:05, que seria contar o minuto sem resposta. */
const sp = emSegundos(parado);
if (sp >= 3605 && sp <= 3612) ok(`o tempo contou só até a pergunta (${parado}), não o minuto sem resposta`);
else falha('tempo parado errado: ' + parado + ' (esperado perto de 1:00:05)');
await pag.clock.fastForward('10:00');
await pag.waitForTimeout(300);
if ((await relogio()) === parado) ok('parado, o tempo não anda mais');
else falha('o tempo continuou andando depois de parar: ' + (await relogio()));

/* ── o site fechado não infla as horas ───────────────────────────────── */
/* Zera, começa de novo, e imita o site fechado: o cronômetro "começou"
   três horas atrás e ninguém voltou desde então. */
await pag.locator('main button:has-text("Zerar")').first().click();
await pag.waitForTimeout(200);
await pag.evaluate(() => {
  const agora = Date.now();
  const tresHoras = 3 * 60 * 60 * 1000;
  const t = JSON.parse(localStorage.getItem('cadencia:v3:timer') || '{}');
  localStorage.setItem('cadencia:v3:timer', JSON.stringify({
    ...t, modo: 'corrido', running: true, swAcum: 0,
    swInicio: agora - tresHoras, presencaDesde: agora - tresHoras, em: agora - tresHoras,
  }));
});
await pag.reload({ waitUntil: 'load' });
await pag.waitForTimeout(1200);
await pag.clock.fastForward(1000);
await pag.waitForTimeout(400);
const foco = pag.locator('nav button:has-text("Foco")').first();
if (await foco.count()) { await foco.click(); await pag.waitForTimeout(300); }
if (await pag.locator('main button:has-text("Retomar")').count() > 0) ok('reabrindo 3 h depois, o cronômetro está parado');
else falha('reabrindo 3 h depois, o cronômetro continuou correndo');
const reaberto = await relogio();
if (emSegundos(reaberto) >= 1800 && emSegundos(reaberto) <= 1803) ok(`e contou ${reaberto}, não 3 horas`);
else falha('tempo contado com o site fechado: ' + reaberto + ' (esperado 30:00)');

await navegador.close();
console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
