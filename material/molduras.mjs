/* As molduras com relevo, achatadas em imagem antes de virar PDF.
 *
 * O motivo é chato mas decisivo: quando o Chromium imprime uma camada que
 * tem transform 3D, ele desiste de compor e rasteriza aquela camada na
 * resolução da tela. A primeira versão deste material desenhava a moldura
 * em CSS na própria folha, e a captura de 4200px entrava no PDF com 408px
 * de largura, ilegível. Filtro, sombra e brilho em volta acompanham no
 * mesmo destino.
 *
 * Aqui a moldura é montada num navegador à parte, no tamanho que vai ter no
 * papel e com deviceScaleFactor alto, e sai como PNG plano com fundo
 * transparente. Imagem plana o Chromium embute inteira, na resolução que
 * ela tem. O relevo continua igual: o que mudou foi quem desenha.
 */
import fs from 'node:fs';
import path from 'node:path';
import { COR } from './comum.mjs';

const AQUI = path.dirname(new URL(import.meta.url).pathname);
export const PASTA = path.join(AQUI, 'molduras');

/* Folga em volta, em fração da largura, para o brilho e a sombra caberem
   dentro da imagem em vez de serem cortados na borda. */
const FOLGA = 0.09;

/* Quanto a imagem é ampliada antes de virar pixel. A moldura é montada no
   tamanho de papel, então é isto que decide os pontos por polegada: 3 dá
   por volta de 290 dpi na largura que estas molduras ocupam, de sobra para
   impressão, e segura o PDF num tamanho que passa em anexo de e-mail. */
const ESCALA = 3;

/* Cada moldura que os dois documentos usam, com o giro de cada uma. Gerar
   só o que é usado: cada arquivo destes passa de dois megabytes. */
export const MOLDURAS = [
  // computador virado para a esquerda
  ...['hoje', 'materias', 'cartoes', 'rotina', 'metas', 'assistente', 'entrada-conta', 'cronograma']
    .map((c) => ({ nome: `${c}-e`, captura: `${c}.png`, tipo: 'tela', giro: 'rotateY(-13deg) rotateX(4deg)' })),
  // computador virado para a direita
  ...['cronograma', 'foco', 'revisoes', 'temas', 'amigos', 'progresso', 'hoje']
    .map((c) => ({ nome: `${c}-d`, captura: `${c}.png`, tipo: 'tela', giro: 'rotateY(13deg) rotateX(4deg)' })),
  // a capa da proposta: sem pé, mais inclinada
  { nome: 'entrada-capa', captura: 'entrada.png', tipo: 'tela', pe: false, larguraMm: 128, giro: 'rotateY(-16deg) rotateX(5deg)' },
  // celulares
  ...['celular-hoje', 'celular-cronograma', 'celular-cartoes']
    .map((c) => ({ nome: c, captura: `${c}.png`, tipo: 'fone', larguraMm: 48, giro: 'rotateY(-11deg)' })),
];

/* O relevo. Sai daqui, e não da folha de impressão, porque agora é só este
   navegador que precisa dele. */
const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: transparent; }
  #palco { perspective: 1400px; perspective-origin: 50% 40%; padding: 60mm; width: max-content; }

  .tela3d {
    position: relative; border-radius: 3mm; padding: 1.1mm;
    background: linear-gradient(150deg, #6b5f8e, #241d3a 28%, #14101f 62%, #4a3f6b);
    box-shadow:
      0 1mm 0 #ffffff1a inset,
      0 26mm 40mm -22mm #000f,
      0 6mm 14mm -8mm ${COR.neon2}55;
  }
  .tela3d > img { display: block; width: 100%; height: auto; border-radius: 2.1mm; }
  .tela3d .reflexo {
    position: absolute; inset: 1.1mm; border-radius: 2.1mm; pointer-events: none;
    background: linear-gradient(122deg, #ffffff1f 0%, #ffffff05 16%, transparent 34%);
  }
  .tela3d .pe {
    position: absolute; left: 14%; right: 14%; bottom: -3.4mm; height: 3.4mm;
    background: linear-gradient(180deg, #3b3358, #15111f);
    border-radius: 0 0 2mm 2mm; box-shadow: 0 4mm 10mm -4mm #000;
  }

  .fone3d {
    position: relative; border-radius: 5mm; padding: .9mm;
    background: linear-gradient(150deg, #7a6ea3, #211b34 30%, #100d1a 64%, #514576);
    box-shadow: 0 18mm 30mm -16mm #000f, 0 4mm 12mm -6mm ${COR.neon}44;
  }
  .fone3d > img { display: block; width: 100%; height: auto; border-radius: 4.2mm; }
  .fone3d .entalhe {
    position: absolute; top: 1.6mm; left: 50%; transform: translateX(-50%);
    width: 14mm; height: 1.6mm; border-radius: 1mm; background: #0a0812;
  }
`;

/* A página é gravada num arquivo dentro de material/ e aberta por goto, em
   vez de injetada com setContent. Com setContent a página fica em
   about:blank: caminho relativo não resolve, e caminho file:// absoluto o
   Chromium recusa por vir de outra origem. Das duas vezes a captura não
   carregava, a moldura fechava na altura de nada e saía uma tira no lugar
   do computador. Aberta como arquivo, "capturas/..." resolve sozinho. */
const RASCUNHO = path.join(AQUI, '.moldura-tmp.html');

const corpo = (m) => (m.tipo === 'fone'
  ? `<div class="fone3d" id="peca" style="width:${m.larguraMm}mm;transform:${m.giro}">
       <img src="capturas/${m.captura}"><div class="entalhe"></div>
     </div>`
  : `<div class="tela3d" id="peca" style="width:${m.larguraMm || 128}mm;transform:${m.giro}">
       <img src="capturas/${m.captura}"><div class="reflexo"></div>
       ${m.pe === false ? '' : '<div class="pe"></div>'}
     </div>`);

/* Renderiza todas e devolve quantas saíram. */
export async function renderizar(nav) {
  fs.mkdirSync(PASTA, { recursive: true });
  const ctx = await nav.newContext({ deviceScaleFactor: ESCALA, viewport: { width: 1400, height: 1200 } });
  const pag = await ctx.newPage();
  const faltando = [];

  for (const m of MOLDURAS) {
    const origem = path.join(AQUI, 'capturas', m.captura);
    if (!fs.existsSync(origem)) { faltando.push(m.captura); continue; }

    fs.writeFileSync(RASCUNHO,
      `<!doctype html><meta charset="utf-8"><style>${CSS}</style>
       <div id="palco">${corpo(m)}</div>`);
    await pag.goto('file://' + RASCUNHO, { waitUntil: 'load' });
    await pag.evaluate(() => Promise.all(
      [...document.images].map((i) => (i.complete ? null : i.decode().catch(() => null)))));
    await pag.waitForTimeout(120);

    /* Uma captura que não carrega não avisa: a moldura só fecha vazia e o
       PDF sai com uma tira no lugar da tela. Melhor parar aqui. */
    const carregou = await pag.evaluate(() => {
      const img = document.querySelector('#peca img');
      return img && img.naturalWidth > 0 ? img.naturalWidth : 0;
    });
    if (!carregou) throw new Error(`a captura ${m.captura} não carregou na moldura ${m.nome}`);

    /* O retângulo da peça já girada, mais o que sobra dela: o pé do
       computador fica fora da caixa do elemento, e sem juntar os filhos
       ele sairia cortado. */
    const r = await pag.evaluate(() => {
      const el = document.getElementById('peca');
      let { left: x1, top: y1, right: x2, bottom: y2 } = el.getBoundingClientRect();
      for (const f of el.querySelectorAll('*')) {
        const b = f.getBoundingClientRect();
        x1 = Math.min(x1, b.left); y1 = Math.min(y1, b.top);
        x2 = Math.max(x2, b.right); y2 = Math.max(y2, b.bottom);
      }
      return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    });
    const folga = r.w * FOLGA;

    await pag.screenshot({
      path: path.join(PASTA, `${m.nome}.png`),
      omitBackground: true,
      clip: { x: r.x - folga, y: r.y - folga, width: r.w + folga * 2, height: r.h + folga * 2 },
    });
  }

  await ctx.close();
  try { fs.unlinkSync(RASCUNHO); } catch (e) { /* já não estava lá */ }
  if (faltando.length) {
    throw new Error(`faltam capturas: ${[...new Set(faltando)].join(', ')}. Rode o capturar.mjs antes.`);
  }
  return MOLDURAS.length;
}
