/* Importar PDF e Word na anotação COM as figuras (parte30).
 *
 * A queixa: "quando eu jogo o PDF, ele não coloca as imagens, só o texto".
 * Aqui o leitor de PDF e o de Word são de mentira (o teste roda sem
 * internet, e o de verdade vem de um CDN), mas o caminho do site é o de
 * sempre: achar onde cada figura é desenhada na página, recortar, pegar o
 * texto em volta, mandar só esse texto para a IA, e pôr cada figura na
 * caixa que a IA escolheu. Também confere o que NÃO pode entrar: ícone
 * pequeno, fundo de página inteira e logotipo repetido em toda página.
 *
 *   node testar-importar-figuras.mjs [arquivo.html]
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const alvo = path.resolve(process.argv[2] || 'teste.html');
if (!fs.existsSync(alvo)) { console.error('não achei', alvo); process.exit(1); }

const erros = [];
const ok = (m) => console.log('ok   ' + m);
const falha = (m) => { console.log('FALHA ' + m); erros.push(m); };

/* Um PDF de mentira com três páginas de 600x800 pontos. As matrizes são as
   do operador "cm" de verdade: [largura, 0, 0, altura, x, y], com y para
   cima, como no PDF. */
const PDFJS_FALSO = `(() => {
  const OPS = { save: 10, restore: 11, transform: 12, paintFormXObjectBegin: 74, paintFormXObjectEnd: 75,
    paintJpegXObject: 82, paintImageXObject: 85, paintInlineImageXObject: 86, showText: 44 };
  const img = (m) => [[OPS.save, null], [OPS.transform, m], [OPS.paintImageXObject, ['img', 10, 10]], [OPS.restore, null]];
  const logo = img([170, 0, 0, 64, 400, 726]);   // grande o bastante para só a regra do "repetido" o tirar
  const paginas = {
    1: { ops: [...img([300, 0, 0, 180, 120, 520]), ...logo, ...img([18, 0, 0, 18, 40, 40])],
         textos: [['Infarto agudo do miocárdio com supra de ST. Dor torácica típica há mais de vinte minutos.', 50, 780],
                  ['Figura 1. ECG com supra de ST em DII, DIII e aVF', 120, 505]] },
    2: { ops: [...img([260, 0, 0, 216, 150, 450]), ...logo],
         textos: [['Complicações: choque cardiogênico e ruptura de parede livre.', 50, 780],
                  ['Figura 2. Radiografia de tórax com congestão pulmonar', 150, 435]] },
    3: { ops: [...img([600, 0, 0, 800, 0, 0]), ...logo],
         textos: [['Tratamento: angioplastia primária em até noventa minutos e dupla antiagregação.', 50, 780]] },
  };
  window.pdfjsLib = { GlobalWorkerOptions: {}, OPS, getDocument: () => ({ promise: Promise.resolve({
    numPages: 3,
    getPage: async (n) => {
      const p = paginas[n];
      return {
        getViewport: ({ scale }) => ({ width: 600 * scale, height: 800 * scale, transform: [scale, 0, 0, -scale, 0, 800 * scale] }),
        getTextContent: async () => ({ items: p.textos.map(([str, x, y]) => ({ str, transform: [11, 0, 0, 11, x, y] })) }),
        getOperatorList: async () => ({ fnArray: p.ops.map((o) => o[0]), argsArray: p.ops.map((o) => o[1]) }),
        render: ({ canvasContext }) => { canvasContext.fillStyle = '#c33'; canvasContext.fillRect(0, 0, 4000, 4000); return { promise: Promise.resolve() }; },
      };
    },
  }) }) };
})();`;

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const MAMMOTH_FALSO = `window.mammoth = { convertToHtml: async () => ({ value:
  '<p>Ultrassonografia na colecistite aguda: espessamento da parede e líquido perivesicular. ' + 'Murphy ultrassonográfico positivo. '.repeat(6) + '</p>'
  + '<p><img src="data:image/png;base64,${PNG}" /></p><p>Figura 3. Vesícula com parede espessada</p>' }) };`;

const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const navegador = await chromium.launch({ args: ['--no-sandbox'], ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}) });
const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
const pag = await ctx.newPage();
const errosDaPagina = [];
pag.on('pageerror', (e) => errosDaPagina.push(e.message));
await pag.addInitScript(() => {
  try { const k = 'cadencia:v3:convite-notificacoes-aparelho'; if (!localStorage.getItem(k)) localStorage.setItem(k, '1'); } catch (e) { /* segue */ }
  if (sessionStorage.getItem('semeado')) return;
  sessionStorage.setItem('semeado', '1');
  localStorage.setItem('cadencia:v3', JSON.stringify({ profile: { name: 'Teste', onboarded: true } }));
});
await ctx.route('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: PDFJS_FALSO }));
await ctx.route('https://cdnjs.cloudflare.com/ajax/libs/mammoth/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: MAMMOTH_FALSO }));

/* A IA de mentira escolhe a caixa de cada figura pelo texto em volta, e
   deixa uma sem caixa, para ver que ela não some. */
const pedidos = [];
await ctx.route('**/api/folha-ia', async (r) => {
  const p = JSON.parse(r.request().postData() || '{}');
  pedidos.push(p);
  const achar = (re) => (p.figuras || []).find((f) => re.test(f.contexto));
  const ecg = achar(/ECG/), us = achar(/Vesícula/);
  await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, titulo: 'Tema importado',
    caixas: [
      { titulo: 'Diagnóstico', pergunta: 'x', pontos: [{ texto: 'Supra de ST' }], figuras: [ecg, us].filter(Boolean).map((f) => f.id) },
      { titulo: 'Tratamento', pergunta: 'x', pontos: [{ texto: 'Angioplastia' }], figuras: [] },
    ],
    legendas: ecg ? { [ecg.id]: 'ECG: supra de ST inferior' } : {} }) });
});

await pag.goto('file://' + alvo, { waitUntil: 'load' });
await pag.waitForTimeout(1800);
const semConta = pag.locator('button:has-text("usar sem conta")');
if (await semConta.count() > 0) { await semConta.first().click(); await pag.waitForTimeout(500); }
await pag.locator('nav button:has-text("Matérias")').first().click();
await pag.waitForTimeout(400);
await pag.locator('[data-teste="titulo-materia"]').first().click();
await pag.waitForTimeout(300);
await pag.locator('text=Escrever ou colar uma anotação').first().click();
await pag.waitForTimeout(500);

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'figuras-'));
const caixasNoEditor = () => pag.evaluate(() => [...document.querySelectorAll('[data-teste="editor-anotacao"] [data-caixa]')].map((c) => ({
  titulo: c.querySelector('h3').textContent,
  imgs: [...c.querySelectorAll('img')].map((i) => (i.getAttribute('src') || '').slice(0, 22)),
  legendas: [...c.querySelectorAll('i')].map((i) => i.textContent),
})));

/* ── 1. PDF ─────────────────────────────────────────────────────────── */
const pdf = path.join(pasta, 'aula.pdf');
fs.writeFileSync(pdf, '%PDF-1.4 de mentira');
await pag.locator('[data-teste="importar-anotacao"]').setInputFiles(pdf);
await pag.waitForFunction(() => /Tema importado/.test((document.querySelector('[data-teste="editor-anotacao"]') || {}).innerHTML || ''), null, { timeout: 15000 }).catch(() => {});
const p1 = pedidos[0] || {};
const figs = p1.figuras || [];
if (figs.length === 2) ok('do PDF saem só as 2 figuras de verdade: ícone pequeno, fundo de página inteira e logotipo repetido ficam de fora');
else falha('figuras mandadas: ' + JSON.stringify(figs));
if (figs[0] && figs[0].pagina === 1 && /Figura 1\. ECG/.test(figs[0].contexto) && figs[1] && /Figura 2\. Radiografia/.test(figs[1].contexto)) {
  ok('cada figura vai com a página e a legenda que está embaixo dela no PDF');
} else falha('contexto das figuras: ' + JSON.stringify(figs));
if (!JSON.stringify(p1).includes('data:image')) ok('a imagem em si não vai para a IA, só o texto em volta');
else falha('a imagem foi junto para o servidor');
let caixas = await caixasNoEditor();
const diag = caixas.find((c) => c.titulo === 'Diagnóstico');
if (diag && diag.imgs.length === 1 && diag.imgs[0].startsWith('data:image/jpeg') && diag.legendas.includes('ECG: supra de ST inferior')) {
  ok('a figura entra na caixa que a IA escolheu, com a legenda dela');
} else falha('caixa Diagnóstico: ' + JSON.stringify(diag));
const sobras = caixas.find((c) => c.titulo === 'Figuras do material');
if (sobras && sobras.imgs.length === 1 && /Radiografia/.test(sobras.legendas.join(' '))) ok('a figura que não coube em caixa nenhuma vai para "Figuras do material", com a legenda do PDF');
else falha('figuras sem caixa: ' + JSON.stringify(caixas));
await pag.waitForFunction(() => {
  const d = JSON.parse(localStorage.getItem('cadencia:v3') || '{}');
  return /data-nome="/.test(Object.values(d.anotacoes || {}).map((a) => a.html).join(''));
}, null, { timeout: 8000 }).catch(() => {});
const guardada = await pag.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('cadencia:v3') || '{}');
  const h = Object.values(d.anotacoes || {}).map((a) => a.html).join('');
  return { nomes: (h.match(/data-nome="/g) || []).length, embutida: /src="data:/.test(h) };
});
if (guardada.nomes >= 2 && !guardada.embutida) ok('as figuras ficam guardadas no aparelho, sem inflar a anotação salva');
else falha('anotação guardada: ' + JSON.stringify(guardada));

/* ── 2. Word ────────────────────────────────────────────────────────── */
const docx = path.join(pasta, 'colecistite.docx');
fs.writeFileSync(docx, 'docx de mentira');
await pag.locator('[data-teste="importar-anotacao"]').setInputFiles(docx);
await pag.waitForFunction(() => (document.querySelector('[data-teste="editor-anotacao"]').innerHTML.match(/Tema importado/g) || []).length >= 2, null, { timeout: 15000 }).catch(() => {});
const p2 = pedidos[1] || {};
if ((p2.figuras || []).length === 1 && /Figura 3\. Vesícula/.test(p2.figuras[0].contexto)) ok('do Word também: a imagem entra, com o parágrafo vizinho como legenda');
else falha('Word: ' + JSON.stringify(p2.figuras));
caixas = await caixasNoEditor();
if (caixas.filter((c) => c.titulo === 'Diagnóstico').some((c) => c.imgs.some((s) => s.startsWith('data:image/png')))) ok('e a imagem do Word aparece na caixa escolhida');
else falha('a imagem do Word não entrou na anotação');

fs.rmSync(pasta, { recursive: true, force: true });
if (!errosDaPagina.length) ok('nenhum erro de JavaScript na página');
else falha('erros: ' + errosDaPagina.slice(0, 3).join(' | '));
await navegador.close();
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
