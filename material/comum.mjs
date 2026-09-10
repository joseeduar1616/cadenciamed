/* Peças de desenho compartilhadas pelos dois PDFs.
 *
 * Os dois materiais são páginas A4 deitadas, montadas em HTML e impressas
 * pelo Chromium. Tudo que é desenho (fundo, vidro, relevo, esfera) sai de
 * CSS e SVG, e não de imagem: assim vai vetorial para dentro do PDF e
 * continua nítido em qualquer zoom ou impressão. As únicas imagens são as
 * capturas do app, que já saem em 4200px de largura.
 *
 * As cores são as mesmas variáveis do site (fonte/base.jsx, THEME_CSS).
 */
import fs from 'node:fs';
import path from 'node:path';

const AQUI = path.dirname(new URL(import.meta.url).pathname);
export const RAIZ = path.resolve(AQUI, '..');

export const COR = {
  fundo: '#04030A', fundo2: '#0A0714',
  tinta: '#F5F2FF', meio: '#B5ACD4', fraco: '#807899', fantasma: '#585072',
  neon: '#35E4FF', neon2: '#A855F7',
  ok: '#3EE0B0', aviso: '#FFB648', ruim: '#FF6B85',
  CL: '#FF9450', CI: '#3EE0B0', GO: '#4FA8FF', PE: '#FF6FB0', PR: '#A182E6',
  linha: 'rgba(170,145,255,0.14)', linha2: 'rgba(185,160,255,0.32)',
  vidro: 'rgba(15,12,28,0.62)', vidro2: 'rgba(26,21,44,0.74)',
};

/* A marca de impressão, recortada do original pelo molduras.mjs. Não é a
   fonte/marca.png: aquela é feita para a web e traz um brilho cortado no
   meio, que no papel vira uma caixa de borda reta em volta da onda. */
export const marcaBase64 = () => 'molduras/marca.png';

/* Quanto da altura do arquivo é a onda de verdade: o resto, 37%, é o brilho
   em volta. Ele fica dentro da imagem de propósito, senão o corte cria uma
   borda reta. Quem pede a marca por altura passa por aqui para o traço sair
   do tamanho pedido, e não 37% menor. A largura não precisa: a linha do
   eletro vai de ponta a ponta do arquivo. */
export const MARCA_ONDA = 0.63;
export const marcaAltura = (mm) => `height:${(mm / MARCA_ONDA).toFixed(1)}mm;width:auto`;

export const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* Escreve o texto com a cor caminhando de uma ponta à outra, uma letra por
   vez. Substitui o background-clip:text, que não sobrevive à impressão. */
const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
export function tituloGradiente(texto, de = COR.neon, ate = COR.neon2) {
  const letras = [...String(texto)];
  const passos = Math.max(1, letras.length - 1);
  const a = hex(de), b = hex(ate);
  return letras.map((ch, i) => {
    if (ch === ' ') return ' ';
    const t = i / passos;
    const cor = a.map((v, k) => Math.round(v + (b[k] - v) * t))
      .map((v) => v.toString(16).padStart(2, '0')).join('');
    return `<span style="color:#${cor}">${esc(ch)}</span>`;
  }).join('');
}

/* ── o CSS ────────────────────────────────────────────────────────────
 * Uma página é sempre 297x210mm com sangria total: o Chromium imprime
 * exatamente o que está na caixa, sem margem própria.
 */
export function estilo(fontes) {
  return `
${fontes}

@page { size: A4 landscape; margin: 0; }

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  background: ${COR.fundo};
  color: ${COR.tinta};
  font-family: 'Inter', system-ui, sans-serif;
  -webkit-font-smoothing: antialiased;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.pg {
  position: relative;
  width: 297mm; height: 210mm;
  overflow: hidden;
  page-break-after: always;
  break-after: page;
  background: ${COR.fundo};
  display: flex; flex-direction: column;
}
.pg:last-child { page-break-after: auto; break-after: auto; }

/* ── fundo ──────────────────────────────────────────────────────────
   Três camadas: a malha fina, as auras de cor e um clarão na base. É o
   mesmo ambiente do site, redesenhado para a folha. */
.fundo { position: absolute; inset: 0; pointer-events: none; }
.malha {
  position: absolute; inset: 0; opacity: .5;
  background-image:
    linear-gradient(rgba(150,130,255,.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(150,130,255,.055) 1px, transparent 1px);
  background-size: 14mm 14mm;
  mask-image: radial-gradient(120% 120% at 50% 40%, #000 30%, transparent 78%);
  -webkit-mask-image: radial-gradient(120% 120% at 50% 40%, #000 30%, transparent 78%);
}
/* Sem blur: um radial-gradient já nasce suave, e o filtro em cima só fazia
   o Chromium achatar o fundo inteiro em bitmap na hora de imprimir. */
.aura { position: absolute; border-radius: 50%; }
.aura-a { width: 150mm; height: 150mm; top: -55mm; left: -35mm;
  background: radial-gradient(circle, ${COR.neon}42, transparent 66%); }
.aura-b { width: 165mm; height: 165mm; top: -40mm; right: -45mm;
  background: radial-gradient(circle, ${COR.neon2}55, transparent 66%); }
.aura-c { width: 175mm; height: 120mm; bottom: -60mm; left: 30%;
  background: radial-gradient(circle, ${COR.ok}2e, transparent 68%); }
.base-luz {
  position: absolute; left: -10%; right: -10%; bottom: -36mm; height: 70mm;
  background: radial-gradient(50% 100% at 50% 100%, ${COR.neon}26, transparent 70%);
}
.fio-topo {
  position: absolute; top: 0; left: 0; right: 0; height: .4mm;
  background: linear-gradient(90deg, transparent, ${COR.neon}, ${COR.neon2}, transparent);
  opacity: .8;
}

/* ── grade da página ─────────────────────────────────────────────── */
.corpo { position: relative; z-index: 2; flex: 1; display: flex; flex-direction: column;
  padding: 14mm 18mm 12mm; min-height: 0; }
.corpo.solto { padding: 0; }
/* Numa coluna flex a imagem estica na largura toda e o width:auto deixa de
   valer: sem isto a marca das capas saía deformada, de ponta a ponta da
   folha. Vale para qualquer imagem dentro do corpo; as capturas ficam em
   molduras que não são flex, então a regra não as alcança. */
.corpo img { align-self: flex-start; }

/* O que vem depois do cabeçalho ocupa a altura que sobra e fica centrado
   nela, para a página não terminar com um palmo de vazio embaixo. */
.miolo { flex: 1; min-height: 0; display: flex; flex-direction: column; justify-content: center; }

.cabeca { display: flex; align-items: center; justify-content: space-between; gap: 8mm;
  margin-bottom: 7mm; flex-shrink: 0; }
/* Sem filter: drop-shadow. Além de rasterizar a camada na impressão, ele
   punha um segundo halo por cima do que a própria imagem já tem.
   A altura é 12.7mm e não 8mm porque a onda ocupa 63% da altura do arquivo:
   o resto é o brilho, que precisa estar dentro da imagem para não virar
   borda. Ver MARCA_ONDA, no alto deste arquivo. */
.cabeca .marca { height: 12.7mm; width: auto; }

.olho { font-family: 'JetBrains Mono', monospace; font-size: 7pt; letter-spacing: .34em;
  text-transform: uppercase; color: ${COR.neon}; display: flex; align-items: center; gap: 3mm; }
.olho::before { content: ''; width: 8mm; height: .3mm; background: currentColor; flex-shrink: 0; }

h1.tit { font-family: 'Inter', sans-serif; font-weight: 800; text-transform: uppercase;
  letter-spacing: -.025em; line-height: 1.0; font-size: 34pt; }
h2.tit { font-family: 'Inter', sans-serif; font-weight: 800; text-transform: uppercase;
  letter-spacing: -.022em; line-height: 1.04; font-size: 21pt; }
/* O gradiente do título é feito letra a letra, pelo tituloGradiente() logo
   abaixo, e não com background-clip:text. Impresso, o recorte no texto
   deixa um retângulo de sobra em volta da palavra: aparece no PDF e não na
   tela, que foi como passou despercebido da primeira vez. Letra colorida é
   texto comum, sai vetorial e não tem o que sobrar. */

p.txt { font-size: 10pt; line-height: 1.62; color: ${COR.meio}; max-width: 105mm; }
p.txt.larga { max-width: 175mm; }
.mini { font-size: 8pt; line-height: 1.5; color: ${COR.fraco}; }
.rotulo { font-family: 'JetBrains Mono', monospace; font-size: 6.6pt; letter-spacing: .22em;
  text-transform: uppercase; color: ${COR.fraco}; }
strong { color: ${COR.tinta}; font-weight: 700; }

/* ── vidro ──────────────────────────────────────────────────────────
   O painel do site: fundo escuro translúcido, fio de luz na borda de cima,
   reflexo na diagonal e marcas de canto. */
.vidro { position: relative; border-radius: 4mm; background: ${COR.vidro};
  border: .3mm solid ${COR.linha};
  box-shadow: 0 8mm 22mm -12mm #000c, inset 0 .3mm 0 #ffffff14; }
.vidro::before { content: ''; position: absolute; inset: 0; border-radius: inherit;
  background: linear-gradient(158deg, #bfa8ff17, transparent 48%); pointer-events: none; }
.vidro::after { content: ''; position: absolute; top: -.3mm; left: 12%; right: 12%; height: .3mm;
  background: linear-gradient(90deg, transparent, var(--brilho, ${COR.neon}), transparent);
  box-shadow: 0 0 3mm var(--brilho, ${COR.neon}); }
.vidro .conteudo { position: relative; z-index: 1; }

/* ── relevo ─────────────────────────────────────────────────────────
   As molduras com perspectiva não são desenhadas aqui: elas chegam
   prontas, em PNG de alta resolução, do molduras.mjs. Transform 3D na
   folha de impressão faz o Chromium rasterizar a camada na resolução de
   tela, e era isso que reduzia as capturas de 4200px para 408px dentro do
   PDF. Imagem plana ele embute inteira. */
.moldura { display: block; width: 100%; height: auto; }

/* esfera com volume, o "3D" das capas */
.esfera { position: relative; border-radius: 50%;
  background:
    radial-gradient(34% 30% at 34% 28%, #ffffffcc, transparent 58%),
    radial-gradient(70% 66% at 40% 34%, ${COR.neon}, transparent 62%),
    radial-gradient(90% 90% at 62% 70%, ${COR.neon2}, #2a0f4d 72%);
  box-shadow:
    inset -6mm -8mm 18mm #0009,
    inset 4mm 4mm 14mm ${COR.neon}55,
    0 14mm 34mm -10mm ${COR.neon2}aa,
    0 0 26mm ${COR.neon2}66;
}
.esfera::after { content: ''; position: absolute; inset: 0; border-radius: 50%;
  background: radial-gradient(56% 50% at 50% 96%, ${COR.neon}55, transparent 62%); }
.anel { position: absolute; border-radius: 50%; border: .3mm solid ${COR.linha2}; }

/* ── peças de conteúdo ──────────────────────────────────────────── */
.grade { display: grid; gap: 5mm; }
.g2 { grid-template-columns: 1fr 1fr; }
.g3 { grid-template-columns: repeat(3, 1fr); }
.g4 { grid-template-columns: repeat(4, 1fr); }

.passo { display: flex; gap: 4mm; align-items: flex-start; }
.passo .n {
  flex-shrink: 0; width: 8mm; height: 8mm; border-radius: 2.2mm;
  display: flex; align-items: center; justify-content: center;
  font-family: 'JetBrains Mono', monospace; font-size: 9pt; font-weight: 700;
  color: ${COR.fundo}; background: linear-gradient(140deg, ${COR.neon}, ${COR.neon2});
  box-shadow: 0 2mm 6mm -2mm ${COR.neon2}, inset 0 .4mm 0 #fff6;
}
.passo .t { font-size: 10pt; font-weight: 700; color: ${COR.tinta}; margin-bottom: 1.4mm; }
.passo .d { font-size: 8.6pt; line-height: 1.55; color: ${COR.meio}; }

.numero { font-family: 'JetBrains Mono', monospace; font-weight: 700;
  letter-spacing: -.04em; line-height: 1; }

.selo { display: inline-flex; align-items: center; gap: 2mm; border-radius: 99mm;
  padding: 1.8mm 4mm; font-size: 8pt; font-weight: 700;
  letter-spacing: .08em; text-transform: uppercase; }

.rodape { position: absolute; left: 18mm; right: 18mm; bottom: 7mm; z-index: 2;
  display: flex; align-items: center; justify-content: space-between;
  font-family: 'JetBrains Mono', monospace; font-size: 6.4pt; letter-spacing: .18em;
  text-transform: uppercase; color: ${COR.fantasma}; }
.rodape .risco { flex: 1; height: .2mm; background: ${COR.linha}; margin: 0 5mm; }
`;
}

/* ── montadores ───────────────────────────────────────────────────── */

export const fundo = (extra = '') => `
<div class="fundo">
  <div class="malha"></div>
  <div class="aura aura-a"></div>
  <div class="aura aura-b"></div>
  <div class="aura aura-c"></div>
  <div class="base-luz"></div>
  <div class="fio-topo"></div>
  ${extra}
</div>`;

export const rodape = (esquerda, direita) => `
<div class="rodape"><span>${esc(esquerda)}</span><span class="risco"></span><span>${esc(direita)}</span></div>`;

export const cabeca = (marca, olho, direita = '') => `
<div class="cabeca">
  <div>
    <img class="marca" src="${marca}" alt="Cadência Med">
    <div class="olho" style="margin-top:3mm">${esc(olho)}</div>
  </div>
  <div style="text-align:right">${direita}</div>
</div>`;

/* Uma captura do app dentro da moldura com relevo, já achatada em imagem
   pelo molduras.mjs. O nome é o da moldura, não o da captura: "hoje-e" é a
   tela de Hoje virada para a esquerda, "hoje-d" para a direita. */
export const tela = (nome, largura = '100%') =>
  `<img class="moldura" src="molduras/${nome}.png" style="width:${largura}">`;

export const fone = (nome, largura = '56mm') =>
  `<img class="moldura" src="molduras/${nome}.png" style="width:${largura}">`;

export const passo = (n, titulo, texto) => `
<div class="passo">
  <div class="n">${esc(n)}</div>
  <div><div class="t">${esc(titulo)}</div><div class="d">${texto}</div></div>
</div>`;

export const numero = (valor, rotulo, cor = COR.tinta, tamanho = '20pt') => `
<div>
  <div class="numero" style="font-size:${tamanho};color:${cor}">${esc(valor)}</div>
  <div class="rotulo" style="margin-top:1.8mm">${esc(rotulo)}</div>
</div>`;

export function pagina(conteudo, { solto = false } = {}) {
  return `<section class="pg">${fundo()}<div class="corpo${solto ? ' solto' : ''}">${conteudo}</div></section>`;
}

export function documento(titulo, fontes, paginas) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<title>${esc(titulo)}</title><style>${estilo(fontes)}</style></head>
<body>${paginas.join('\n')}</body></html>`;
}
