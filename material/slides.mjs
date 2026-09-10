/* Os mesmos dois materiais, em PowerPoint editável.
 *
 * Cada página vira um slide montado em duas camadas:
 *
 *   1. o fundo, fotografado da página com as letras invisíveis, que carrega
 *      o desenho inteiro (painéis de vidro, brilho, molduras, capturas);
 *   2. o texto, de volta por cima em caixas de texto de verdade, na posição
 *      e no tamanho medidos no navegador.
 *
 * O motivo de separar é simples: PowerPoint não sabe desenhar vidro, brilho
 * de borda nem degradê fino, e tentar refazer aquilo em formas nativas sairia
 * pior. Assim o desenho fica igual ao do PDF e o texto continua sendo texto,
 * que é o que se quer editar.
 *
 * As caixas seguem o bloco do HTML, não a linha: um parágrafo é uma caixa,
 * um título é uma caixa. Dentro dela cada trecho vira um "run" com a cor e o
 * peso que tinha, então o título com gradiente continua colorido letra a
 * letra sem virar trinta caixinhas.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const AQUI = path.dirname(new URL(import.meta.url).pathname);
export const PASTA = path.join(AQUI, 'slides');
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/* A página é 297x210mm. Em polegada, que é a unidade do PowerPoint. */
export const LARGURA_POL = 297 / 25.4;
export const ALTURA_POL = 210 / 25.4;

/* Escala da foto de fundo. 2 dá por volta de 190 dpi na folha inteira, que
   é o suficiente para slide; as capturas dentro dela já entraram grandes. */
const ESCALA = 2;

/* Roda dentro do navegador. Devolve um bloco por parágrafo, título ou
   rótulo, com a caixa medida e os trechos coloridos de dentro. */
function extrairNaPagina(seletorPagina) {
  const pagina = document.querySelector(seletorPagina);
  const base = pagina.getBoundingClientRect();
  const emLinha = (el) => getComputedStyle(el).display.startsWith('inline');

  const hex = (cor) => {
    const m = String(cor).match(/\d+/g);
    if (!m) return '000000';
    return m.slice(0, 3).map((v) => Number(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  };

  /* Junta os trechos de um bloco, descendo pelos elementos em linha e
     marcando a quebra do <br>. */
  const trechos = (el, saida) => {
    for (const n of el.childNodes) {
      if (n.nodeType === 3) {
        const t = n.nodeValue.replace(/\s+/g, ' ');
        if (t.trim() || (saida.length && !saida[saida.length - 1].quebra)) {
          const e = getComputedStyle(n.parentElement);
          saida.push({
            texto: t,
            cor: hex(e.color),
            /* A caixa alta vem por trecho, não por bloco: o selo "novo" é um
               span de text-transform dentro de um parágrafo que não tem
               nenhum, e lendo só o bloco ele descia para minúscula. */
            caixaAlta: e.textTransform === 'uppercase',
            caixaBaixa: e.textTransform === 'lowercase',
            negrito: Number(e.fontWeight) >= 600,
            italico: e.fontStyle === 'italic',
            riscado: e.textDecorationLine.includes('line-through'),
          });
        }
      } else if (n.nodeType === 1) {
        if (n.tagName === 'BR') { saida.push({ quebra: true }); continue; }
        if (emLinha(n)) trechos(n, saida);
      }
    }
    return saida;
  };

  const blocos = [];
  const visitar = (el) => {
    const e = getComputedStyle(el);
    if (e.display === 'none' || e.visibility === 'hidden' || Number(e.opacity) === 0) return;

    let direto = false;
    const dentro = [];
    for (const n of el.childNodes) {
      if (n.nodeType === 3 && n.nodeValue.trim()) direto = true;
      else if (n.nodeType === 1 && n.tagName !== 'BR' && emLinha(n) && n.textContent.trim()) dentro.push(n);
    }

    /* Quando o texto todo do bloco vem de um único filho em linha, a caixa
       boa é a do filho. O selo do cabeçalho é assim: um span de 8pt dentro
       de uma faixa que atravessa a página. Medindo o pai, o selo saía com o
       corpo do pai e com a largura da folha, quebrando em duas linhas por
       cima da pastilha. */
    if (!direto && dentro.length === 1) {
      visitar(dentro[0]);
      for (const f of el.children) if (!emLinha(f)) visitar(f);
      return;
    }

    if (direto || dentro.length) {
      const r = el.getBoundingClientRect();
      const partes = trechos(el, []);
      /* tira o espaço solto das pontas, que vem da indentação do HTML */
      while (partes.length && !partes[0].quebra && !partes[0].texto.trim()) partes.shift();
      while (partes.length && !partes[partes.length - 1].quebra
        && !partes[partes.length - 1].texto.trim()) partes.pop();
      if (partes.length) {
        if (partes[0].texto) partes[0].texto = partes[0].texto.replace(/^ /, '');
        const u = partes[partes.length - 1];
        if (u.texto) u.texto = u.texto.replace(/ $/, '');
      }
      const caixa = Number(e.fontSize.replace('px', ''));

      /* O rect é a caixa de borda, e o respiro interno não é lugar de
         texto: o selo tem 4mm de cada lado, e sem descontar isso a última
         letra passava por cima da borda arredondada. */
      const pe = parseFloat(e.paddingLeft) || 0;
      const pd = parseFloat(e.paddingRight) || 0;
      const pc = parseFloat(e.paddingTop) || 0;
      const pb = parseFloat(e.paddingBottom) || 0;

      /* Um ::before que ocupa lugar entra na medida do elemento sem ser
         texto: é o caso do risco do rótulo, 8mm mais 3mm de respiro antes
         da primeira letra. Sem descontar isso a caixa de texto começa no
         risco e a palavra sai por cima dele. O Range mede só o conteúdo de
         verdade, então a diferença entre ele e o respiro é o recuo. */
      let recuo = 0;
      const antes = getComputedStyle(el, '::before');
      if (antes.content !== 'none' && parseFloat(antes.width) > 0) {
        const faixa = document.createRange();
        faixa.selectNodeContents(el);
        const t = faixa.getBoundingClientRect();
        if (t.width > 1) recuo = Math.max(0, t.left - r.left - pe);
      }

      /* Num flex quem centraliza não é o text-align, é o justify-content:
         é assim que o número fica no meio do selo do passo. Lendo só o
         text-align o número saía encostado no canto esquerdo. O mesmo vale
         para o meio na vertical, que ali vem do align-items. */
      const flex = e.display.includes('flex');
      const meio = flex && e.justifyContent === 'center';
      const fim = flex && (e.justifyContent === 'flex-end' || e.justifyContent === 'right');

      const larg = r.width - pe - pd - recuo;
      const alt = r.height - pc - pb;

      if (partes.length && larg > 1 && alt > 1) {
        blocos.push({
          x: (r.left + pe + recuo - base.left) / 96,
          y: (r.top + pc - base.top) / 96,
          largura: larg / 96,
          altura: alt / 96,
          corpo: caixa * 0.75,                     // px para pontos
          fonte: e.fontFamily.split(',')[0].replace(/["']/g, ''),
          alinhamento: e.textAlign === 'center' || meio ? 'center'
            : e.textAlign === 'right' || fim ? 'right' : 'left',
          vertical: flex && e.alignItems === 'center' ? 'middle' : 'top',
          entrelinha: parseFloat(e.lineHeight) / caixa || 1.2,
          espacamento: (parseFloat(e.letterSpacing) || 0) * 0.75,
          partes,
        });
      }
    }

    for (const f of el.children) if (!emLinha(f)) visitar(f);
  };

  visitar(pagina);
  return blocos;
}

/* Abre um documento e devolve um slide por página. */
export async function extrair(nav, arquivoHtml, prefixo) {
  fs.mkdirSync(PASTA, { recursive: true });
  const ctx = await nav.newContext({
    viewport: { width: 1123, height: 794 }, deviceScaleFactor: ESCALA,
  });
  const pag = await ctx.newPage();
  await pag.goto('file://' + arquivoHtml, { waitUntil: 'networkidle' });
  await pag.evaluate(() => document.fonts.ready);
  await pag.waitForTimeout(500);

  const quantas = await pag.locator('.pg').count();
  const slides = [];

  for (let i = 0; i < quantas; i += 1) {
    const seletor = `.pg:nth-of-type(${i + 1})`;
    const blocos = await pag.evaluate(extrairNaPagina, seletor);

    await pag.evaluate(() => document.body.classList.add('sem-texto'));
    await pag.waitForTimeout(90);
    const fundo = path.join(PASTA, `${prefixo}-${String(i + 1).padStart(2, '0')}.png`);
    await pag.locator(seletor).screenshot({ path: fundo });
    await pag.evaluate(() => document.body.classList.remove('sem-texto'));

    slides.push({ fundo, blocos });
  }

  await ctx.close();
  return slides;
}

export async function abrirNavegador() {
  return chromium.launch({ args: ['--no-sandbox'], executablePath: CHROME });
}
