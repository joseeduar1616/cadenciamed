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

/* ── a marca, em versão de impressão ──────────────────────────────────
 *
 * A fonte/marca.png é feita para a web: 440px de largura e reduzida a 128
 * cores. Pior, o recorte dela apara em alfa 40, o que corta o brilho no
 * meio: a imagem termina com alfa 244 na borda direita. Sobre o fundo do
 * site aquilo some, mas no PDF vira uma caixa clara de borda reta em volta
 * da onda. Era o que estava estragando as logos.
 *
 * Aqui a onda é recortada de novo do logo-original.png, que tem 1024px e
 * todas as cores, aparando só onde o alfa é praticamente zero. Sem corte no
 * meio do brilho não há borda, e sem quantização não há faixa de cor.
 */
export async function marcaImpressao(nav) {
  const origem = path.join(AQUI, '..', 'fonte', 'logo-original.png');
  if (!fs.existsSync(origem)) throw new Error('não achei fonte/logo-original.png');

  const ctx = await nav.newContext();
  const pag = await ctx.newPage();
  /* O original entra como data URL, e não como caminho de arquivo: uma
     imagem vinda de outro endereço contamina o canvas, e o getImageData
     que mede o recorte passa a ser recusado por segurança. */
  const dataUrl = 'data:image/png;base64,' + fs.readFileSync(origem).toString('base64');
  fs.writeFileSync(RASCUNHO,
    `<!doctype html><meta charset="utf-8"><img id="src" src="${dataUrl}">`);
  await pag.goto('file://' + RASCUNHO, { waitUntil: 'load' });

  const dados = await pag.evaluate(() => {
    const img = document.getElementById('src');
    if (!img.naturalWidth) return null;
    /* só a onda: o nome escrito embaixo entra separado, como texto */
    const alt = Math.round(img.naturalHeight * 0.72);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = alt;
    const cx = c.getContext('2d');
    cx.drawImage(img, 0, 0);
    const dados = cx.getImageData(0, 0, c.width, c.height);
    const px = dados.data;

    /* Tira o véu esbranquiçado.
     *
     * A arte original foi desenhada para fundo claro e traz uma sombra
     * clara em volta da onda: rgb(255,255,255) com alfa 19, rgb(235,216,255)
     * com alfa 16. Em papel escuro aquilo não some, vira uma mancha atrás do
     * traço, e era ela que sujava as logos.
     *
     * O que separa a sombra do brilho de verdade é a saturação, não o
     * brilho: a sombra fica em 0 a 0,25 e o brilho roxo em 0,54 a 0,75. A
     * regra só olha pixel de alfa baixo, que é onde a sombra mora; o corpo
     * da onda, opaco, nunca é tocado. E a queda é gradual, para não trocar
     * uma borda por outra. */
    const SAT_FORA = 0.15;   // abaixo disto é sombra pura
    const SAT_FICA = 0.45;   // acima disto é brilho da onda
    for (let k = 0; k < px.length; k += 4) {
      const a = px[k + 3];
      if (a === 0 || a > 140) continue;
      const r = px[k], g = px[k + 1], b = px[k + 2];
      const alto = Math.max(r, g, b);
      if (!alto) continue;
      const sat = (alto - Math.min(r, g, b)) / alto;
      if (sat >= SAT_FICA) continue;
      const fica = Math.max(0, (sat - SAT_FORA) / (SAT_FICA - SAT_FORA));
      px[k + 3] = Math.round(a * fica);
    }
    cx.putImageData(dados, 0, 0);

    /* limiar quase zero: apara o vazio de verdade e deixa o brilho inteiro
       dentro da imagem, que é o que evita a borda reta */
    let x1 = c.width, y1 = c.height, x2 = 0, y2 = 0;
    for (let j = 0; j < c.height; j += 1) {
      for (let i = 0; i < c.width; i += 1) {
        if (px[(j * c.width + i) * 4 + 3] > 2) {
          if (i < x1) x1 = i; if (i > x2) x2 = i;
          if (j < y1) y1 = j; if (j > y2) y2 = j;
        }
      }
    }
    if (x2 <= x1) return null;
    const lw = x2 - x1 + 1, lh = y2 - y1 + 1;
    const o = document.createElement('canvas');
    o.width = lw; o.height = lh;
    o.getContext('2d').drawImage(c, x1, y1, lw, lh, 0, 0, lw, lh);
    return { url: o.toDataURL('image/png'), w: lw, h: lh };
  });

  await ctx.close();
  try { fs.unlinkSync(RASCUNHO); } catch (e) { /* já não estava lá */ }
  if (!dados) throw new Error('não consegui recortar a onda do logo-original.png');

  fs.mkdirSync(PASTA, { recursive: true });
  fs.writeFileSync(path.join(PASTA, 'marca.png'),
    Buffer.from(dados.url.split(',')[1], 'base64'));
  return dados;
}

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
