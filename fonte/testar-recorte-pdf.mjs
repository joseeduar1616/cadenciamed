/* Testa a matemática que acha o retângulo de cada figura embutida num PDF
 * — sem abrir PDF nenhum de verdade, nem navegador: retangulosDeImagem só
 * depende de pdfjsLib.OPS, page.getOperatorList() e viewport.transform, e
 * os três dão para fingir.
 *
 * Roda contra _recorte.mjs, a cópia automática de parte12.jsx (refeita pelo
 * extrair_recorte.py a cada build). Confere save/restore/transform, o Form
 * XObject (que carrega matriz própria, tratado igual a um save/transform),
 * e o descarte de figura pequena demais para ser decoração.
 *
 *   node testar-recorte-pdf.mjs
 */
import { retangulosDeImagem, FIGURA_MIN_PX } from './_recorte.mjs';

const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

/* códigos de operação inventados — a função só compara "é igual a X",
   nunca usa o valor em si, então qualquer conjunto de valores únicos serve */
const OPS = {
  save: 1, restore: 2, transform: 3,
  paintImageXObject: 4, paintJpegXObject: 5, paintInlineImageXObject: 6,
  paintFormXObjectBegin: 7, paintFormXObjectEnd: 8,
};
const pdfjsLib = { OPS };

const paginaCom = (ops) => ({
  getOperatorList: async () => ({
    fnArray: ops.map((o) => o[0]),
    argsArray: ops.map((o) => o[1]),
  }),
});

/* escala 2, com a inversão de eixo Y que o pdf.js usa de verdade (o PDF
   nasce de baixo para cima; o canvas, de cima para baixo), deslocando 400px
   — um viewport plausível, só para a conta ter algo para aplicar */
const viewport = { transform: [2, 0, 0, -2, 0, 400] };

const perto = (a, b, margem = 0.01) => Math.abs(a - b) < margem;
const confereCaixa = (nome, caixa, esperado) => {
  if (!caixa) { falha(`${nome}: não achei a caixa`); return; }
  const iguais = ['x', 'y', 'w', 'h'].every((k) => perto(caixa[k], esperado[k]));
  if (iguais) ok(`${nome}: retângulo bate (x:${caixa.x} y:${caixa.y} w:${caixa.w} h:${caixa.h})`);
  else falha(`${nome}: esperado ${JSON.stringify(esperado)}, veio ${JSON.stringify(caixa)}`);
};

/* ── 1. imagem simples, colocada por um "cm" só ────────────────────────
   cm [100 0 0 50 20 30]: a página, em espaço PDF, vai de (20,30) a
   (120,80) — 100 de largura, 50 de altura. Pelo viewport [2 0 0 -2 0 400],
   cada ponto (px,py) vira (2·px, 400−2·py) no canvas: */
let caixas = await retangulosDeImagem(pdfjsLib, paginaCom([
  [OPS.save, []],
  [OPS.transform, [100, 0, 0, 50, 20, 30]],
  [OPS.paintImageXObject, ['img1']],
  [OPS.restore, []],
]), viewport);
if (caixas.length === 1) ok('imagem simples: achou exatamente uma figura');
else falha('imagem simples: achou ' + caixas.length);
confereCaixa('imagem simples', caixas[0], { x: 40, y: 240, w: 200, h: 100 });

/* ── 2. imagem dentro de um Form XObject, que carrega matriz própria ───
   translada (10,10), depois o form escala tudo por 2, depois a imagem em
   si escala 50×50 — a mesma composição que um PDF de verdade faz quando a
   figura vem de dentro de um objeto de forma (comum em PDF do InDesign) */
caixas = await retangulosDeImagem(pdfjsLib, paginaCom([
  [OPS.save, []],
  [OPS.transform, [1, 0, 0, 1, 10, 10]],
  [OPS.paintFormXObjectBegin, [[2, 0, 0, 2, 0, 0], [0, 0, 1, 1]]],
  [OPS.transform, [50, 0, 0, 50, 0, 0]],
  [OPS.paintImageXObject, ['img2']],
  [OPS.paintFormXObjectEnd, []],
  [OPS.restore, []],
]), viewport);
if (caixas.length === 1) ok('imagem dentro de Form XObject: achou exatamente uma figura');
else falha('Form XObject: achou ' + caixas.length);
confereCaixa('Form XObject', caixas[0], { x: 20, y: 180, w: 200, h: 200 });

/* ── 3. duas figuras na mesma página, cada uma no seu save/restore ────── */
caixas = await retangulosDeImagem(pdfjsLib, paginaCom([
  [OPS.save, []], [OPS.transform, [100, 0, 0, 50, 20, 30]], [OPS.paintImageXObject, ['a']], [OPS.restore, []],
  [OPS.save, []], [OPS.transform, [40, 0, 0, 40, 200, 200]], [OPS.paintJpegXObject, ['b', 40, 40]], [OPS.restore, []],
]), viewport);
if (caixas.length === 2) ok('duas figuras na mesma página: as duas são achadas');
else falha('duas figuras: achou ' + caixas.length);

/* ── 4. figura pequena demais é decoração, não cartão ──────────────────
   um traço de 5×5 em espaço PDF vira 10×10 no canvas (viewport ×2) — bem
   abaixo de FIGURA_MIN_PX */
caixas = await retangulosDeImagem(pdfjsLib, paginaCom([
  [OPS.save, []],
  [OPS.transform, [5, 0, 0, 5, 0, 0]],
  [OPS.paintInlineImageXObject, [{}]],
  [OPS.restore, []],
]), viewport);
if (caixas.length === 0) ok(`figura menor que ${FIGURA_MIN_PX}px: descartada como decoração`);
else falha('figura pequena não foi descartada: ' + JSON.stringify(caixas));

/* ── 5. página sem imagem nenhuma ──────────────────────────────────────── */
caixas = await retangulosDeImagem(pdfjsLib, paginaCom([[OPS.save, []], [OPS.restore, []]]), viewport);
if (caixas.length === 0) ok('página sem imagem: lista vazia, sem erro');
else falha('página sem imagem devolveu figura: ' + JSON.stringify(caixas));

console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
