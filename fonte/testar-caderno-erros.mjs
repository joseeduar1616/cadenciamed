/* O caderno de erros (parte29), na tela, com a IA de mentira.
 *
 * Confere o caminho que a pessoa faz: anotar um erro escolhendo o
 * conteúdo e o motivo; a ficha guardada no formato do método (tema, o que
 * cobrava, certa, motivo) e marcada para reler em 7 dias; a lacuna virando
 * cartão; a IA preenchendo a ficha a partir da questão colada; e a
 * releitura ativa — esconde a resposta, "lembrei" espaça, "errei de novo"
 * traz de volta em dois dias.
 *
 *   node testar-caderno-erros.mjs [arquivo.html]
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
await pag.clock.setFixedTime(new Date('2026-10-06T09:00:00'));
const HOJE = '2026-10-06';

await pag.addInitScript(() => {
  try { const k = 'cadencia:v3:convite-notificacoes-aparelho'; if (!localStorage.getItem(k)) localStorage.setItem(k, '1'); } catch (e) { /* segue */ }
  if (sessionStorage.getItem('semeado')) return;
  sessionStorage.setItem('semeado', '1');
  localStorage.setItem('cadencia:v3', JSON.stringify({ profile: { name: 'Teste', onboarded: true, examDate: '2027-03-10' } }));
});

/* A IA de mentira devolve a ficha em JSON, escolhendo a primeira matéria
   da lista que a tela mandou — assim o teste confere que a lista vai. */
const pedidos = [];
await pag.route('**/api/assistente', async (rota) => {
  const corpo = JSON.parse(rota.request().postData() || '{}');
  pedidos.push(corpo);
  const primeira = (String(corpo.contexto || '').split('\n')[1] || '').split(':')[0].trim();
  const ficha = {
    tema: 'Hiponatremia sintomática', cobrava: 'Conduta inicial na hiponatremia grave com convulsão',
    marquei: 'Restrição hídrica', certa: 'Salina hipertônica 3% em bolus',
    porque: 'Com sintoma grave a prioridade é subir o sódio rápido; restrição hídrica é para o crônico leve.',
    regra: 'Sintoma neurológico grave: salina 3% primeiro.', motivo: 'diferencial', conteudo: primeira,
  };
  await rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ texto: '```json\n' + JSON.stringify(ficha) + '\n```' }) });
});

await pag.goto('file://' + alvo, { waitUntil: 'load' });
await pag.waitForTimeout(1800);
const semConta = pag.locator('button:has-text("usar sem conta")');
if (await semConta.count() > 0) { await semConta.first().click(); await pag.waitForTimeout(500); }

const dados = () => pag.evaluate(() => JSON.parse(localStorage.getItem('cadencia:v3')));
const texto = () => pag.evaluate(() => (document.querySelector('main') || document.body).innerText);

const aba = pag.locator('nav button:has-text("Caderno de erros")');
if (await aba.count()) ok('a aba Caderno de erros está na barra');
else falha('não achei a aba Caderno de erros');
await aba.first().click();
await pag.waitForTimeout(500);
if (/O caderno ainda está vazio/i.test(await texto())) ok('vazio, explica para que serve');
else falha('o caderno vazio não explicou nada');

/* ── 1. anotar à mão ─────────────────────────────────────────────────── */
await pag.locator('main button:has-text("Anotar um erro")').first().click();
await pag.waitForTimeout(300);
await pag.locator('main input[placeholder="Escolha a aula ou o tema"]').fill('Arritmias');
await pag.waitForTimeout(300);
await pag.locator('main button:has-text("Arritmias I")').first().click();
await pag.waitForTimeout(200);
await pag.locator('main input[placeholder="ex.: Síndrome nefrítica x nefrótica"]').fill('Fibrilação atrial');
await pag.locator('main input[placeholder="ex.: USP 2024, simulado de março, banco"]').fill('USP 2024');
await pag.locator('main textarea[placeholder^="ex.: conduta inicial"]').fill('Quando anticoagular na FA (CHA2DS2-VASc)');
await pag.locator('main input[placeholder="a alternativa certa, numa frase"]').fill('Anticoagular homem com escore 2 ou mais');
await pag.locator('main input[placeholder="uma linha que você vai reler"]').fill('Homem 2+, mulher 3+: anticoagula');
await pag.locator('main [role="radio"]:has-text("Li errado")').click();
if (/Treine a leitura do enunciado/.test(await texto())) ok('escolher o motivo mostra o que fazer com esse tipo de erro');
else falha('o motivo não mostrou a orientação');
await pag.locator('main button:has-text("Salvar no caderno")').click();
await pag.waitForTimeout(1900);
let d = await dados();
const f1 = (d.erros || [])[0];
if (f1 && f1.tema === 'Fibrilação atrial' && f1.motivo === 'atencao' && f1.subjectId && f1.fonte === 'USP 2024') ok('a ficha é guardada com conteúdo, tema, fonte e motivo');
else falha('ficha: ' + JSON.stringify(f1));
if (f1 && f1.prox === '2026-10-13') ok('e marcada para reler em 7 dias (releitura semanal do método)');
else falha('próxima releitura: ' + (f1 && f1.prox));

/* ── 2. a IA preenche a partir da questão colada ─────────────────────── */
await pag.locator('main button:has-text("Anotar um erro")').first().click();
await pag.waitForTimeout(300);
await pag.locator('main button:has-text("Colar a questão e a IA preenche")').click();
await pag.locator('main textarea[placeholder^="Cole o enunciado"]').fill('Paciente com sódio 115 e convulsão. Qual a conduta inicial? A) restrição hídrica B) salina 3%... Marquei A. Gabarito B.');
await pag.locator('main button:has-text("Preencher a ficha")').click();
await pag.waitForTimeout(800);
const p1 = pedidos[0] || {};
if (/caderno de erros/i.test(p1.instrucoes || '') && /LISTA DE MATÉRIAS/.test(p1.contexto || '')) ok('a IA recebe as regras da ficha e a lista de conteúdos para escolher');
else falha('pedido à IA: ' + JSON.stringify(p1).slice(0, 200));
const valorDe = (ph) => pag.locator(`main input[placeholder="${ph}"]`).inputValue();
if (await valorDe('a alternativa certa, numa frase') === 'Salina hipertônica 3% em bolus'
  && await valorDe('uma linha que você vai reler') === 'Sintoma neurológico grave: salina 3% primeiro.') {
  ok('a ficha vem preenchida pela IA, para conferir antes de salvar');
} else falha('a IA não preencheu os campos');
if (await pag.locator('main [role="radio"][aria-checked="true"]:has-text("Confundi")').count()) ok('com o motivo sugerido');
else falha('o motivo sugerido não foi marcado');
if (await pag.locator('main [aria-label="Trocar matéria"]').count()) ok('e o conteúdo já escolhido da lista');
else falha('a IA não escolheu o conteúdo');
await pag.locator('main button:has-text("Salvar no caderno")').click();
await pag.waitForTimeout(1900);
d = await dados();
if ((d.erros || []).length === 2) ok('salva como segunda ficha');
else falha('fichas: ' + (d.erros || []).length);

/* ── 3. a lacuna vira cartão ─────────────────────────────────────────── */
await pag.locator('main button:has-text("Fibrilação atrial")').first().click();
await pag.waitForTimeout(300);
await pag.locator('main button:has-text("Virar cartão")').first().click();
await pag.waitForTimeout(1900);
d = await dados();
const cartao = (d.flash || []).find((c) => c.baralho === 'Caderno de erros');
if (cartao && /CHA2DS2-VASc/.test(cartao.frente) && /Homem 2\+/.test(cartao.verso)) ok('"virar cartão" cria o flashcard: frente com o que cobrava, verso com a certa e a regra');
else falha('cartão: ' + JSON.stringify(cartao));
if (/já virou cartão/.test(await texto())) ok('e a ficha mostra que já virou cartão');
else falha('a ficha não registrou o cartão');

/* ── 4. releitura ativa ──────────────────────────────────────────────── */
await pag.locator('main button:has-text("Reler antes do simulado")').click();
await pag.waitForTimeout(300);
let t = await texto();
if (/A questão cobrava/i.test(t) && !/Salina hipertônica 3% em bolus|Anticoagular homem/.test(t)) ok('a releitura mostra o que a questão cobrava e ESCONDE a resposta');
else falha('a releitura mostrou a resposta antes da hora');
await pag.locator('main button:has-text("Mostrar a resposta")').click();
await pag.waitForTimeout(200);
await pag.locator('main button:has-text("Lembrei")').click();
await pag.waitForTimeout(200);
await pag.locator('main button:has-text("Mostrar a resposta")').click();
await pag.waitForTimeout(200);
await pag.locator('main button:has-text("Errei de novo")').click();
await pag.waitForTimeout(300);
if (/Releitura feita/i.test(await texto())) ok('no fim, mostra o resultado da releitura');
else falha('a releitura não terminou');
await pag.waitForTimeout(1900);
d = await dados();
const lembrada = (d.erros || []).find((e) => e.revisoes === 1 && e.seguidos === 1);
const errada = (d.erros || []).find((e) => e.revisoes === 1 && e.seguidos === 0);
if (lembrada && lembrada.prox === '2026-10-13') ok('"lembrei" manda a ficha para daqui a 7 dias');
else falha('lembrada: ' + JSON.stringify(lembrada));
if (errada && errada.prox === '2026-10-08') ok('"errei de novo" traz de volta em 2 dias');
else falha('errada: ' + JSON.stringify(errada));
await pag.locator('main button:has-text("Voltar ao caderno")').click();
await pag.waitForTimeout(300);

/* ── 5. filtros e celular ────────────────────────────────────────────── */
await pag.locator('main button:has-text("Confundi")').first().click();
await pag.waitForTimeout(200);
t = await texto();
if (/Hiponatremia/.test(t) && !/Fibrilação atrial/.test(t)) ok('o filtro por motivo funciona');
else falha('o filtro por motivo não filtrou');
await pag.setViewportSize({ width: 390, height: 844 });
await pag.waitForTimeout(300);
if (!(await pag.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1))) ok('no celular, nada vaza para o lado');
else falha('o caderno passou da largura do celular');
if (process.env.CAPTURA_CADERNO) await pag.screenshot({ path: process.env.CAPTURA_CADERNO, fullPage: true });

if (!errosDaPagina.length) ok('nenhum erro de JavaScript na página');
else falha('erros: ' + errosDaPagina.slice(0, 3).join(' | '));

await navegador.close();
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
