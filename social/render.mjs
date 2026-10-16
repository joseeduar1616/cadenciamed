/* Tira um JPEG de cada slide do carrossel.html.
   node social/render.mjs <id>   ->   social/publicado/<id>/1.jpg, 2.jpg...
   Precisa do playwright (npm i playwright) e de um Chromium; o caminho do
   Chromium pode vir em CHROMIUM, senão usa o do playwright. */
import { chromium } from 'playwright';
import fs from 'node:fs'; import path from 'node:path';
const AQUI = path.dirname(new URL(import.meta.url).pathname);
const id = process.argv[2];
if (!id) { console.error('uso: node social/render.mjs <id>'); process.exit(1); }
const html = path.join(AQUI, 'saida', id, 'carrossel.html');
const dest = path.join(AQUI, 'publicado', id);
fs.rmSync(dest, { recursive: true, force: true }); fs.mkdirSync(dest, { recursive: true });
const nav = await chromium.launch({ args: ['--no-sandbox'], ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}) });
const p = await nav.newPage({ viewport: { width: 1140, height: 1400 }, deviceScaleFactor: 1 });
await p.goto('file://' + html); await p.evaluate(() => document.fonts.ready);
const slides = p.locator('section.slide');
const n = await slides.count();
for (let i = 0; i < n; i++) {
  await slides.nth(i).screenshot({ path: path.join(dest, `${i + 1}.jpg`), type: 'jpeg', quality: 92 });
}
await nav.close();
console.log(n, 'slides em', dest);
