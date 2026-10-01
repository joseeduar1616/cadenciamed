/* O que não foi cumprido vai para a frente, na tela de verdade.
 *
 * O relógio fica parado numa terça, 9h. Na segunda havia um bloco da
 * mentoria que ninguém marcou. Ao abrir o site, ele tem de aparecer
 * remarcado para terça, no Hoje da mentoria e na Agenda, poder ser marcado
 * como cumprido lá, e sair junto quando o plano sai da Agenda.
 *
 *   node testar-pendentes-tela.mjs [arquivo.html]
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

/* terça, 6 de outubro de 2026, 9h da manhã */
await pag.clock.setFixedTime(new Date('2026-10-06T09:00:00'));

const semana = Array.from({ length: 7 }, (_, dia) => ({
  dia,
  blocos: dia === 0 ? [{ inicio: '19:00', fim: '20:30', titulo: 'Tema novo de cardio', tipo: 'Estudo', como: 'teoria e questões' }] : [],
}));
await pag.addInitScript((sem) => {
  try { localStorage.setItem('cadencia:v3:convite-notificacoes-aparelho', '1'); } catch (e) { /* segue */ }
  if (sessionStorage.getItem('semeado')) return;
  sessionStorage.setItem('semeado', '1');
  localStorage.setItem('cadencia:v3:assistente-modo', 'mentoria');
  localStorage.setItem('cadencia:v3', JSON.stringify({
    profile: { name: 'Teste', onboarded: true, examDate: '2027-03-10' },
    routine: [{ id: 'm-cardio', day: 0, label: 'Tema novo de cardio', type: 'Estudo', start: '19:00', end: '20:30', origem: 'mentoria' }],
    rolagem: { modo: 'mentoria', ate: '2026-10-04' },
    mentoria: {
      perfil: { horarios: 'noites' }, planoEm: Date.now(), aplicadoEm: new Date('2026-10-01T12:00:00').getTime(),
      plano: { resumo: 'Plano de teste.', semana: sem, comoEstudar: [], checklist: [], metas: { questoesDia: 0, simuladosPorMes: 0 } },
    },
  }));
}, semana);

await pag.goto('file://' + alvo, { waitUntil: 'load' });
await pag.waitForTimeout(1800);
const semConta = pag.locator('button:has-text("usar sem conta")');
if (await semConta.count() > 0) { await semConta.first().click(); await pag.waitForTimeout(500); }
await pag.waitForTimeout(1900);

const dados = () => pag.evaluate(() => JSON.parse(localStorage.getItem('cadencia:v3')));
const texto = () => pag.evaluate(() => (document.querySelector('main') || document.body).innerText);
const ir = async (nome) => {
  const b = pag.locator(`nav button:has-text("${nome}")`).first();
  if (await b.count()) { await b.click(); await pag.waitForTimeout(600); return true; }
  falha(`aba ${nome} não encontrada`);
  return false;
};

/* ── 1. remarcou ao abrir ────────────────────────────────────────────── */
let d = await dados();
const rem = (d.agenda || []).filter((b) => b.origem === 'pendente');
if (rem.length === 1 && rem[0].label === 'Tema novo de cardio') ok('ao abrir, o bloco de segunda não cumprido foi remarcado');
else falha('remarcados: ' + JSON.stringify(rem));
if (rem[0] && rem[0].date === '2026-10-06' && rem[0].start >= '09:15') ok(`para hoje, depois de agora (${rem[0] && rem[0].start})`);
else falha('foi para ' + JSON.stringify(rem[0]));

/* ── 2. a mentoria mostra ────────────────────────────────────────────── */
await ir('Assistente');
if (await pag.locator('[data-teste="remarcados-hoje"]').count()
  && /Tema novo de cardio/.test(await pag.locator('[data-teste="remarcados-hoje"]').innerText())) {
  ok('no plano da mentoria, aparece em "Remarcados para hoje"');
} else falha('o plano da mentoria não mostrou o remarcado de hoje');

/* ── 3. a Agenda mostra, e dá para cumprir ───────────────────────────── */
await ir('Agenda');
let t = await texto();
if (/remarcado de 05\/10\/26/i.test(t)) ok('na Agenda, o bloco diz que foi remarcado e de que dia');
else falha('a Agenda não mostrou a etiqueta de remarcado');
if (/O que não foi cumprido/i.test(t)) ok('e há o quadro que explica e deixa escolher o que remarcar');
else falha('o quadro de pendentes não apareceu');

const cartao = pag.locator('div.rounded-2xl:has-text("Tema novo de cardio"):has-text("remarcado")').last();
await cartao.locator('[aria-label="Marcar como cumprido"]').first().click();
await pag.waitForTimeout(1900);
d = await dados();
if (d.blocos && d.blocos[`${rem[0] && rem[0].id}|2026-10-06`]) ok('marcar como cumprido funciona no remarcado');
else falha('marcar o remarcado não gravou: ' + JSON.stringify(d.blocos));

await pag.locator('[data-teste="rolagem-nao"]').click();
await pag.waitForTimeout(1900);
d = await dados();
if (d.rolagem && d.rolagem.modo === 'nao') ok('"Não remarcar" fica guardado');
else falha('o modo não foi guardado: ' + JSON.stringify(d.rolagem));
await pag.locator('[data-teste="rolagem-mentoria"]').click();
await pag.waitForTimeout(600);

/* ── 4. tirar o plano da Agenda leva os remarcados dele ──────────────── */
await ir('Assistente');
await pag.locator('main button:has-text("tirar da Agenda")').first().click();
await pag.waitForTimeout(1900);
d = await dados();
if (!(d.agenda || []).some((b) => b.origem === 'pendente' && b.fonte === 'mentoria')) ok('tirar o plano da Agenda leva junto os remarcados dele');
else falha('sobrou remarcado da mentoria na Agenda');

if (!errosDaPagina.length) ok('nenhum erro de JavaScript na página');
else falha('erros: ' + errosDaPagina.slice(0, 3).join(' | '));

await navegador.close();
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
