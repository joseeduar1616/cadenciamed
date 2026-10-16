/* A folha em branco dentro da anotação, de ponta a ponta, com a IA de
 * mentira (parte30).
 *
 * O caminho: jogar o conteúdo na anotação, montar as caixas, escrever de
 * memória (a anotação some da tela enquanto isso), conferir — o que faltou
 * aparece em outra cor, o que foi escrito errado vem corrigido —, levar a
 * folha para a anotação e transformar o que faltou em cartões. E importar
 * um arquivo, que entra na anotação já em caixas. Também confere que o que
 * a IA devolve entra ESCAPADO: o conteúdo veio de um arquivo de fora.
 *
 *   node testar-folha-tela.mjs [arquivo.html]
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
const pag = await (await navegador.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errosDaPagina = [];
pag.on('pageerror', (e) => errosDaPagina.push(e.message));
pag.on('dialog', (d) => { errosDaPagina.push('diálogo aberto: ' + d.message()); d.dismiss(); });

await pag.addInitScript(() => {
  try { const k = 'cadencia:v3:convite-notificacoes-aparelho'; if (!localStorage.getItem(k)) localStorage.setItem(k, '1'); } catch (e) { /* segue */ }
  if (sessionStorage.getItem('semeado')) return;
  sessionStorage.setItem('semeado', '1');
  localStorage.setItem('cadencia:v3', JSON.stringify({ profile: { name: 'Teste', onboarded: true, examDate: '2027-03-10' } }));
});

const pedidos = [];
const CAIXAS = {
  titulo: 'Estudos epidemiológicos',
  caixas: [
    { titulo: 'Fisiopatologia', pergunta: 'Qual a lógica de cada desenho?', pontos: [{ texto: 'Coorte parte da exposição para o desfecho' }, { texto: 'Caso-controle parte do desfecho' }] },
    { titulo: 'Diagnóstico', pergunta: 'Que medida cada um dá?', pontos: [{ texto: 'Coorte dá risco relativo' }, { texto: 'Caso-controle dá odds ratio', complemento: true }] },
    { titulo: 'Tratamento', pergunta: 'Quando usar cada um?', pontos: [{ texto: 'Doença rara: caso-controle' }] },
  ],
};
const IMPORTADO = {
  titulo: 'Tema importado',
  caixas: [{ titulo: 'Tratamento', pergunta: 'x', pontos: [{ texto: 'Primeira linha: <img src=x onerror="window.__xss=1"> droga A' }] }],
};
await pag.route('**/api/folha-ia', async (rota) => {
  const corpo = JSON.parse(rota.request().postData() || '{}');
  pedidos.push(corpo);
  let r;
  if (corpo.acao === 'caixas') r = /arquivo importado/.test(corpo.texto) ? IMPORTADO : CAIXAS;
  else r = {
    status: corpo.caixa.pontos.map((_, i) => (i === 0 ? 'lembrou' : 'faltou')),
    erros: [{ trecho: 'coorte dá odds ratio', correcao: 'coorte dá risco relativo' }],
    comentario: 'Revise as medidas de associação.',
  };
  await rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, ...r }) });
});
await pag.route('**/api/flashcards-ia', async (rota) => {
  const corpo = JSON.parse(rota.request().postData() || '{}');
  pedidos.push({ acao: 'flashcards', ...corpo });
  await rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ cartoes: [{ frente: 'Caso-controle parte de onde?', verso: 'Do desfecho' }] }) });
});

await pag.goto('file://' + alvo, { waitUntil: 'load' });
await pag.waitForTimeout(1800);
const semConta = pag.locator('button:has-text("usar sem conta")');
if (await semConta.count() > 0) { await semConta.first().click(); await pag.waitForTimeout(500); }

const dados = () => pag.evaluate(() => JSON.parse(localStorage.getItem('cadencia:v3')));
const editor = pag.locator('[data-teste="editor-anotacao"]');

await pag.locator('nav button:has-text("Matérias")').first().click();
await pag.waitForTimeout(500);
await pag.locator('[data-teste="titulo-materia"]').first().click();
await pag.waitForTimeout(300);
await pag.locator('text=Escrever ou colar uma anotação').first().click();
await pag.waitForTimeout(500);

/* ── 1. sem conteúdo, não monta ──────────────────────────────────────── */
await pag.locator('main button:has-text("Montar a folha em branco")').click();
await pag.waitForTimeout(400);
if (!pedidos.length) ok('com a anotação vazia, pede o conteúdo antes (e não gasta a IA)');
else falha('montou a folha sem conteúdo nenhum');

/* ── 2. montar ───────────────────────────────────────────────────────── */
await editor.click();
await pag.keyboard.type('Estudos de coorte acompanham expostos e não expostos ao longo do tempo. '.repeat(4));
await pag.waitForTimeout(300);
await pag.locator('main button:has-text("Montar a folha em branco")').click();
await pag.waitForTimeout(900);
if (pedidos[0] && pedidos[0].acao === 'caixas' && /Estudos de coorte/.test(pedidos[0].texto)) ok('a folha é montada a partir do que está na anotação');
else falha('pedido de caixas: ' + JSON.stringify(pedidos[0]).slice(0, 160));
const caixas = pag.locator('[data-teste="caixa-folha"]');
if (await caixas.count() === 3) ok('as caixas aparecem no fim da anotação (fisiopatologia, diagnóstico, tratamento)');
else falha('caixas na tela: ' + await caixas.count());
const t0 = await pag.locator('[data-teste="folha-em-branco"]').innerText();
if (!/Coorte parte da exposição/.test(t0)) ok('o gabarito fica escondido enquanto a pessoa não confere');
else falha('o gabarito apareceu antes de escrever');

/* ── 3. escrever de memória: a anotação some ─────────────────────────── */
await caixas.nth(0).locator('textarea').fill('coorte vai da exposição ao desfecho');
await pag.waitForTimeout(200);
if (await pag.locator('[data-teste="anotacao-escondida"]').count()) ok('ao escrever na folha, a anotação some da tela (sem consulta)');
else falha('a anotação continuou à vista enquanto escrevia');
const filtro = await editor.evaluate((el) => getComputedStyle(el).filter);
if (/blur/.test(filtro)) ok('o texto da anotação fica borrado, ilegível');
else falha('a anotação não foi borrada: ' + filtro);

/* ── 4. conferir ─────────────────────────────────────────────────────── */
await caixas.nth(0).locator('button:has-text("Conferir")').click();
await pag.waitForTimeout(900);
const conf = await caixas.nth(0).locator('[data-teste="conferencia"]').innerText().catch(() => '');
if (/Coorte parte da exposição/.test(conf) && /Caso-controle parte do desfecho/.test(conf)) ok('conferir mostra o gabarito ponto a ponto');
else falha('conferência: ' + conf.slice(0, 200));
if (/✓/.test(conf) && /✗/.test(conf)) ok('com o que lembrou (✓) e o que faltou (✗)');
else falha('sem as marcas de lembrou/faltou');
if (/Você escreveu errado/i.test(conf) && /coorte dá risco relativo/.test(conf)) ok('e o que foi escrito errado, com a correção');
else falha('os erros não apareceram');
const corFaltou = await caixas.nth(0).locator('li:has-text("Caso-controle parte do desfecho") span').nth(1).evaluate((el) => getComputedStyle(el).color);
const corLembrou = await caixas.nth(0).locator('li:has-text("Coorte parte da exposição") span').nth(1).evaluate((el) => getComputedStyle(el).color);
if (corFaltou !== corLembrou) ok('o que faltou aparece em outra cor');
else falha('lembrou e faltou na mesma cor');
await pag.waitForTimeout(1900);
let d = await dados();
const subj = Object.keys(d.folhas || {})[0];
const f = subj ? d.folhas[subj] : null;
if (f && f.caixas[0].escrito === 'coorte vai da exposição ao desfecho' && f.caixas[0].conf && f.caixas[0].conf.status[1] === 'faltou') {
  ok('o escrito e a conferência ficam guardados na conta');
} else falha('folha guardada: ' + JSON.stringify(f).slice(0, 200));

/* ── 5. conferir todas e o placar ────────────────────────────────────── */
await caixas.nth(1).locator('textarea').fill('risco relativo');
await caixas.nth(2).locator('textarea').fill('doença rara');
await pag.locator('main button:has-text("Conferir todas as escritas")').click();
await pag.waitForTimeout(1500);
if (await pag.locator('[data-teste="conferencia"]').count() === 3) ok('"conferir todas" confere as caixas que faltavam');
else falha('nem todas foram conferidas');
await pag.waitForTimeout(1900);
d = await dados();
if ((d.folhas[subj].hist || []).length === 1 && d.folhas[subj].hist[0].pct === 60) ok('o placar da folha (60%) entra no histórico, para comparar nas revisões');
else falha('histórico: ' + JSON.stringify(d.folhas[subj].hist));

/* ── 6. levar para a anotação, e o que faltou vira cartão ────────────── */
await pag.locator('main button:has-text("mostrar a anotação")').click();
await pag.waitForTimeout(200);
if (!(await pag.locator('[data-teste="anotacao-escondida"]').count())) ok('"mostrar a anotação" traz o texto de volta');
else falha('a anotação não voltou');
await pag.locator('main button:has-text("Levar para a anotação")').click();
await pag.waitForTimeout(400);
let html = await editor.innerHTML();
if (/Folha em branco/.test(html) && /O que faltou/.test(html) && /coorte vai da exposição ao desfecho/.test(html)) {
  ok('a folha feita entra na anotação: o que escrevi e, em outra cor, o que faltou');
} else falha('a folha não entrou na anotação');
await pag.locator('main button:has-text("O que faltou vira cartão")').click();
/* a gravação espera 1,5 s sem mudanças, e a anotação acabou de mudar:
   espera a condição, e não um tempo fixo */
await pag.waitForFunction(() => /Caso-controle parte de onde/.test(localStorage.getItem('cadencia:v3') || ''), null, { timeout: 8000 }).catch(() => {});
const pc = pedidos.find((p) => p.acao === 'flashcards');
if (pc && /Caso-controle parte do desfecho/.test(pc.texto) && !/Coorte parte da exposição/.test(pc.texto)) ok('só o que faltou vai para virar cartão (o que lembrou, não)');
else falha('pedido de cartões: ' + JSON.stringify(pc).slice(0, 200));
d = await dados();
if ((d.flash || []).some((c) => /Caso-controle parte de onde/.test(c.frente))) ok('e os cartões entram em Cartões');
else falha('os cartões não foram criados');

/* ── 7. importar um arquivo ──────────────────────────────────────────── */
const arquivo = path.join(path.dirname(alvo), '_folha-teste.txt');
fs.writeFileSync(arquivo, 'Este é um arquivo importado com o conteúdo da aula. '.repeat(8));
await pag.locator('[data-teste="importar-anotacao"]').setInputFiles(arquivo);
await pag.waitForTimeout(1500);
fs.unlinkSync(arquivo);
html = await editor.innerHTML();
if (/Tema importado/.test(html) && /Organizado de _folha-teste\.txt/.test(html) && /data-caixa/.test(html)) ok('o arquivo importado entra no fim da anotação, já em caixas');
else falha('importação: ' + html.slice(-300));
const xss = await pag.evaluate(() => ({ img: !!document.querySelector('[data-teste="editor-anotacao"] img[src="x"]'), rodou: !!window.__xss }));
if (!xss.img && !xss.rodou && /&lt;img/.test(html)) ok('o que a IA devolve entra escapado: uma tag no texto fica como texto, não vira elemento');
else falha('HTML da IA entrou cru: ' + JSON.stringify(xss));
d = await dados();
if (d.folhas[subj].titulo === 'Estudos epidemiológicos') ok('com a folha já em andamento, importar não troca a folha que está sendo feita');
else falha('a importação trocou a folha em andamento');

/* ── 8. celular ──────────────────────────────────────────────────────── */
await pag.setViewportSize({ width: 390, height: 844 });
await pag.waitForTimeout(400);
if (!(await pag.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1))) ok('no celular, nada vaza para o lado');
else falha('a folha passou da largura do celular');
if (process.env.CAPTURA_FOLHA) await pag.locator('[data-teste="folha-em-branco"]').screenshot({ path: process.env.CAPTURA_FOLHA });

if (!errosDaPagina.length) ok('nenhum erro de JavaScript na página');
else falha('erros: ' + errosDaPagina.slice(0, 3).join(' | '));

await navegador.close();
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
