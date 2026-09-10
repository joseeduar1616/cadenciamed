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
import os from 'node:os';

const alvo = path.resolve(process.argv[2] || 'teste.html');
if (!fs.existsSync(alvo)) { console.error('não achei', alvo); process.exit(1); }
const liberado = path.basename(alvo) === 'teste.html';

/* A última aba se chama "Plano" para quem assina e "Assinar" para quem não
   assina, então é procurada pelos dois nomes. */
const ABAS = ['Hoje', 'Foco', 'Matérias', 'Cronograma', 'Temas', 'Cartões',
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
/* um pixel de verdade, para a ponte de imagem ter o que devolver */
const PIXEL_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
await pag.route('**/api/**', (rota) => {
  chamadas += 1;
  const corpo = /buscar-imagem/.test(rota.request().url())
    ? JSON.stringify({ dados: `data:image/png;base64,${PIXEL_B64}` })
    : '{"ok":true,"salas":[],"baralhos":[]}';
  rota.fulfill({ status: 200, contentType: 'application/json', body: corpo });
});
/* Uma figura "de fora" que o navegador consegue ler (o site libera CORS), e
   outra que recusa — os dois caminhos que o colar precisa tratar. */
await pag.route('**/site-de-fora/**', (rota) => rota.fulfill({
  status: 200,
  contentType: 'image/png',
  headers: { 'access-control-allow-origin': '*' },
  body: Buffer.from(PIXEL_B64, 'base64'),
}));
await pag.route('**/site-fechado/**', (rota) => rota.fulfill({ status: 403, body: 'expirado' }));

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

/* ── aba Cronograma: a escolha do que o painel segue ──────────────────
   É a primeira coisa que quem entra precisa achar, e ela decide o
   conteúdo de todas as outras abas. Aqui só se confere que os três
   caminhos aparecem, que a residência começa em uso e que o cartão do
   ciclo clínico abre o envio: aplicar de verdade depende da IA, que este
   teste não chama. */
await ir('Cronograma');
const escolhas = ['Residência', 'Ciclo clínico', 'Os dois juntos'];
const achadas = [];
for (const e of escolhas) {
  if (await pag.locator(`button:has-text("${e}")`).count() > 0) achadas.push(e);
}
if (achadas.length === escolhas.length) ok('a aba Cronograma oferece os três caminhos');
else falha(`a aba Cronograma só ofereceu: ${achadas.join(', ') || 'nenhum caminho'}`);

if (/em uso/i.test(await texto())) ok('o cronograma em uso vem marcado');
else falha('nenhum cronograma aparece como em uso');

await pag.locator('button:has-text("Ciclo clínico")').first().click();
await pag.waitForTimeout(400);
if (/Traga o conteúdo do ciclo clínico/i.test(await texto())) ok('escolher o ciclo clínico abre o envio do conteúdo');
else falha('escolher o ciclo clínico não abriu o envio');

/* o cronograma em texto, que o assistente enxerga, tem campo próprio:
   guardar aqui não pode depender do envio do ciclo clínico */
const campoRef = pag.locator('textarea[placeholder*="datas do seu curso"]');
if (await campoRef.count() === 0) falha('não achei o campo do cronograma em texto');
else {
  await campoRef.first().fill('10/03 a 24/03, módulo de Cardiologia');
  await pag.locator('button:has-text("Guardar cronograma")').first().click();
  await pag.waitForTimeout(400);
  if (/caracteres/.test(await texto())) ok('o cronograma em texto fica guardado');
  else falha('o cronograma em texto não apareceu depois de guardar');
}

/* as três datas do período, que o assistente lê junto do calendário */
const datas = pag.locator('input[type="date"]');
if (await datas.count() >= 3) ok('a aba oferece as três datas: início, término e prova');
else falha(`só achei ${await datas.count()} campo(s) de data na aba Cronograma`);

await datas.nth(0).fill('2026-03-10');
await datas.nth(1).fill('2026-05-30');
await pag.locator('button:has-text("Guardar cronograma")').first().click();
await pag.waitForTimeout(400);
if (/semanas de curso/.test(await texto())) ok('as datas viram o tamanho do período em semanas');
else falha('o resumo do período não apareceu: ' + (await texto()).slice(0, 200));

/* término antes do início é engano de digitação, e precisa ser recusado
   antes de virar conta de dias negativa */
await datas.nth(1).fill('2026-01-01');
await pag.locator('button:has-text("Guardar cronograma")').first().click();
await pag.waitForTimeout(300);
if (/término está antes/i.test(await texto())) ok('término antes do início é recusado com o motivo');
else falha('data invertida passou sem aviso');
await datas.nth(1).fill('2026-05-30');

/* mandar foto é IA, e a IA é do plano: o botão existe nos dois cartões */
const botoesFoto = pag.locator('button:has-text("mandar foto")');
if (await botoesFoto.count() >= 1) ok('dá para mandar foto do cronograma');
else falha('não achei o botão de mandar foto');

await pag.locator('button:has-text("Residência")').first().click();
await pag.waitForTimeout(300);
if (!/Traga o conteúdo do ciclo clínico/i.test(await texto())) ok('voltar para a residência fecha o envio');
else falha('voltar para a residência deixou o envio aberto');

/* ── anotação rica por matéria ────────────────────────────────────────
   Não depende do plano: dá para testar nos dois builds. Escreve, aplica
   negrito, anexa uma imagem (1x1, gerada na hora, sem arquivo no repo) e
   confere que as duas coisas sobrevivem a recarregar a página — a
   imagem é a parte arriscada, porque mora no IndexedDB, não no HTML
   guardado (parte17.jsx). */
await ir('Matérias');
const linhaAula = pag.locator('[data-teste="titulo-materia"]').first();
if (await linhaAula.count() === 0) {
  falha('anotação: não achei nenhuma aula em Matérias para abrir');
} else {
  await linhaAula.click();
  await pag.waitForTimeout(300);
  const abrirNota = pag.locator('text=Escrever ou colar uma anotação');
  if (await abrirNota.count() === 0) {
    falha('anotação: não achei o botão de escrever a anotação');
  } else {
    await abrirNota.click();
    await pag.waitForTimeout(300);
    const editor = pag.locator('[contenteditable="true"]').first();
    await editor.click();
    await editor.type('Anotação de teste.');
    await pag.keyboard.press('Control+A');
    await pag.locator('button[title="Negrito"]').click();
    await pag.waitForTimeout(300);
    const htmlNaHora = await editor.innerHTML();
    if (/<b>|<strong>/i.test(htmlNaHora)) ok('anotação: negrito aplica na hora');
    else falha('anotação: negrito não aplicou: ' + htmlNaHora.slice(0, 120));

    /* solta a seleção antes de inserir a imagem: com o texto ainda todo
       selecionado, o navegador troca o texto pela imagem em vez de só
       acrescentar — o mesmo comportamento do Word e do Google Docs. */
    await pag.keyboard.press('End');

    /* imagem 1x1 em base64, para não depender de nenhum arquivo do repo */
    const pixelB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const caminhoPixel = path.join(os.tmpdir(), `cadencia-teste-pixel-${Date.now()}.png`);
    fs.writeFileSync(caminhoPixel, Buffer.from(pixelB64, 'base64'));
    const escolhaArquivo = pag.waitForEvent('filechooser');
    await pag.locator('button[title="Inserir imagem"]').click();
    const seletor = await escolhaArquivo;
    await seletor.setFiles(caminhoPixel);
    await pag.waitForTimeout(500);
    fs.unlinkSync(caminhoPixel);
    if (await editor.locator('img').count() > 0) ok('anotação: a imagem aparece no editor assim que é inserida');
    else falha('anotação: a imagem não apareceu depois de inserida');

    /* Colar uma página com figura: o endereço aponta para fora e o navegador
       não consegue ler os bytes. A figura tem que virar parte da anotação na
       hora do colar, senão ela morre junto com o endereço de origem, que no
       Notion vence em cerca de uma hora. */
    await pag.evaluate(() => {
      const ed = document.querySelector('[contenteditable="true"]');
      ed.focus();
      const dt = new DataTransfer();
      dt.setData('text/html', '<p>com figura</p><figure>'
        + '<img src="https://site-de-fora/figura.png" alt="Esquema">'
        + '<figcaption>Fonte: Medgrupo.</figcaption></figure>');
      ed.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await pag.waitForTimeout(2500);
    const figuraColada = await pag.evaluate(() => {
      const im = document.querySelector('[contenteditable="true"] img[alt="Esquema"]');
      return im ? (im.getAttribute('src') || '').slice(0, 20) : 'sumiu';
    });
    if (/^data:image\//.test(figuraColada)) ok('anotação: figura colada de fora entra na hora, sem depender do site de origem');
    else falha('anotação: a figura colada não foi trazida para dentro: ' + figuraColada);

    /* E quando não dá para trazer de jeito nenhum (endereço vencido, que é o
       caso do Notion depois de uma hora), o lugar da figura precisa explicar
       o que houve. Um ícone de imagem quebrada não ensina nada. */
    await pag.evaluate(() => {
      const ed = document.querySelector('[contenteditable="true"]');
      ed.focus();
      const dt = new DataTransfer();
      dt.setData('text/html', '<p><img src="https://site-fechado/vencida.png" alt="Vencida"></p>');
      ed.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await pag.waitForTimeout(2500);
    const explicou = await pag.evaluate(() => {
      const ed = document.querySelector('[contenteditable="true"]');
      const caixa = ed.querySelector('[data-figura-perdida]');
      return { temCaixa: !!caixa, texto: caixa ? caixa.textContent.slice(0, 60) : '', aindaTemImg: !!ed.querySelector('img[alt="Vencida"]') };
    });
    if (explicou.temCaixa && !explicou.aindaTemImg) ok('anotação: figura que não dá para trazer vira um aviso explicando, não um ícone quebrado');
    else falha('anotação: figura perdida sem explicação: ' + JSON.stringify(explicou));

    /* O endereço fica guardado na caixa, senão tentar de novo depois de
       resolver a causa (conectar o Notion) exigiria recolar tudo. */
    const guardouEndereco = await pag.evaluate(() => {
      const c = document.querySelector('[contenteditable="true"] [data-figura-perdida]');
      return c ? c.getAttribute('data-de') || '' : '';
    });
    if (/site-fechado/.test(guardouEndereco)) ok('anotação: o aviso guarda o endereço da figura, para tentar de novo depois');
    else falha('anotação: o aviso não guardou o endereço: ' + guardouEndereco);

    const botaoDeNovo = pag.locator('button:has-text("de novo")');
    if (await botaoDeNovo.count() > 0) ok('anotação: aparece o botão de tentar as figuras de novo');
    else falha('anotação: não achei o botão de tentar as figuras de novo');

    /* A imagem que vem na própria área de transferência (copiar imagem,
       print de tela). É o caminho que sempre funciona, e antes não fazia
       nada. */
    await pag.evaluate((b64) => {
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const arquivo = new File([bytes], 'colada.png', { type: 'image/png' });
      const ed = document.querySelector('[contenteditable="true"]');
      ed.focus();
      const dt = new DataTransfer();
      dt.items.add(arquivo);
      ed.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, PIXEL_B64);
    await pag.waitForTimeout(1200);
    const quantasFiguras = await pag.evaluate(
      () => document.querySelectorAll('[contenteditable="true"] img').length);
    if (quantasFiguras >= 2) ok('anotação: colar a imagem direto da área de transferência funciona');
    else falha('anotação: colar a imagem em si não inseriu nada (' + quantasFiguras + ' figura(s))');

    /* ── régua de tamanho da figura ─────────────────────────────────────
       Uma figura colada chega do tamanho que era na origem, e antes disto
       não havia como mexer. Clicar nela abre a régua. */
    /* clique disparado no elemento, e não pelo ponteiro: a figura do teste
       tem 1x1 pixel e fica atrás do texto, então o ponteiro nunca a
       alcançaria — o que se quer testar aqui é o que o editor faz com um
       clique NA figura. */
    await pag.evaluate(() => {
      document.querySelector('[contenteditable="true"] img')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await pag.waitForTimeout(350);
    const temRegua = await pag.locator('text=tamanho da figura').count();
    if (temRegua > 0) ok('anotação: clicar numa figura abre a régua de tamanho');
    else falha('anotação: a régua de tamanho não apareceu ao clicar na figura');

    const contornou = await pag.evaluate(
      () => !!(document.querySelector('[contenteditable="true"] img') || {}).style?.outline);
    if (contornou) ok('anotação: a figura escolhida fica marcada na tela');
    else falha('anotação: nada indica qual figura está escolhida');

    if (temRegua > 0) {
      await pag.locator('button:has-text("Cheia")').first().click();
      await pag.waitForTimeout(300);
      const larguraCheia = await pag.evaluate(
        () => document.querySelector('[contenteditable="true"] img').style.width);
      if (larguraCheia === '100%') ok('anotação: a figura vai para a largura escolhida');
      else falha('anotação: a largura não foi aplicada: ' + larguraCheia);

      /* a largura vai em porcentagem, não em pixels: a mesma anotação é
         lida no computador e no celular */
      await pag.locator('div:has-text("tamanho da figura") > button:has-text("M")').first().click();
      await pag.waitForTimeout(300);
      const larguraM = await pag.evaluate(
        () => document.querySelector('[contenteditable="true"] img').style.width);
      if (larguraM === '50%') ok('anotação: dá para trocar o tamanho de novo, sempre em porcentagem');
      else falha('anotação: o segundo tamanho não pegou: ' + larguraM);

      await pag.locator('button:has-text("Original")').first().click();
      await pag.waitForTimeout(300);
      const semLargura = await pag.evaluate(() => {
        const im = document.querySelector('[contenteditable="true"] img');
        return { w: im.style.width, teto: im.style.maxWidth };
      });
      if (!semLargura.w && semLargura.teto === '100%') ok('anotação: "original" tira a largura escrita e mantém o teto da caixa');
      else falha('anotação: o original não limpou a largura: ' + JSON.stringify(semLargura));

      /* clicar no texto solta a figura, e a régua fecha */
      await pag.evaluate(() => {
        const ed = document.querySelector('[contenteditable="true"]');
        ed.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await pag.waitForTimeout(350);
      if (await pag.locator('text=tamanho da figura').count() === 0) ok('anotação: clicar fora da figura fecha a régua');
      else falha('anotação: a régua ficou aberta depois de clicar fora');
      const semContorno = await pag.evaluate(
        () => [...document.querySelectorAll('[contenteditable="true"] img')].every((im) => !im.style.outline));
      if (semContorno) ok('anotação: a marca da figura escolhida sai junto');
      else falha('anotação: o contorno ficou grudado na figura');
    }

    /* Texto copiado de site escuro chega com a cor dele grudada: um branco
       acinzentado que, no papel claro, some. Cor sem cor sai; cor que quer
       dizer alguma coisa fica, só ajustada para dar para ler nos dois. */
    await pag.evaluate(() => {
      const ed = document.querySelector('[contenteditable="true"]');
      ed.focus();
      const dt = new DataTransfer();
      dt.setData('text/html',
        '<p><span style="color:rgba(255,255,255,0.81)">cinza de fora</span> '
        + '<span style="color:rgb(77,171,154)">verde com sentido</span></p>');
      ed.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    await pag.waitForTimeout(900);
    const cores = await pag.evaluate(() => {
      const ed = document.querySelector('[contenteditable="true"]');
      const spans = [...ed.querySelectorAll('span[style*="color"]')].map((s) => s.getAttribute('style'));
      return { texto: ed.innerText.includes('cinza de fora'), spans: spans.join(' | ') };
    });
    if (cores.texto && !/255,\s*255,\s*255/.test(cores.spans)) ok('anotação: o cinza que vem colado sai, e o texto passa a seguir o tema');
    else falha('anotação: a cor de fora ficou: ' + cores.spans);
    if (/77,\s*171,\s*154|rgb\(\s*7\d/.test(cores.spans)) ok('anotação: cor que quer dizer alguma coisa é mantida');
    else falha('anotação: a cor com sentido se perdeu: ' + cores.spans);

    /* Claro e escuro só da anotação, com letra escura de verdade no claro */
    await pag.locator('[title="Anotação no claro"]').first().click();
    await pag.waitForTimeout(500);
    const noClaro = await pag.locator('[contenteditable="true"]').first()
      .evaluate((el) => ({ cor: getComputedStyle(el).color, fundo: getComputedStyle(el).backgroundColor }));
    const claridade = (c) => {
      const [r, g, b] = (c.match(/\d+/g) || [0, 0, 0]).map(Number);
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    };
    if (claridade(noClaro.fundo) > 0.9 && claridade(noClaro.cor) < 0.25) {
      ok('anotação: no claro o papel é branco e a letra é escura de verdade');
    } else falha('anotação no claro: ' + JSON.stringify(noClaro));
    await pag.locator('[title="Anotação no escuro"]').first().click();
    await pag.waitForTimeout(500);
    const noEscuro = await pag.locator('[contenteditable="true"]').first()
      .evaluate((el) => ({ cor: getComputedStyle(el).color, fundo: getComputedStyle(el).backgroundColor }));
    if (claridade(noEscuro.fundo) < 0.2 && claridade(noEscuro.cor) > 0.8) ok('anotação: e volta para o escuro');
    else falha('anotação no escuro: ' + JSON.stringify(noEscuro));

    /* O bloco de destaque do Notion chega escrito como <aside>, e às vezes
       com a própria tag escrita como texto. Nos dois casos ele tem que
       virar uma caixa com barra na lateral, e a tag não pode sobrar à vista
       nem na anotação nem no PDF. */
    await pag.evaluate(() => {
      const ed = document.querySelector('[contenteditable="true"]');
      ed.innerHTML += '<p>&lt;aside&gt;</p><aside><p>bloco do Notion</p></aside><p>&lt;/aside&gt;</p>';
      ed.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await pag.waitForTimeout(1800);
    await pag.locator('button:has-text("fechar")').first().click();
    await pag.waitForTimeout(500);
    await pag.locator('text=Ver ou editar anotação').first().click();
    await pag.waitForTimeout(800);
    const depoisDoDestaque = await pag.locator('[contenteditable="true"]').first().innerHTML();
    if (!/&lt;\/?aside&gt;|<\/?aside>/i.test(depoisDoDestaque)) ok('anotação: a tag do destaque do Notion não fica escrita na tela');
    else falha('anotação: sobrou <aside> à vista: ' + depoisDoDestaque.slice(0, 160));
    if (/border-left:\s*3px/i.test(depoisDoDestaque)) ok('anotação: o destaque do Notion vira uma caixa com barra na lateral');
    else falha('anotação: o destaque não virou caixa: ' + depoisDoDestaque.slice(0, 160));

    /* debounce do salvamento da anotação (1200ms) + do salvamento geral */
    await pag.waitForTimeout(4000);
    const salvouSemImagemEmbutida = await pag.evaluate(() => {
      const bruto = window.localStorage.getItem('cadencia:v3');
      const dados = bruto ? JSON.parse(bruto) : null;
      const notas = (dados && dados.anotacoes) || {};
      const html = Object.values(notas).map((n) => n.html).join('');
      return { temDataNome: /data-nome="/.test(html), temSrcData: /src="data:/.test(html), temNegrito: /<b>|<strong>/i.test(html) };
    });
    if (salvouSemImagemEmbutida.temDataNome && !salvouSemImagemEmbutida.temSrcData) {
      ok('anotação: a imagem fica só no IndexedDB, sem inflar o que é guardado em disco/nuvem');
    } else falha('anotação: a imagem vazou para o HTML guardado, ou não guardou nada: ' + JSON.stringify(salvouSemImagemEmbutida));
    if (salvouSemImagemEmbutida.temNegrito) ok('anotação: a formatação (negrito) é salva');
    else falha('anotação: o negrito não foi salvo');

    await pag.reload({ waitUntil: 'load' });
    await pag.waitForTimeout(2200);
    await ir('Matérias');
    await pag.locator('[data-teste="titulo-materia"]').first().click();
    await pag.waitForTimeout(300);
    const verNota = pag.locator('text=Ver ou editar anotação');
    if (await verNota.count() === 0) {
      falha('anotação: sumiu depois de recarregar a página');
    } else {
      ok('anotação: continua lá depois de recarregar a página');
      await verNota.click();
      await pag.waitForTimeout(700);   // ler a imagem do IndexedDB é assíncrono
      const editorDepois = pag.locator('[contenteditable="true"]').first();
      const imgDepois = editorDepois.locator('img');
      if (await imgDepois.count() > 0 && /^data:/.test((await imgDepois.first().getAttribute('src')) || '')) {
        ok('anotação: a imagem volta a aparecer, lida de volta do IndexedDB');
      } else falha('anotação: a imagem não voltou depois de recarregar');

      /* ── baixar em Word: não depende de rede nenhuma ─────────────────── */
      const baixarDocBtn = pag.locator('button:has-text("Baixar em Word")');
      if (await baixarDocBtn.count() === 0) {
        falha('anotação: não achei o botão de baixar em Word');
      } else {
        const espera = pag.waitForEvent('download', { timeout: 5000 }).catch(() => null);
        await baixarDocBtn.click();
        const download = await espera;
        if (download) ok(`anotação: baixar em Word dispara o download (${download.suggestedFilename()})`);
        else falha('anotação: baixar em Word não disparou download nenhum');
      }

      /* ── baixar em PDF: o botão existe. Não força o clique — depende do
         jsPDF/html2canvas vindo de um CDN externo, que pode não estar
         acessível neste ambiente de teste (sem rede geral, só o
         localhost do teste), e uma falha de rede aí já vira um aviso
         tratado, não uma tela quebrada. */
      if (await pag.locator('button:has-text("Baixar em PDF")').count() > 0) {
        ok('anotação: o botão de baixar em PDF existe');
      } else falha('anotação: não achei o botão de baixar em PDF');

      /* ── enviar para o Drive: o botão abre o modal ───────────────────── */
      const enviarDriveBtn = pag.locator('button:has-text("Enviar para o Drive")');
      if (await enviarDriveBtn.count() === 0) {
        falha('anotação: não achei o botão de enviar para o Drive');
      } else {
        await enviarDriveBtn.click();
        await pag.waitForTimeout(400);
        const abriu = (await pag.locator('text=Conectar ao Google Drive').count()) > 0
          || (await pag.locator('text=não está configurado').count()) > 0;
        if (abriu) ok('anotação: o modal de enviar para o Drive abre');
        else falha('anotação: o modal do Drive não abriu como esperado');
        const fechar = pag.locator('button[aria-label="Fechar"]');
        if (await fechar.count() > 0) await fechar.first().click();
        await pag.waitForTimeout(200);
      }

      /* ── gerar flashcards a partir da anotação ─────────────────────── */
      /* Cartões é recurso do plano completo: só faz sentido conferir que o
         cartão chegou lá no build de teste, com o plano liberado (o mesmo
         motivo pelo qual os outros testes de Cartões, mais abaixo, só
         rodam dentro deste "if (liberado)"). */
      if (!liberado) {
        // segue sem testar esta parte no build de produção fechado
      } else {
      await pag.route('**/api/flashcards-ia', (rota) => rota.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ baralho: 'Teste', cartoes: [{ frente: 'Pergunta de teste', verso: 'Resposta de teste' }] }),
      }));
      const gerarBtn = pag.locator('button:has-text("Gerar flashcards com IA")');
      if (await gerarBtn.count() === 0) {
        falha('anotação: não achei o botão de gerar flashcards');
      } else {
        await gerarBtn.click();
        await pag.waitForTimeout(600);
        await ir('Cartões');
        const t = await texto();
        /* a área da aula testada (Epidemiologia, PR) tem pasta própria:
           uma das cinco grandes, por pastaDaArea, em parte12.jsx */
        if (/PREVENTIVA/.test(t)) {
          ok('anotação: os flashcards gerados caem na pasta grande certa, em Cartões');
        } else falha('anotação: a pasta "PREVENTIVA" não apareceu em Cartões: ' + t.slice(0, 300));

        /* limpa o que este teste criou: os testes de Cartões, mais abaixo,
           pressupõem que "Pasta de teste" é a única pasta e usam .first()
           nos botões — deixar "PREVENTIVA" para trás bagunçaria a ordem e
           quebraria esses testes por posição, não por defeito. */
        await pag.evaluate(() => {
          const bruto = window.localStorage.getItem('cadencia:v3');
          const d = bruto ? JSON.parse(bruto) : null;
          if (!d) return;
          d.flash = (d.flash || []).filter((c) => c.pasta !== 'PREVENTIVA');
          d.pastas = (d.pastas || []).filter((p) => p !== 'PREVENTIVA');
          window.localStorage.setItem('cadencia:v3', JSON.stringify(d));
        });
        await pag.reload({ waitUntil: 'load' });
        await pag.waitForTimeout(2200);
      }
      }
    }
  }
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

  await ir('Cartões');

  /* ── cartões: criar pasta, criar cartão, estudar ─────────────────── */
  await ir('Cartões');
  await pag.locator('button:has-text("Novo cartão")').first().click();
  await pag.waitForTimeout(300);
  /* pelo placeholder, e não pela posição: a aba Cartões agora tem outro
     campo de texto sempre visível (o nome do baralho do "montar com IA",
     antes do painel de criar cartão no HTML), então o primeiro input da
     página deixou de ser a Pasta deste formulário. */
  await pag.locator('input[placeholder="Ex.: Clínica"]').fill('Pasta de teste');
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

  /* A cor escolhida precisa pintar o site, não só os detalhes: fundo,
     painéis e linhas seguem o matiz. Antes ficava tudo roxo com uns
     detalhes na cor nova. */
  const ambiente = () => pag.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const ler = (n) => cs.getPropertyValue(n).trim();
    /* matiz aproximado, o suficiente para dizer se mudou de família */
    const matiz = (c) => {
      const m = c.match(/\d+/g);
      if (!m || m.length < 3) return -1;
      const [r, g, b] = m.slice(0, 3).map(Number);
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx === mn) return -1;
      const d = mx - mn;
      let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return Math.round(((h * 60) % 360 + 360) % 360);
    };
    const hex = (h) => { const s = h.replace('#', ''); return `rgb(${parseInt(s.slice(0, 2), 16)},${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)})`; };
    return { bg: matiz(hex(ler('--bg'))), card: matiz(ler('--card2')), linha: matiz(ler('--line')) };
  });
  const ambar = await ambiente();
  await pag.locator('button[title="Rosa"]').first().click();
  await pag.waitForTimeout(400);
  const rosa = await ambiente();
  const mudou = (a, b) => a >= 0 && b >= 0 && Math.abs(a - b) > 20;
  if (mudou(ambar.bg, rosa.bg) && mudou(ambar.card, rosa.card) && mudou(ambar.linha, rosa.linha)) {
    ok(`a cor pinta o site inteiro: fundo, painéis e linhas mudaram de matiz (${ambar.bg}° → ${rosa.bg}°)`);
  } else falha('a cor mudou só os detalhes: ' + JSON.stringify({ ambar, rosa }));

  await pag.locator('button[title="Cadência"]').first().click();
  await pag.waitForTimeout(400);
  const voltou = await pag.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
  if (voltou.toUpperCase() === '#04030A') ok('voltar para a cor de origem devolve o fundo desenhado');
  else falha('a cor de origem não voltou: ' + voltou);
  await pag.locator('button[title="Âmbar"]').first().click();
  await pag.waitForTimeout(300);

  /* ── cor própria: ajustada para continuar legível, e a segunda combinando ── */
  await pag.locator('button:has-text("Escolher")').first().click();
  await pag.waitForTimeout(300);
  const coresProprias = pag.locator('input[type="color"]');
  if (await coresProprias.count() < 2) {
    falha('cor própria: não achei os dois seletores de cor');
  } else {
    /* amarelo bem claro, quase invisível no fundo claro — corLegivel
       (base.jsx) precisa escurecer sem perder o matiz. */
    await coresProprias.nth(0).fill('#fff9c4');
    await pag.waitForTimeout(300);
    const aplicada = await pag.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--neon').trim());
    if (aplicada && aplicada.toUpperCase() !== '#FFF9C4') {
      ok(`cor própria clara demais foi ajustada (ficou ${aplicada}, não a cor crua)`);
    } else falha(`a cor clara não foi ajustada: ${aplicada}`);
    const segunda = await pag.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--neon2').trim());
    if (segunda) ok(`a segunda cor já nasceu preenchida, combinando (${segunda})`);
    else falha('a segunda cor não foi sugerida automaticamente');
  }

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

/* ── celular: a aba Cartões não pode se sobrepor ────────────────────── */
/* Na largura do celular, o campo "Nova pasta" (que tinha largura fixa)
   empurrava o botão de criar por cima dele, e o nome da pasta ficava
   escondido atrás do "publicar" e da lixeira. Aqui as caixas são medidas
   de verdade: sobreposição é falha. */
if (liberado) {
  await pag.locator('button[aria-label="Abrir menu"]').first().click();
  await esperarGaveta(true);
  const abaCartoes = pag.locator('aside[aria-label="Navegação"] nav button:has-text("Cartões")');
  if (await abaCartoes.count() === 0) {
    falha('celular: não achei a aba Cartões na gaveta');
  } else {
    await abaCartoes.first().click();
    await esperarGaveta(false);
    await pag.waitForTimeout(500);

    const sobreposicoes = await pag.evaluate(() => {
      const problemas = [];
      const cruza = (a, b) => !(a.right <= b.left + 1 || b.right <= a.left + 1
        || a.bottom <= b.top + 1 || b.bottom <= a.top + 1);
      const cx = (el) => el.getBoundingClientRect();

      const campo = document.querySelector('input[placeholder="Nova pasta"]');
      const criar = [...document.querySelectorAll('button')].find((b) => /Criar pasta/.test(b.textContent));
      if (campo && criar && cruza(cx(campo), cx(criar))) problemas.push('o campo "Nova pasta" está por cima do botão de criar');
      if (campo && cx(campo).width < 90) problemas.push(`o campo "Nova pasta" ficou espremido (${Math.round(cx(campo).width)}px)`);
      /* o rótulo "Pastas e baralhos" é o irmão anterior do par campo+botão */
      const rotulo = campo && campo.parentElement && campo.parentElement.previousElementSibling;
      if (campo && rotulo && cruza(cx(campo), cx(rotulo))) problemas.push('o campo "Nova pasta" está por cima do rótulo da seção');
      if (criar && rotulo && cruza(cx(criar), cx(rotulo))) problemas.push('o botão de criar pasta está por cima do rótulo da seção');

      for (const nome of document.querySelectorAll('[data-teste="nome-pasta"]')) {
        const r = cx(nome);
        if (r.width < 30) { problemas.push(`o nome "${nome.textContent}" ficou sem largura (${Math.round(r.width)}px)`); continue; }
        const linha = nome.closest('div.rounded-2xl');
        if (!linha) continue;
        for (const outro of linha.querySelectorAll('button, span, div')) {
          if (outro.contains(nome) || nome.contains(outro)) continue;
          if (!outro.textContent.trim() && !outro.querySelector('svg')) continue;
          const ro = cx(outro);
          if (ro.width < 1 || ro.height < 1) continue;
          if (cruza(r, ro)) problemas.push(`"${nome.textContent}" cruza com "${(outro.textContent || 'ícone').trim().slice(0, 24)}"`);
        }
      }
      return problemas;
    });

    if (sobreposicoes.length === 0) ok('celular: nada se sobrepõe na lista de pastas e baralhos');
    else falha('celular, aba Cartões: ' + sobreposicoes.slice(0, 4).join(' · '));

    const vazaCartoes = await pag.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    if (vazaCartoes) falha('celular: a aba Cartões passou da largura da tela');
    else ok('celular: a aba Cartões cabe na largura da tela');
    await pag.screenshot({ path: 'captura-celular-cartoes.png' });
  }
}

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
