/* O visual limpo e as ideias trazidas da Easy Medicina, no navegador.
 *
 *  - o visual limpo é o padrão, nos dois temas, sem o fundo vivo; e dá
 *    para voltar ao neon em Configurações;
 *  - o menu lateral fica parado ao rolar a página;
 *  - o estudo de cartões: PERGUNTA/RESPOSTA, os quatro contadores, o
 *    intervalo em cima de cada botão, a resposta reagenda e conta no dia;
 *  - Praticar revê o baralho sem mexer nas datas de revisão;
 *  - Hoje abre com a saudação e as atividades do dia; Cartões mostra a
 *    previsão e a constância.
 *
 *   node testar-visual-easy.mjs [teste.html]
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';

const alvo = path.resolve(process.argv[2] || 'teste.html');
const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

const servidor = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(fs.readFileSync(alvo)); });
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const ENDERECO = `http://127.0.0.1:${servidor.address().port}/`;
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const navegador = await chromium.launch({ args: ['--no-sandbox'], ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}) });
const errosDaPagina = [];

const iso = (d) => { const t = new Date(); t.setDate(t.getDate() + d); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; };
const HOJE = iso(0);
const cart = (id, extra) => ({ id, frente: `Pergunta ${id}`, verso: `Resposta ${id}`, baralho: 'Emergência', pasta: 'CLÍNICA', criado: HOJE, prox: HOJE, inter: 0, facilidade: 2.5, revisoes: 0, lapsos: 0, ...extra });
const FLASH = [
  cart('novo1'),
  cart('rev1', { inter: 10, revisoes: 4 }),
  cart('reap1', { inter: 0, revisoes: 3, lapsos: 1 }),
  cart('futuro1', { prox: iso(5), inter: 5, revisoes: 2 }),
];

async function abrir({ tema = 'light', largura = 1280, extra = {} } = {}) {
  const ctx = await navegador.newContext({ viewport: { width: largura, height: 860 } });
  await ctx.addInitScript(([tm, fl, ex]) => {
    if (location.protocol === 'about:' || window.name === 'semeado') return;
    window.name = 'semeado';
    try {
      localStorage.setItem('cadencia:v3:convite-notificacoes-aparelho', 'x');
      localStorage.setItem('cadencia:v3', JSON.stringify({ profile: { name: 'José Eduardo', onboarded: true }, theme: tm, flash: fl, tema: { versaoVisual: 2 }, ...ex }));
    } catch (e) { /* noop */ }
  }, [tema, FLASH, extra]);
  await ctx.route('https://www.gstatic.com/**', (r) => r.abort());
  const pag = await ctx.newPage();
  pag.on('pageerror', (e) => errosDaPagina.push(e.message));
  await pag.goto(ENDERECO, { waitUntil: 'load' });
  await pag.waitForTimeout(1500);
  const sc = pag.locator('button:has-text("usar sem conta")');
  if (await sc.count()) { await sc.first().click(); await pag.waitForTimeout(500); }
  return { ctx, pag };
}
const dados = (pag) => pag.evaluate(() => JSON.parse(localStorage.getItem('cadencia:v3') || '{}'));
const ir = async (pag, aba) => { await pag.locator(`nav button:has-text("${aba}")`).first().click(); await pag.waitForTimeout(600); };

/* ── 1. o visual ─────────────────────────────────────────────────────── */
for (const tema of ['light', 'dark']) {
  const { ctx, pag } = await abrir({ tema });
  const v = await pag.evaluate(() => ({
    visual: document.documentElement.getAttribute('data-visual'),
    fundo: getComputedStyle(document.body).backgroundColor,
    canvas: document.querySelectorAll('canvas').length,
    auras: document.querySelectorAll('.aura').length,
    titulo: getComputedStyle(document.querySelector('.capa-t')).textTransform,
  }));
  const esperado = tema === 'light' ? 'rgb(245, 244, 248)' : 'rgb(5, 5, 7)';
  if (v.visual === 'limpo' && v.fundo === esperado) ok(`visual limpo é o padrão no tema ${tema === 'light' ? 'claro' : 'escuro'} (fundo ${esperado})`);
  else falha(`${tema}: ` + JSON.stringify(v));
  if (!v.canvas && !v.auras) ok(`sem constelação nem auras no limpo (${tema})`);
  else falha(`fundo vivo no limpo: ` + JSON.stringify(v));
  if (v.titulo === 'none') ok(`título da aba em frase normal, sem caixa alta (${tema})`);
  else falha('título em caixa alta: ' + v.titulo);
  if (tema === 'dark') {
    /* o escuro também pode ser azul-noite, em Configurações */
    await ir(pag, 'Configurações');
    await pag.locator('[data-teste="tom-escuro"] button:has-text("Azul-noite")').click();
    await pag.waitForTimeout(500);
    const azul = await pag.evaluate(() => ({ attr: document.documentElement.getAttribute('data-escuro'), fundo: getComputedStyle(document.body).backgroundColor }));
    if (azul.attr === 'azul' && azul.fundo === 'rgb(11, 17, 32)') ok('o escuro pode ser azul-noite (Configurações › Aparência)');
    else falha('tom azul do escuro: ' + JSON.stringify(azul));
  }
  if (tema === 'light') {
    /* A logo é a do site, a mesma do visual neon: a onda colorida, sem
       filtro, com o nome escrito embaixo. */
    const logo = await pag.evaluate(() => {
      const img = document.querySelector('header img[alt="Cadência Med"]');
      return img ? { filtro: getComputedStyle(img).filter, carregou: img.naturalWidth > 0, nome: /cadência/i.test(img.closest('button').innerText) } : null;
    });
    /* O brilho de sempre da logo pode estar lá; o que não pode é a logo
       virar outra (branca, invertida, dentro de um quadradinho). */
    if (logo && logo.carregou && !/invert|brightness|grayscale/.test(logo.filtro) && logo.nome) ok('a logo original do site continua no topo, com o nome');
    else falha('logo: ' + JSON.stringify(logo));
    await pag.evaluate(() => window.scrollTo(0, 1200));
    await pag.waitForTimeout(300);
    const topo = await pag.evaluate(() => document.querySelector('aside').getBoundingClientRect().top);
    if (Math.abs(topo) < 2) ok('o menu lateral fica parado ao rolar a página');
    else falha('o menu rolou junto: top=' + topo);
    await pag.evaluate(() => window.scrollTo(0, 0));
    await ir(pag, 'Configurações');
    const neon = pag.locator('[data-teste="escolha-visual"] button:has-text("Neon")');
    await neon.click();
    await pag.waitForTimeout(800);
    const depois = await pag.evaluate(() => ({ visual: document.documentElement.getAttribute('data-visual'), canvas: document.querySelectorAll('canvas').length }));
    if (depois.visual === 'neon' && depois.canvas >= 1) ok('em Configurações dá para voltar ao visual neon (com o fundo vivo)');
    else falha('troca para neon: ' + JSON.stringify(depois));
    await pag.waitForFunction(() => (JSON.parse(localStorage.getItem('cadencia:v3') || '{}').tema || {}).visual === 'neon', null, { timeout: 6000 }).catch(() => {});
    const d = await dados(pag);
    if (d.tema && d.tema.visual === 'neon') ok('a escolha do visual fica guardada');
    else falha('visual não guardado: ' + JSON.stringify(d.tema));
  }
  await ctx.close();
}

/* ── 2. o estudo de cartões ──────────────────────────────────────────── */
{
  const { ctx, pag } = await abrir({ largura: 390 });
  await pag.locator('button[aria-label="Abrir menu"]').click();
  await pag.waitForTimeout(300);
  await ir(pag, 'Cartões');
  const jeito = await pag.evaluate(() => localStorage.getItem('cadencia:v3:jeito-cartao'));
  await pag.locator('main button:has-text("Estudar")').first().click();
  await pag.waitForTimeout(600);
  if (await pag.locator('button[title^="Trocar para virar"]').count()) { await pag.locator('button[title^="Trocar para virar"]').click(); await pag.waitForTimeout(300); }
  const cab = await pag.locator('[data-teste="contadores-estudo"]').innerText();
  const limpo = cab.replace(/\s+/g, ' ');
  if (/1 Novos/.test(limpo) && /1 Revisão/.test(limpo) && /1 Reaprend/.test(limpo)) ok('os contadores do estudo: novos, aprendendo, revisão, reaprendendo');
  else falha('contadores: ' + limpo);
  if (/0\/3/.test(await pag.locator('[data-teste="contagem-estudo"]').innerText())) ok('o cabeçalho mostra quanto já foi do total (0/3)');
  else falha('contagem: ' + await pag.locator('[data-teste="contagem-estudo"]').innerText());
  const cartao = await pag.locator('[data-teste="cartao-estudo"]').innerText();
  if (/PERGUNTA/i.test(cartao) && !/RESPOSTA/i.test(cartao)) ok('antes de virar, só a PERGUNTA');
  else falha('cartão antes de virar: ' + cartao);
  const atual = (cartao.match(/Pergunta (\w+)/) || [])[1];
  await pag.locator('button:has-text("Mostrar resposta")').click();
  await pag.waitForTimeout(300);
  const botoes = await pag.locator('[data-teste="botoes-resposta"]').innerText();
  if (/<10m/.test(botoes) && /De novo/.test(botoes) && /Difícil/.test(botoes) && /Bom/.test(botoes) && /Fácil/.test(botoes)) ok('depois de virar: De novo, Difícil, Bom e Fácil, com o intervalo em cima de cada um');
  else falha('botões: ' + botoes);
  if (await pag.locator('[data-teste="resposta-estudo"]').count()) ok('a RESPOSTA aparece embaixo da pergunta');
  else falha('sem a resposta');
  await pag.getByRole('button', { name: 'Bom', exact: true }).click();
  await pag.waitForTimeout(2600);
  let d = await dados(pag);
  const c = (d.flash || []).find((x) => x.id === atual);
  if (c && c.prox > HOJE && c.ultima === HOJE) ok('responder Bom reagenda o cartão e marca o dia da última resposta');
  else falha('cartão depois de Bom: ' + JSON.stringify(c));
  if (d.cartoesDia && d.cartoesDia[HOJE] && d.cartoesDia[HOJE].respostas === 1 && d.cartoesDia[HOJE].acertos === 1) ok('a resposta conta no dia (respostas e acertos)');
  else falha('cartoesDia: ' + JSON.stringify(d.cartoesDia));
  await pag.locator('button[aria-label="Encerrar o estudo"]').click();
  await pag.waitForTimeout(500);

  /* praticar */
  const antes = JSON.stringify((d.flash || []).map((x) => [x.id, x.prox, x.inter]));
  await pag.locator('button[aria-label="Praticar Emergência"]').first().click();
  await pag.waitForTimeout(600);
  const total = await pag.locator('[data-teste="contagem-estudo"]').innerText();
  if (/0\/4/.test(total) && /praticando/.test(await pag.evaluate(() => document.body.innerText))) ok('Praticar abre o baralho inteiro (até o que não vence hoje), marcado como praticando');
  else falha('praticar: ' + total);
  await pag.locator('button:has-text("Mostrar resposta")').click().catch(() => {});
  await pag.waitForTimeout(250);
  await pag.getByRole('button', { name: 'Fácil', exact: true }).click().catch(() => {});
  await pag.waitForTimeout(2600);
  d = await dados(pag);
  const depois = JSON.stringify((d.flash || []).map((x) => [x.id, x.prox, x.inter]));
  if (depois === antes && d.cartoesDia[HOJE].respostas === 2) ok('praticando, a resposta não mexe nas datas de revisão (mas conta como estudo do dia)');
  else falha('praticar mexeu nas revisões: ' + depois + ' vs ' + antes);
  await ctx.close();
}

/* ── 3. Hoje e os números dos cartões ────────────────────────────────── */
{
  const { ctx, pag } = await abrir({ extra: { cartoesDia: { [HOJE]: { respostas: 28, acertos: 24, segundos: 765 }, [iso(-1)]: { respostas: 40, acertos: 30, segundos: 900 } } } });
  const painel = await pag.locator('[data-teste="painel-do-dia"]').innerText().catch(() => '');
  if (/Olá, José\. Pronto para estudar\?/.test(painel) && /Atividades do dia/.test(painel) && /Flashcards do dia/.test(painel)) ok('Hoje abre com a saudação e as atividades do dia');
  else falha('painel do dia: ' + painel.slice(0, 300));
  if (/28/.test(painel) && /12 min 45 s/.test(painel) && /27 s\/cartão/.test(painel)) ok('cartões revisados hoje, com o tempo e os segundos por cartão');
  else falha('anel de hoje: ' + painel.slice(0, 400));
  await pag.locator('[data-teste="atividade-cartoes"] button:has-text("Estudar")').click();
  await pag.waitForTimeout(600);
  if (await pag.locator('[data-teste="previsao-cartoes"]').count()) ok('o botão da atividade leva para a aba Cartões');
  else falha('o botão Estudar da atividade não levou a Cartões');
  const barras = await pag.evaluate(() => document.querySelectorAll('[data-teste="previsao-cartoes"] [aria-label$="cartões"]').length);
  if (barras === 30) ok('a previsão mostra os próximos 30 dias');
  else falha('previsão com ' + barras + ' dias');
  const prev = await pag.locator('[data-teste="previsao-cartoes"]').innerText();
  if (/4 cartões nos próximos 7 dias/.test(prev)) ok('a previsão soma o que vence na semana (3 hoje + 1 em 5 dias)');
  else falha('previsão: ' + prev);
  const cal = await pag.locator('[data-teste="calendario-constancia"]').innerText();
  if (/2 de \d+ dias com estudo/.test(cal)) ok('a constância conta os dias com estudo');
  else falha('constância: ' + cal);
  await ctx.close();
}

await navegador.close();
servidor.close();
if (!errosDaPagina.length) ok('nenhum erro de JavaScript na página');
else falha('erros: ' + errosDaPagina.slice(0, 3).join(' | '));
console.log(passos.join('\n'));
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
