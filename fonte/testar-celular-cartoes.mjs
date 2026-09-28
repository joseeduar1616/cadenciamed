/* O estudo de cartões e a tela cheia do Foco, num celular de 390 px.
 *
 *   - A barra de cima do estudo: "0 feitos" encavalava nos pontos, porque
 *     o nome inteiro do modo ("múltipla escolha") não cabia na largura.
 *   - A letra das telas cheias: elas vão por portal para o <body>, fora da
 *     div que define a fonte, e o texto miúdo saía serifado.
 *
 *   node testar-celular-cartoes.mjs index.html
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const alvo = path.resolve(process.argv[2] || 'index.html');
const erros = [];
const passos = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

const hoje = new Date().toISOString().slice(0, 10);
const cartao = (i, frente, verso) => ({
  id: 'c' + i, frente, verso, subjectId: null, baralho: 'ECG', pasta: 'Cardiologia',
  criado: hoje, prox: hoje, inter: 0, facilidade: 2.5, revisoes: 0, lapsos: 0,
});
const DADOS = JSON.stringify({
  profile: { name: 'Teste', onboarded: true }, theme: 'dark',
  flash: [
    cartao(1, 'Flutter atrial típico: frequência atrial?', 'Cerca de 300 bpm, ondas F em dente de serra.'),
    cartao(2, 'Tratamento da FA instável?', 'Cardioversão elétrica sincronizada.'),
    cartao(3, 'Droga da TSV estável após manobra vagal?', 'Adenosina 6 mg IV.'),
    cartao(4, 'Tríade da síndrome nefrítica?', 'Hematúria, hipertensão e edema.'),
  ],
  pastas: ['Cardiologia'],
});

const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const navegador = await chromium.launch({ args: ['--no-sandbox'], ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}) });
const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(([v]) => {
  try {
    const k = 'cadencia:v3:convite-notificacoes-aparelho';
    if (!localStorage.getItem(k)) localStorage.setItem(k, 'teste');
    if (!localStorage.getItem('cadencia:v3')) localStorage.setItem('cadencia:v3', v);
  } catch (e) { /* noop */ }
}, [DADOS]);
const pag = await ctx.newPage();
pag.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
await pag.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
await pag.goto('file://' + alvo, { waitUntil: 'load' });
await pag.waitForTimeout(1800);
const semConta = pag.locator('button:has-text("usar sem conta")');
if (await semConta.count() > 0 && await semConta.first().isVisible()) { await semConta.first().click(); await pag.waitForTimeout(400); }
/* a letra que o painel usa dentro de <main>: a das telas cheias tem de ser a mesma */
const fonteDoSite = await pag.evaluate(() => { const m = document.querySelector('main'); return m ? getComputedStyle(m).fontFamily : ''; });

const irPara = async (nome) => {
  const menu = pag.locator('button[aria-label="Abrir menu"]').first();
  if (await menu.count() && await menu.isVisible()) { await menu.click(); await pag.waitForTimeout(500); }
  await pag.locator(`nav button:has-text("${nome}")`).first().click();
  await pag.waitForTimeout(700);
};

/* ── cartões ──────────────────────────────────────────────────────────── */
await irPara('Cartões');
const estudar = pag.locator('main button:has-text("Estudar (")').first();
if (await estudar.count() === 0) falha('o painel de cartões não ofereceu estudar os cartões de hoje');
else {
  await estudar.click();
  await pag.waitForTimeout(700);
  for (const jeito of ['primeiro', 'segundo']) {
    const barra = await pag.evaluate(() => {
      const fechar = document.querySelector('button[aria-label="Encerrar o estudo"]');
      const direita = fechar && fechar.parentElement;
      const esquerda = direita && direita.previousElementSibling;
      if (!direita || !esquerda) return null;
      const d = direita.getBoundingClientRect();
      const e = [...esquerda.children].map((x) => x.getBoundingClientRect()).filter((r) => r.width > 0);
      return { cruza: e.some((r) => r.right > d.left + 1), vaza: d.right > innerWidth + 1 };
    });
    if (barra && !barra.cruza && !barra.vaza) ok(`celular: barra do estudo sem encavalar nem vazar (${jeito} modo)`);
    else falha(`celular: a barra do estudo encavala ou vaza (${jeito} modo): ` + JSON.stringify(barra));
    const troca = pag.locator('button[title^="Trocar para"]').first();
    if (await troca.count()) { await troca.click(); await pag.waitForTimeout(400); }
  }
  const fonte = await pag.evaluate(() => {
    const el = [...document.querySelectorAll('body > div *')].find((x) => /na fila/i.test(x.textContent || '') && x.children.length === 0);
    return el ? getComputedStyle(el).fontFamily : '';
  });
  if (fonte && fonte === fonteDoSite) ok('a tela de estudo usa a fonte do site');
  else falha(`a tela de estudo saiu com outra fonte: ${fonte} (o site usa ${fonteDoSite})`);
  await pag.locator('button[aria-label="Encerrar o estudo"]').first().click();
  await pag.waitForTimeout(400);
}

/* ── tela cheia do Foco ───────────────────────────────────────────────── */
await irPara('Foco');
await pag.locator('main button:has-text("Tela cheia")').first().click();
await pag.waitForTimeout(600);
const dica = await pag.evaluate(() => {
  const el = [...document.querySelectorAll('body *')].find((x) => /espaço inicia e pausa/.test(x.textContent || '') && x.children.length === 0);
  return el ? getComputedStyle(el).fontFamily : '';
});
if (dica && dica === fonteDoSite) ok('o texto miúdo da tela cheia do Foco usa a fonte do site');
else falha(`o texto da tela cheia do Foco saiu com outra fonte: ${dica} (o site usa ${fonteDoSite})`);

await navegador.close();
console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
