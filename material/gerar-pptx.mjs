/* Monta os dois PowerPoint a partir dos HTML já gerados.
 *
 *   node gerar.mjs        # antes: escreve os HTML e imprime os PDF
 *   node gerar-pptx.mjs   # depois: os mesmos materiais em .pptx editável
 *
 * O desenho vem em imagem, o texto vem em caixa de texto. Ver slides.mjs
 * para o porquê da separação.
 */
import pptxgen from 'pptxgenjs';
import fs from 'node:fs';
import path from 'node:path';
import { abrirNavegador, extrair, LARGURA_POL, ALTURA_POL } from './slides.mjs';

const AQUI = path.dirname(new URL(import.meta.url).pathname);

const DOCS = [
  ['Cadencia-Med-Guia-de-Uso', 'guia', 'Cadência Med · guia de uso'],
  ['Cadencia-Med-Plano-de-Parceria', 'parceria', 'Cadência Med · plano de parceria'],
];

/* O PowerPoint escolhe a fonte pelo nome da família mais o negrito, então
   Inter 800 e Inter 700 caem os dois em Inter Bold. A diferença entre os
   dois pesos é pequena no corpo em que aparecem, e insistir num nome de
   estilo ("Inter ExtraBold") quebraria em quem só tem a família básica. */
const FAMILIA = (f) => (/mono/i.test(f) ? 'JetBrains Mono'
  : /serif/i.test(f) && !/sans/i.test(f) ? 'Instrument Serif' : 'Inter');

/* Uma folga na caixa: a medida vem do navegador, e a fonte do PowerPoint
   pode medir alguns por cento diferente. Sem isso a última linha de um
   parágrafo justo desapareceria ao abrir.
 *
 * A folga entra do lado para onde o texto NÃO está encostado: à direita
 * num texto alinhado à esquerda, à esquerda num alinhado à direita, e
 * metade de cada lado no centralizado. Somando dos dois lados, como era
 * antes, a caixa crescia para a esquerda junto e arrastava o texto com
 * ela: numa faixa larga isso dava quase 7mm, e o rótulo do cabeçalho saía
 * por cima do próprio risco. */
const FOLGA = 0.03;

function montarSlide(pres, slide) {
  const s = pres.addSlide();
  s.background = { color: '04030A' };
  s.addImage({
    path: slide.fundo, x: 0, y: 0, w: LARGURA_POL, h: ALTURA_POL,
  });

  for (const b of slide.blocos) {
    const runs = [];
    for (const p of b.partes) {
      if (p.quebra) {
        if (runs.length) runs[runs.length - 1].options.breakLine = true;
        continue;
      }
      const texto = p.caixaAlta ? p.texto.toLocaleUpperCase('pt-BR')
        : p.caixaBaixa ? p.texto.toLocaleLowerCase('pt-BR') : p.texto;
      runs.push({
        text: texto,
        options: {
          color: p.cor,
          bold: p.negrito,
          italic: p.italico,
          strike: p.riscado ? 'sngStrike' : undefined,
        },
      });
    }
    if (!runs.length) continue;

    const folga = b.largura * FOLGA;
    const recuo = b.alinhamento === 'center' ? folga / 2
      : b.alinhamento === 'right' ? folga : 0;
    const x = Math.max(0, b.x - recuo);

    s.addText(runs, {
      x,
      y: Math.max(0, b.y - 0.04),
      w: Math.min(LARGURA_POL - x, b.largura + folga),
      h: b.altura + 0.09,
      fontFace: FAMILIA(b.fonte),
      fontSize: b.corpo,
      align: b.alinhamento,
      valign: b.vertical || 'top',
      charSpacing: b.espacamento || undefined,
      lineSpacingMultiple: Math.max(0.6, Math.min(2, b.entrelinha)),
      margin: 0,
      isTextBox: true,
      wrap: true,
      fit: 'none',
    });
  }
  return s;
}

const nav = await abrirNavegador();

for (const [arquivo, prefixo, titulo] of DOCS) {
  const html = path.join(AQUI, `${arquivo}.html`);
  if (!fs.existsSync(html)) {
    throw new Error(`não achei ${arquivo}.html. Rode o gerar.mjs antes.`);
  }

  const slides = await extrair(nav, html, prefixo);

  const pres = new pptxgen();
  pres.defineLayout({ name: 'A4', width: LARGURA_POL, height: ALTURA_POL });
  pres.layout = 'A4';
  pres.title = titulo;
  pres.company = 'Cadência Med';

  for (const s of slides) montarSlide(pres, s);

  const saida = path.join(AQUI, `${arquivo}.pptx`);
  await pres.writeFile({ fileName: saida });
  const caixas = slides.reduce((a, s) => a + s.blocos.length, 0);
  console.log(`${arquivo}.pptx: ${slides.length} slides, ${caixas} caixas de texto, `
    + `${Math.round(fs.statSync(saida).size / 1024)} KB`);
}

await nav.close();
