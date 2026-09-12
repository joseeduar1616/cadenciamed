import { chromium, devices } from 'playwright';
import path from 'node:path';
import { montarDados } from '../material/dados-demo.mjs';
const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const nav = await chromium.launch({ args: ['--no-sandbox'], executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const dados = montarDados();
for (const [nome, extra] of [['sem toque', { viewport: { width: 390, height: 844 } }],
                             ['com toque (celular de verdade)', { ...devices['Pixel 5'] }]]) {
  const ctx = await nav.newContext(extra);
  const pag = await ctx.newPage();
  await pag.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"salas":[],"baralhos":[]}' }));
  await pag.addInitScript((d) => { try { window.localStorage.setItem('cadencia:v3', JSON.stringify(d)); } catch (e) {} }, dados);
  await pag.goto('file://' + path.join(RAIZ, 'fonte/teste.html'), { waitUntil: 'load' });
  await pag.waitForTimeout(2600);
  const grosso = await pag.evaluate(() => window.matchMedia('(pointer: coarse)').matches);
  for (const aba of ['Matérias', 'Cartões', 'Metas']) {
    const g = pag.locator('button[aria-label="Abrir menu"]');
    if (await g.count() && await g.first().isVisible()) { await g.first().click(); await pag.waitForTimeout(400); }
    const b = pag.locator(`nav button:has-text("${aba}")`).first();
    if (!await b.count()) continue;
    await b.click(); await pag.waitForTimeout(800);
    const r = await pag.evaluate(() => {
      const maus = [];
      for (const b of document.querySelectorAll('main button')) {
        const r = b.getBoundingClientRect();
        if (r.width < 1) continue;
        if (r.height < 30 || r.width < 30) maus.push(`${(b.getAttribute('aria-label') || b.textContent || '?').trim().slice(0,20)} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      return maus;
    });
    console.log(`${nome} [coarse=${grosso}] ${aba}: ${r.length} pequenos ${r.slice(0,3).join(' | ')}`);
  }
  await ctx.close();
}
await nav.close();
