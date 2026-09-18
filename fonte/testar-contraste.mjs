/* Nenhum texto do site pode ficar ilegível — nos dois temas.
 *
 * Este teste existe porque o contraste vinha sendo conferido no papel: os
 * quatro tons de texto eram medidos contra o valor ESCRITO do painel mais
 * claro. Na tela não é isso que acontece. Os painéis são translúcidos e se
 * empilham, a cor de acento reescreve a paleta inteira, e o resultado
 * composto é outro. Foi assim que o texto do tema claro foi clareando sem
 * ninguém ver: cada conta dava certo sozinha.
 *
 * Aqui quem mede é o navegador. O teste abre o site, percorre cada pedaço
 * de texto que aparece, pergunta a cor final e o fundo final — subindo a
 * árvore até achar um fundo opaco de verdade, que é o que o olho vê — e
 * cobra o mínimo da WCAG: 4.5:1 para texto corrido, 3:1 para texto grande.
 *
 *   node testar-contraste.mjs [arquivo.html]
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const alvo = path.resolve(process.argv[2] || 'teste.html');
if (!fs.existsSync(alvo)) { console.error('não achei', alvo); process.exit(1); }

const erros = [];
const ok = (m) => console.log('ok   ' + m);
const falha = (m) => { console.log('FALHA ' + m); erros.push(m); };

const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const navegador = await chromium.launch({
  args: ['--no-sandbox'],
  ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}),
});
const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
const pag = await ctx.newPage();

await pag.addInitScript(() => {
  try {
    window.localStorage.setItem('cadencia:v3', JSON.stringify({ profile: { name: 'Teste' } }));
  } catch (e) { /* sem localStorage, o teste ainda abre */ }
});

await pag.goto('file://' + alvo, { waitUntil: 'load' });
await pag.waitForTimeout(1800);

const semConta = pag.locator('button:has-text("usar sem conta")');
if (await semConta.count() > 0) { await semConta.first().click(); await pag.waitForTimeout(400); }
const campoNome = pag.locator('input[placeholder="Seu nome"]');
if (await campoNome.count() > 0) {
  await campoNome.fill('Teste');
  await pag.locator('button:has-text("Começar")').first().click();
  await pag.waitForTimeout(900);
}

/* A medição. Roda dentro da página porque só lá existe cor computada. */
const MEDIR = () => {
  const lum = (r, g, b) => {
    const c = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
  };
  const razao = (a, b) => {
    const la = lum(a[0], a[1], a[2]), lb = lum(b[0], b[1], b[2]);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };
  const ler = (s) => {
    const m = String(s).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  /* Empilha as camadas translúcidas até chegar num fundo opaco. É esta
     composição que o olho vê, e é ela que faltava na conta antiga. */
  const sobre = (frente, fundo) => {
    const a = frente[3];
    return [
      frente[0] * a + fundo[0] * (1 - a),
      frente[1] * a + fundo[1] * (1 - a),
      frente[2] * a + fundo[2] * (1 - a),
      1,
    ];
  };
  /* Devolve o fundo composto, ou null quando não dá para medir: uma
     gradiente ou uma imagem no caminho não tem "uma cor", e chutar a cor
     de fundo do elemento por baixo dela dava falso positivo — o botão
     principal do site é pintado por background-image, e sem isto ele
     aparecia como letra branca sobre o cinza que o navegador desenha
     quando não há fundo nenhum. */
  const fundoDe = (el) => {
    const camadas = [];
    let n = el;
    while (n && n.nodeType === 1) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      const c = ler(cs.backgroundColor);
      if (c && c[3] > 0) camadas.push(c);
      if (c && c[3] >= 0.999) break;
      n = n.parentElement;
    }
    let base = [255, 255, 255, 1];
    for (let i = camadas.length - 1; i >= 0; i -= 1) base = sobre(camadas[i], base);
    return base;
  };

  const achados = [];
  const vistos = new Set();
  for (const el of document.querySelectorAll('main *, nav *, header *')) {
    if (!el.childNodes.length) continue;
    /* só quem tem texto PRÓPRIO: senão o mesmo texto é medido em cada
       ancestral, e um pai sem cor própria vira falso positivo */
    let proprio = '';
    for (const n of el.childNodes) if (n.nodeType === 3) proprio += n.textContent;
    proprio = proprio.trim();
    if (proprio.length < 2) continue;

    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    if (parseFloat(cs.opacity) < 0.95) continue;   // apagado de propósito

    const cor = ler(cs.color);
    if (!cor) continue;
    const fundo = fundoDe(el);
    if (!fundo) continue;
    const frente = cor[3] < 1 ? sobre(cor, fundo) : cor;

    const tam = parseFloat(cs.fontSize);
    const negrito = parseInt(cs.fontWeight, 10) >= 700;
    /* A WCAG chama de "grande" o texto a partir de 18,66px em negrito ou
       24px comum, e para ele o mínimo cai de 4,5 para 3. */
    const grande = tam >= 24 || (tam >= 18.66 && negrito);
    const alvo = grande ? 3 : 4.5;
    const rz = razao(frente, fundo);

    const chave = `${cs.color}|${Math.round(fundo[0])},${Math.round(fundo[1])},${Math.round(fundo[2])}|${grande}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);

    if (rz < alvo) {
      const caminho = [];
      for (let n = el; n && n !== document.body && caminho.length < 4; n = n.parentElement) {
        caminho.push(n.tagName.toLowerCase()
          + (n.className ? '.' + String(n.className).split(' ').filter(Boolean).slice(0, 2).join('.') : ''));
      }
      achados.push({
        onde: caminho.join(' < '),
        texto: proprio.slice(0, 42), cor: cs.color,
        fundo: `rgb(${fundo.map((x) => Math.round(x)).slice(0, 3).join(',')})`,
        tam, razao: Math.round(rz * 100) / 100, alvo,
      });
    }
  }
  return achados;
};

/* Percorre as abas: o problema não estava na primeira tela. */
const ABAS = ['Hoje', 'Matérias', 'Cartões', 'Agenda', 'Amigos', 'Metas', 'Configurações'];

/* O tema é trocado pelo BOTÃO do site, e não escrevendo o atributo na
   mão: o app reescreve data-theme a cada render, e o atributo forçado
   voltava atrás sem avisar — o teste media o tema escuro duas vezes e
   dizia que o claro estava bom. */
const trocarTema = async (queroClaro) => {
  for (let i = 0; i < 3; i += 1) {
    if (await temaAplicado(queroClaro)) return true;
    const b = pag.locator('button[aria-label="Alternar tema"]');
    if (await b.count() === 0) return false;
    await b.first().click();
    /* Uma espera fixa ANTES de conferir estabilidade. Sem ela, as duas
       amostras caíam as duas antes de a animação começar, davam iguais, e
       o teste seguia medindo a cor do tema anterior sobre o fundo já
       trocado. A transição mais longa da barra é de .25s. */
    await pag.waitForTimeout(800);
    /* Não basta o atributo no <html> ter mudado. O app redeclara as
       variáveis num elemento de dentro, e entre o clique e esse redesenho
       existe um instante em que o fundo já é claro e o texto ainda é o do
       tema escuro. Medir nesse instante acusava um "1.64:1" que some no
       próximo quadro: falha intermitente, que é pior do que teste nenhum.
       Então se espera a COR DE VERDADE de um elemento da tela mudar. */
    for (let espera = 0; espera < 20; espera += 1) {
      if (await temaAplicado(queroClaro)) return true;
    }
  }
  return false;
};

/* O tema está aplicado quando as cores PARARAM de mudar.
 *
 * Duas coisas separam o clique do resultado. A variável troca na hora,
 * mas a cor desenhada é animada (as abas têm transition de .2s), então
 * existe um instante em que o fundo já é claro e a letra ainda está no
 * meio do caminho — e medir ali acusava 1.64:1 numa rodada e nada na
 * seguinte. Falha intermitente é pior do que teste nenhum: ou ninguém
 * acredita nela, ou se perde meia hora atrás de um defeito que não
 * existe. Então espera-se a variável trocar E as cores da tela ficarem
 * iguais entre dois quadros seguidos. */
const coresDaTela = () => pag.evaluate(() => [...document.querySelectorAll('nav .aba, main h2, main p')]
  .slice(0, 40).map((e) => getComputedStyle(e).color).join('|'));

const temaAplicado = async (queroClaro) => {
  const certo = await pag.evaluate((claro) => {
    if ((document.documentElement.getAttribute('data-theme') === 'light') !== claro) return false;
    const alvo = document.querySelector('main') || document.body;
    const cor = getComputedStyle(alvo).getPropertyValue('--ink').trim().toUpperCase();
    /* #140E24 é a tinta do tema claro; #F5F2FF a do escuro. */
    return claro ? cor.startsWith('#14') : cor.startsWith('#F5');
  }, queroClaro);
  if (!certo) return false;
  const antes = await coresDaTela();
  await pag.waitForTimeout(120);
  return (await coresDaTela()) === antes;
};

for (const tema of ['dark', 'light']) {
  if (!await trocarTema(tema === 'light')) {
    falha(`não consegui pôr o site no tema ${tema}`);
    continue;
  }

  const ruins = [];
  for (const aba of ABAS) {
    const b = pag.locator(`nav button:has-text("${aba}")`);
    if (await b.count() === 0) continue;
    await b.first().click();
    await pag.waitForTimeout(350);
    for (const x of await pag.evaluate(MEDIR)) ruins.push({ ...x, aba });
  }

  const nome = tema === 'light' ? 'claro' : 'escuro';
  if (!ruins.length) {
    ok(`tema ${nome}: todo texto visível passa no contraste mínimo`);
  } else {
    const lista = ruins.slice(0, 40).map((x) =>
      `[${x.aba}] "${x.texto}" ${x.cor} sobre ${x.fundo} = ${x.razao}:1 (precisa ${x.alvo})\n            em ${x.onde}`).join('\n        ');
    falha(`tema ${nome}: ${ruins.length} trecho(s) abaixo do mínimo:\n        ${lista}`);
  }
}

await navegador.close();
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
