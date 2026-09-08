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
              'Revisões', 'Rotina', 'Amigos', 'Metas', 'Progresso', 'Plano|Assinar'];

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

/* ── boas-vindas ──────────────────────────────────────────────────────
   A primeira tela pede conta. Aqui não há rede, então o Firebase não
   carrega e a tela cai na entrada pelo nome — que é justamente o caminho
   que precisa existir: sem essa reserva, quem abrisse o site com o Firebase
   fora do ar veria um login que não funciona e não teria como passar. */
const semConta = pag.locator('button:has-text("usar sem conta")');
if (await semConta.count() > 0) {
  await semConta.first().click();
  await pag.waitForTimeout(400);
  ok('a primeira tela abre na conta, com saída para usar sem conta');
}
const campoNome = pag.locator('input[placeholder="Seu nome"]');
if (await campoNome.count() > 0) {
  ok('sem sincronização disponível, as boas-vindas não travam: dá para começar pelo nome');
  await campoNome.fill('Teste');
  await pag.locator('button:has-text("Começar")').first().click();
  await pag.waitForTimeout(1000);
  ok('passou pelas boas-vindas');
} else falha('as boas-vindas não ofereceram nenhum caminho para entrar');

/* ── nada pode ficar se recarregando sozinho ──────────────────────────
   O objeto da nuvem nascia novo a cada render, e quem o usava como
   dependência disparava o efeito, mudava estado, renderizava de novo e
   recomeçava: na tela a aba piscava sem parar, e por baixo saía uma chamada
   ao servidor por render. Aqui as abas que fazem isso ficam abertas por um
   tempo e o teste conta quantas vezes elas tentam falar com o servidor. */
let chamadas = 0;
await pag.route('**/api/**', (rota) => {
  chamadas += 1;
  rota.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true,"salas":[],"baralhos":[]}' });
});

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
  /* ── o assistente entrou no plano completo ───────────────────────── */
  /* O teste.html abre com o plano liberado, então aqui a aba tem de
     aparecer. Quem não assina e não é o dono não a vê, e o servidor faz a
     mesma checagem — testada no testar-assistente.mjs, que é onde a regra
     realmente protege alguma coisa. */
  const temAssistente = await pag.locator('nav button:has-text("Assistente")').count();
  if (temAssistente > 0) ok('a aba Assistente aparece para quem tem o plano completo');
  else falha('a aba Assistente sumiu para quem tem o plano completo');

  /* anexar o cronograma do curso, que o assistente passa a enxergar */
  await ir('Assistente');
  const anexar = pag.locator('button:has-text("Anexar meu cronograma")');
  if (await anexar.count() === 0) falha('não achei o botão de anexar o cronograma');
  else {
    await anexar.first().click();
    await pag.waitForTimeout(300);
    await pag.locator('textarea').first().fill('Semana 1 — Cardiologia: valvopatias');
    await pag.locator('button:has-text("Guardar")').first().click();
    await pag.waitForTimeout(400);
    if (/cronograma anexado|caracteres/.test(await texto())) ok('o cronograma do curso fica anexado no assistente');
    else falha('o cronograma anexado não apareceu');
  }
  await ir('Cartões');

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

  /* ── ajustes do baralho: embaralhar e limites por dia ────────────── */
  const engrenagemB = pag.locator('button[aria-label^="Ajustes de"]');
  if (await engrenagemB.count() === 0) falha('não achei a engrenagem de ajustes do baralho');
  else {
    await engrenagemB.first().click();
    await pag.waitForTimeout(300);
    const t = await texto();
    if (/Embaralhar a ordem/.test(t)) ok('o painel de ajustes do baralho abre');
    else falha('o painel de ajustes não abriu');
    if (/máx\. por dia/.test(t)) ok('o limite por dia fica no painel do baralho');
    else falha('não achei o limite por dia');
  }

  /* estudar um baralho só, pelo play da linha dele */
  const play = pag.locator('button[aria-label^="Estudar "]');
  if (await play.count() === 0) falha('não achei o botão de estudar um baralho só');
  else ok('cada baralho tem seu botão de estudar');

  /* ── imagens do cartão ───────────────────────────────────────────
     As imagens ficam no IndexedDB deste navegador, e o cartão só guarda o
     marcador [[img:nome]]. O teste grava uma imagem no depósito e cria dois
     cartões com imagens diferentes, para conferir duas coisas: que a imagem
     aparece, e que trocar de cartão troca a imagem — o componente é o mesmo
     entre um cartão e outro, e antes ele desistia de buscar a segunda. */
  const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
  await pag.evaluate(async (uri) => {
    const bd = await new Promise((ok) => {
      const req = indexedDB.open('cadencia-midia', 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('arquivos')) req.result.createObjectStore('arquivos');
      };
      req.onsuccess = () => ok(req.result);
    });
    await new Promise((ok) => {
      const tx = bd.transaction('arquivos', 'readwrite');
      tx.objectStore('arquivos').put(uri, 'foto-um.gif');
      tx.objectStore('arquivos').put(uri, 'foto-dois.gif');
      tx.oncomplete = ok;
    });
    bd.close();
  }, PIXEL);

  for (const [n, arq] of [['um', 'foto-um.gif'], ['dois', 'foto-dois.gif']]) {
    /* "Novo cartão" alterna: se o formulário já estiver aberto, clicar
       fecharia em vez de abrir. */
    if (await pag.locator('textarea').count() === 0) {
      await pag.locator('button:has-text("Novo cartão")').first().click();
      await pag.waitForTimeout(400);
    }
    /* O formulário guarda a pasta de antes, e a pasta foi renomeada no
       passo anterior: sem repetir o nome aqui, estes cartões criariam uma
       segunda pasta com um baralho de mesmo nome, e o teste de apagar
       encontraria dois. */
    /* Pelo placeholder, e não por posição: com o painel de ajustes aberto
       existem outros campos antes destes, e o nth(0) pegava o errado. */
    await pag.locator('input[placeholder="Ex.: Clínica"]').fill('Pasta renomeada');
    await pag.locator('input[placeholder="Ex.: Cardiologia"]').first().fill('Baralho de teste');
    const a = pag.locator('textarea');
    await a.nth(0).fill(`Com imagem ${n} [[img:${arq}]]`);
    await a.nth(1).fill(`resposta ${n}`);
    await pag.locator('button:has-text("Criar cartão")').first().click();
    await pag.waitForTimeout(400);
  }

  await pag.locator('button:has-text("Estudar")').first().click();
  await pag.waitForTimeout(700);
  const vistas = new Set();
  let comImagem = 0;
  for (let i = 0; i < 4; i++) {
    const src = await pag.locator('main img, [style*="position: fixed"] img').first()
      .getAttribute('src').catch(() => null);
    const aviso = /imagem indisponível/.test(await pag.evaluate(() => document.body.innerText));
    const frente = await pag.evaluate(() => document.body.innerText.match(/Com imagem (um|dois)/)?.[1] || '');
    if (frente) { vistas.add(frente); if (src && !aviso) comImagem += 1; }
    await pag.locator('button:has-text("Ver a resposta")').first().click().catch(() => {});
    await pag.waitForTimeout(250);
    await pag.getByRole('button', { name: /^Fácil/ }).first().click().catch(() => {});
    await pag.waitForTimeout(450);
  }
  if (comImagem >= 1) ok('a imagem do cartão carrega do depósito do navegador');
  else falha('o cartão com imagem mostrou "imagem indisponível"');
  if (vistas.size >= 2 && comImagem >= 2) ok('trocar de cartão troca a imagem, em vez de repetir a anterior');
  else falha(`imagens por cartão: vistas=${[...vistas]} comImagem=${comImagem}`);

  /* Respondidos todos os cartões, o estudo cai na tela de "sessão
     encerrada", que tem "Voltar ao painel" e não o X de encerrar. */
  const voltar = pag.locator('button:has-text("Voltar ao painel")');
  if (await voltar.count()) await voltar.first().click();
  else await pag.locator('button[aria-label="Encerrar o estudo"]').first().click().catch(() => {});
  await pag.waitForTimeout(600);
  await ir('Cartões');

  /* apagar o baralho, com confirmação. O botão desceu para o painel de
     ajustes: cinco controles na mesma linha não cabiam no celular, então o
     painel precisa estar aberto. */
  if (await pag.locator('button[aria-label^="Apagar o baralho"]').count() === 0) {
    await pag.locator('button[aria-label^="Ajustes de"]').first().click();
    await pag.waitForTimeout(400);
  }
  const lixo = pag.locator('button[aria-label^="Apagar o baralho"]');
  if (await lixo.count() === 0) falha('não achei o botão de apagar baralho');
  else {
    await lixo.first().click();
    await pag.waitForTimeout(250);
    /* O painel tem "apagar" e a confirmação tem "Apagar". O has-text do
       Playwright não diferencia maiúscula, então clicava de volta no
       primeiro e fechava a confirmação em vez de confirmar. */
    await pag.getByRole('button', { name: 'Apagar', exact: true }).first().click();
    await pag.waitForTimeout(450);
    if (/Baralho de teste/.test(await texto())) falha('o baralho não foi apagado');
    else ok('baralho apagado');
  }

  /* A caixa de "manter conectado" fica no formulário de entrada, que só
     aparece com a sincronização ligada. Aqui não há rede, então não dá para
     conferir por este teste — e uma asserção que o ambiente não alcança
     seria pior que nenhuma. */

  /* Amigos e Cartões são as abas que consultam o servidor sozinhas. Paradas,
     elas não podem passar de umas poucas chamadas em três segundos. */
  for (const aba of ['Amigos', 'Cartões']) {
    await ir(aba);
    chamadas = 0;
    await pag.waitForTimeout(3000);
    if (chamadas <= 3) ok(`a aba ${aba} fica parada quando não se mexe nela (${chamadas} chamadas em 3s)`);
    else falha(`a aba ${aba} está se recarregando sozinha: ${chamadas} chamadas em 3s`);
  }
  await ir('Cartões');

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

  /* ── rotina: criar bloco, marcar cumprido, ver o dia e a semana ──── */
  await ir('Rotina');
  await pag.locator('button:has-text("Novo bloco")').first().click();
  await pag.waitForTimeout(300);
  await pag.locator('input[placeholder="Ex.: enfermaria clínica médica"]').fill('Bloco que precisa sobreviver');
  await pag.locator('button:has-text("Adicionar bloco")').first().click();
  await pag.waitForTimeout(400);
  if (/Bloco que precisa sobreviver/.test(await texto())) ok('o bloco criado aparece no dia');
  else falha('o bloco criado não apareceu na agenda');

  const marcar = pag.locator('button[aria-label="Marcar como cumprido"]');
  if (await marcar.count() === 0) falha('não achei o botão de marcar bloco como cumprido');
  else {
    await marcar.first().click();
    await pag.waitForTimeout(400);
    if (/cumprido/.test(await texto())) ok('marcar o bloco muda o estado para cumprido');
    else falha('o bloco não ficou marcado como cumprido');
  }

  await pag.locator('button:has-text("Semana")').first().click();
  await pag.waitForTimeout(400);
  if (/toda semana/.test(await texto())) ok('a vista de semana abre com a linha do tempo');
  else falha('a vista de semana não apareceu');
  await pag.locator('button:has-text("Dia")').first().click();
  await pag.waitForTimeout(300);

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

  /* O que foi cumprido na agenda passa pelo normalize na volta do disco:
     sem estar copiado lá, some a cada recarregar sem avisar. */
  await ir('Rotina');
  const rotinaDepois = await texto();
  if (/Bloco que precisa sobreviver/.test(rotinaDepois)) ok('os blocos da agenda sobrevivem ao recarregar');
  else falha('os blocos da agenda sumiram depois de recarregar');
  if (/cumprido/.test(rotinaDepois)) ok('o bloco marcado como cumprido continua marcado depois de recarregar');
  else falha('a marca de cumprido sumiu depois de recarregar');
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
/* A gaveta desliza, e esperar um tempo fixo dava resultado diferente a cada
   rodada: às vezes a medida caía no meio da animação. Aqui a espera é pela
   posição chegar onde deveria. */
const esperarGaveta = async (querAberta, ms = 3000) => {
  const fim = Date.now() + ms;
  for (;;) {
    const dir = await lateral.first().evaluate((el) => el.getBoundingClientRect().right);
    if (querAberta ? dir > 100 : dir <= 1) return true;
    if (Date.now() > fim) return false;
    await pag.waitForTimeout(100);
  }
};

await pag.locator('button[aria-label="Abrir menu"]').first().click();
const abriu = await esperarGaveta(true);
if (abriu) ok('a gaveta abre no celular');
else falha('a gaveta não abriu no celular');
const todasVisiveis = await pag.locator('aside[aria-label="Navegação"] nav button').count();
if (todasVisiveis >= 9) ok(`a gaveta mostra as ${todasVisiveis} abas de uma vez, sem rolagem lateral`);
else falha('a gaveta não listou as abas: ' + todasVisiveis);
await pag.screenshot({ path: 'captura-gaveta.png' });
await pag.locator('aside[aria-label="Navegação"] nav button').first().click();
const fechou = await esperarGaveta(false);
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
