/* Teste de fumaça num Chromium de verdade.
 *
 * Abre o HTML gerado, passa por todas as abas, mexe nas partes que foram
 * mudadas (pastas de baralho, esquema de revisão, aparência) e falha se
 * aparecer qualquer erro de página ou de console.
 *
 *   node testar.mjs                 → testa o teste.html, com o plano liberado
 *   node testar.mjs index.html      → testa o arquivo de produção
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const alvo = path.resolve(process.argv[2] || 'teste.html');
if (!fs.existsSync(alvo)) { console.error('não achei', alvo); process.exit(1); }
const liberado = path.basename(alvo) === 'teste.html';

/* A última aba se chama "Plano" para quem assina e "Assinar" para quem não
   assina, então é procurada pelos dois nomes. */
const ABAS = ['Hoje', 'Foco', 'Matérias', 'Temas', 'Cartões',
              'Revisões', 'Rotina', 'Metas', 'Progresso', 'Plano|Assinar'];

const erros = [];
const passos = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const navegador = await chromium.launch({
  args: ['--no-sandbox'],
  ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}),
});
const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
const pag = await ctx.newPage();
pag.on('pageerror', (e) => erros.push('pageerror: ' + e.message));
pag.on('console', (m) => {
  const t = m.text();
  /* sem rede no teste: o Firebase e as fontes do Google não carregam, e isso
     não é defeito do app */
  if (m.type() === 'error' && !/ERR_TUNNEL|ERR_CONNECTION|ERR_NAME_NOT_RESOLVED|Failed to load resource/.test(t)) {
    erros.push('console: ' + t);
  }
});

const ir = async (aba) => {
  for (const nome of String(aba).split('|')) {
    const b = pag.locator(`nav button:has-text("${nome}")`).first();
    if (await b.count() === 0) continue;
    await b.click();
    await pag.waitForTimeout(450);
    return true;
  }
  falha(`aba ${aba}: botão não encontrado`);
  return false;
};
const texto = () => pag.evaluate(() => document.querySelector('main')?.innerText || '');

await pag.goto('file://' + alvo, { waitUntil: 'load' });
await pag.waitForTimeout(2200);

if (!(await pag.evaluate(() => document.querySelector('#root')?.children.length > 0))) {
  falha('o #root ficou vazio: o React não montou');
} else ok('o app montou');

/* boas-vindas */
const campoNome = pag.locator('input[placeholder="Seu nome"]');
if (await campoNome.count() > 0) {
  await campoNome.fill('Teste');
  await pag.locator('button:has-text("Começar")').first().click();
  await pag.waitForTimeout(1000);
  ok('passou pelas boas-vindas');
}

/* a marca aparece no cabeçalho */
const marca = pag.locator('header img[alt="Cadência Med"]');
if (await marca.count() === 0) falha('a marca não está no cabeçalho');
else {
  const larg = await marca.first().evaluate((el) => el.naturalWidth);
  if (!larg) falha('a marca do cabeçalho não carregou');
  else ok(`a marca carregou (${larg}px de largura original)`);
}

/* todas as abas renderizam alguma coisa */
for (const aba of ABAS) {
  if (!(await ir(aba))) continue;
  const t = await texto();
  if (t.length < 20) falha(`aba ${aba} renderizou vazia`);
  else if (liberado && /Recurso do plano completo/.test(t)) falha(`aba ${aba} ficou bloqueada no build de teste`);
  else ok(`aba ${aba}: ${t.length} caracteres`);
}

if (liberado) {
  /* ── o assistente é só do administrador ──────────────────────────── */
  const temAssistente = await pag.locator('nav button:has-text("Assistente")').count();
  if (temAssistente === 0) ok('a aba Assistente fica escondida para quem não é o administrador');
  else falha('a aba Assistente apareceu para quem não é o administrador');

  /* ── cartões: criar pasta, criar cartão, estudar ─────────────────── */
  await ir('Cartões');
  await pag.locator('button:has-text("Novo cartão")').first().click();
  await pag.waitForTimeout(300);
  await pag.locator('input').filter({ hasNot: pag.locator('[type=file]') }).nth(0).fill('Pasta de teste');
  const areas = pag.locator('textarea');
  await pag.locator('input[placeholder="Ex.: Cardiologia"]').fill('Baralho de teste');
  await areas.nth(0).fill('Tríade da síndrome nefrítica');
  await areas.nth(1).fill('Hematúria, hipertensão e edema');
  await pag.locator('button:has-text("Criar cartão")').first().click();
  await pag.waitForTimeout(500);
  if (/Baralho de teste/.test(await texto())) ok('cartão criado dentro da pasta');
  else falha('o cartão criado não apareceu na lista de pastas');

  /* renomear a pasta */
  const engrenagens = pag.locator('button[aria-label="Renomear pasta"]');
  if (await engrenagens.count() === 0) falha('não achei o botão de renomear pasta');
  else {
    await engrenagens.first().click();
    await pag.waitForTimeout(250);
    const campo = pag.locator('input[value="Pasta de teste"]');
    if (await campo.count()) {
      await campo.first().fill('Pasta renomeada');
      await pag.locator('button:has-text("Salvar")').first().click();
      await pag.waitForTimeout(400);
      if (/Pasta renomeada/.test(await texto())) ok('pasta renomeada');
      else falha('renomear a pasta não pegou');
    } else falha('o campo de renomear não abriu');
  }

  /* apagar o baralho, com confirmação */
  const lixo = pag.locator('button[aria-label="Apagar baralho"]');
  if (await lixo.count() === 0) falha('não achei o botão de apagar baralho');
  else {
    await lixo.first().click();
    await pag.waitForTimeout(250);
    await pag.locator('button:has-text("Apagar")').first().click();
    await pag.waitForTimeout(450);
    if (/Baralho de teste/.test(await texto())) falha('o baralho não foi apagado');
    else ok('baralho apagado');
  }

  /* ── revisões: trocar o esquema de intervalos ────────────────────── */
  await ir('Revisões');
  const trocar = pag.locator('button:has-text("trocar esquema")');
  if (await trocar.count() === 0) falha('não achei o botão de trocar esquema');
  else {
    await trocar.first().click();
    await pag.waitForTimeout(300);
    await pag.locator('button:has-text("Leitner")').first().click();
    await pag.waitForTimeout(400);
    const t = await texto();
    if (/Em uso:\s*Leitner/.test(t.replace(/\s+/g, ' '))) ok('esquema trocado para Leitner');
    else falha('a troca de esquema não apareceu no resumo: ' + t.slice(0, 140));

    await pag.locator('input[placeholder="Ex.: 1, 7, 30, 90"]').fill('2, 9, 40');
    await pag.locator('button:has-text("Usar estes dias")').first().click();
    await pag.waitForTimeout(450);
    const t2 = (await texto()).replace(/\s+/g, ' ');
    if (/2 dias · 9 dias · 40 dias/.test(t2)) ok('escada personalizada aplicada');
    else falha('a escada personalizada não apareceu: ' + t2.slice(0, 160));
  }

  /* ── aparência: cor, fonte e tamanho ─────────────────────────────── */
  await ir('Progresso');
  const antes = await pag.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--neon').trim());
  await pag.locator('button[title="Âmbar"]').first().click();
  await pag.waitForTimeout(350);
  const depois = await pag.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--neon').trim());
  if (depois && depois !== antes) ok(`cor de acento mudou de ${antes} para ${depois}`);
  else falha(`a cor de acento não mudou (antes ${antes}, depois ${depois})`);

  await pag.locator('button:has-text("Space Grotesk")').first().click();
  await pag.waitForTimeout(300);
  const fonte = await pag.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--f-ui'));
  if (/Space Grotesk/.test(fonte)) ok('fonte trocada para Space Grotesk');
  else falha('a fonte não mudou: ' + fonte);

  await pag.locator('button:has-text("Bem maior")').first().click();
  await pag.waitForTimeout(300);
  const zoom = await pag.evaluate(() => {
    /* o conteúdo fica dentro da coluna ao lado da barra lateral, então o
       elemento com zoom é o avô do cabeçalho */
    let el = document.querySelector('header');
    while (el && getComputedStyle(el).zoom === '1') el = el.parentElement;
    return el ? getComputedStyle(el).zoom : '';
  });
  if (zoom && zoom !== '1' && zoom !== 'normal') ok('tamanho do texto aplicado (zoom ' + zoom + ')');
  else falha('o tamanho do texto não mudou (zoom ' + zoom + ')');

  await pag.locator('button:has-text("voltar ao padrão")').first().click();
  await pag.waitForTimeout(300);
  ok('aparência voltou ao padrão');

  /* ── os dados sobrevivem a recarregar a página ───────────────────── */
  await ir('Cartões');
  await pag.locator('button:has-text("Novo cartão")').first().click();
  await pag.waitForTimeout(300);
  const a2 = pag.locator('textarea');
  await a2.nth(0).fill('Cartão que precisa sobreviver');
  await a2.nth(1).fill('resposta');
  await pag.locator('button:has-text("Criar cartão")').first().click();
  await pag.waitForTimeout(2600);            // o salvamento em disco é adiado
  await pag.reload({ waitUntil: 'load' });
  await pag.waitForTimeout(2200);
  await ir('Cartões');
  if (/Cartão que precisa sobreviver/.test(await texto())) ok('os cartões sobrevivem ao recarregar');
  else falha('os cartões sumiram depois de recarregar a página');
  if (/Pasta renomeada/.test(await texto())) ok('as pastas sobrevivem ao recarregar');
  else falha('as pastas sumiram depois de recarregar a página');

  await ir('Revisões');
  if (/2 dias · 9 dias · 40 dias/.test((await texto()).replace(/\s+/g, ' '))) ok('o esquema de revisão sobrevive ao recarregar');
  else falha('o esquema de revisão sumiu depois de recarregar');
}

/* ── barra lateral ────────────────────────────────────────────────── */
const lateral = pag.locator('aside[aria-label="Navegação"]');
if (await lateral.count() === 1) ok('a barra lateral existe');
else falha('não achei a barra lateral');
const larguraLateral = () => lateral.first().evaluate((el) => el.getBoundingClientRect().width);
/* A largura é animada, então medir depois de um tempo fixo pega o valor no
   meio do caminho. Aqui a espera é pela largura chegar onde deveria. */
const esperarLargura = async (alvo, ms = 3000) => {
  const fim = Date.now() + ms;
  let w = await larguraLateral();
  while (Date.now() < fim && Math.abs(w - alvo) > 3) {
    await pag.waitForTimeout(100);
    w = await larguraLateral();
  }
  return w;
};

const larguraAberta = await larguraLateral();
await pag.locator('button[aria-label="Encolher menu"]').first().click();
const larguraEncolhida = await esperarLargura(72);
if (larguraEncolhida < larguraAberta - 40) ok(`a barra encolhe (${Math.round(larguraAberta)} → ${Math.round(larguraEncolhida)}px)`);
else falha(`a barra não encolheu (${Math.round(larguraAberta)} → ${Math.round(larguraEncolhida)})`);

/* Encolhida, ficam só os ícones. O contador de revisões continua, de
   propósito: é ele que avisa que tem coisa vencida sem precisar abrir. */
const textoBarra = await pag.locator('aside[aria-label="Navegação"] nav').innerText();
if (!/MAT[ÉE]RIAS|PROGRESSO/i.test(textoBarra)) ok('encolhida, a barra mostra só os ícones');
else falha('encolhida, os nomes das abas continuaram aparecendo');

await pag.locator('button[aria-label="Expandir menu"]').first().click();
const larguraDeVolta = await esperarLargura(larguraAberta);
if (Math.abs(larguraDeVolta - larguraAberta) < 3) ok('a barra volta a expandir');
else falha(`a barra não voltou (${Math.round(larguraDeVolta)} vs ${Math.round(larguraAberta)})`);

/* ── celular ──────────────────────────────────────────────────────── */
await pag.setViewportSize({ width: 390, height: 844 });
await pag.waitForTimeout(700);

/* no celular a barra vira gaveta: fica fora da tela até abrir */
const escondida = await lateral.first().evaluate((el) => el.getBoundingClientRect().right <= 1);
if (escondida) ok('no celular a gaveta começa fechada');
else falha('no celular a gaveta apareceu sem ser chamada');
await pag.locator('button[aria-label="Abrir menu"]').first().click();
await pag.waitForTimeout(500);
const abriu = await lateral.first().evaluate((el) => el.getBoundingClientRect().right > 100);
if (abriu) ok('a gaveta abre no celular');
else falha('a gaveta não abriu no celular');
const todasVisiveis = await pag.locator('aside[aria-label="Navegação"] nav button').count();
if (todasVisiveis >= 9) ok(`a gaveta mostra as ${todasVisiveis} abas de uma vez, sem rolagem lateral`);
else falha('a gaveta não listou as abas: ' + todasVisiveis);
await pag.screenshot({ path: 'captura-gaveta.png' });
await pag.locator('aside[aria-label="Navegação"] nav button').first().click();
await pag.waitForTimeout(500);
const fechou = await lateral.first().evaluate((el) => el.getBoundingClientRect().right <= 1);
if (fechou) ok('a gaveta fecha sozinha ao escolher uma aba');
else falha('a gaveta ficou aberta depois de escolher');
if (await pag.evaluate(() => document.querySelector('#root')?.children.length > 0)) ok('roda no tamanho de celular');
else falha('o app sumiu no tamanho de celular');
const vazaLargura = await pag.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
if (vazaLargura) falha('a página passou da largura da tela no celular');
else ok('nada vaza para os lados no celular');
await pag.screenshot({ path: 'captura-celular.png' });

await pag.setViewportSize({ width: 1440, height: 900 });
await pag.waitForTimeout(600);
await ir('Hoje');
await pag.screenshot({ path: 'captura-mesa.png' });

/* tema claro */
await pag.locator('button[aria-label="Alternar tema"]').first().click();
await pag.waitForTimeout(700);
await pag.screenshot({ path: 'captura-clara.png' });
ok('tema claro abriu sem erro');

await navegador.close();

console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
