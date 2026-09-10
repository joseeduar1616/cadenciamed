/* Monta os dois PDFs.
 *
 *   node capturar.mjs   # antes, para refazer as capturas do app
 *   node gerar.mjs      # escreve os HTML e imprime os PDFs
 *
 * A impressão é o próprio Chromium: o que é CSS e SVG entra vetorial no
 * arquivo, e só as capturas do app viram imagem.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { cssDasFontes } from './fontes.mjs';
import { documento } from './comum.mjs';
import { renderizar as renderizarMolduras } from './molduras.mjs';
import { tutorial } from './tutorial.mjs';
import { patrocinio } from './patrocinio.mjs';

const AQUI = path.dirname(new URL(import.meta.url).pathname);
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const DOCS = [
  ['Cadencia-Med-Guia-de-Uso', 'Cadência Med · guia de uso', tutorial],
  ['Cadencia-Med-Plano-de-Parceria', 'Cadência Med · plano de parceria', patrocinio],
];

console.log('fontes:');
const fontes = await cssDasFontes();

const nav = await chromium.launch({ args: ['--no-sandbox'], executablePath: CHROME });

console.log(`molduras: ${await renderizarMolduras(nav)} peças achatadas em imagem`);

for (const [arquivo, titulo, montar] of DOCS) {
  const paginas = montar(fontes);
  const html = documento(titulo, fontes, paginas);
  const caminhoHtml = path.join(AQUI, `${arquivo}.html`);
  fs.writeFileSync(caminhoHtml, html);

  const ctx = await nav.newContext();
  const pag = await ctx.newPage();
  const problemas = [];
  pag.on('pageerror', (e) => problemas.push(e.message));
  pag.on('requestfailed', (r) => problemas.push(`não carregou: ${r.url().slice(-60)}`));

  await pag.goto('file://' + caminhoHtml, { waitUntil: 'networkidle' });
  await pag.evaluate(() => document.fonts.ready);
  await pag.waitForTimeout(700);

  const caminhoPdf = path.join(AQUI, `${arquivo}.pdf`);
  await pag.pdf({
    path: caminhoPdf,
    format: 'A4', landscape: true, printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    preferCSSPageSize: true,
  });
  await ctx.close();

  const kb = Math.round(fs.statSync(caminhoPdf).size / 1024);
  console.log(`${arquivo}.pdf: ${paginas.length} páginas, ${kb} KB`
    + (problemas.length ? `\n  avisos: ${[...new Set(problemas)].join(' | ')}` : ''));
}

await nav.close();
