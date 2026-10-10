/* O assistente lança horas no dia certo (parte9, dataDaSessaoIA).
 *
 * Antes a ação "sessao" não tinha data: "ontem estudei 3h, anteontem 2h"
 * caía tudo em hoje. Agora cada sessão leva a data que a IA calculou, e a
 * tela confere: data futura, inválida ou de mais de um ano vira hoje. E a
 * IA recebe o dia da semana junto da data de hoje, para saber o que é
 * "segunda" ou "sábado passado".
 *
 *   node testar-assistente-datas.mjs [teste.html]
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { servirSolto } from './servir-teste.mjs';

const alvo = path.resolve(process.argv[2] || 'teste.html');
const erros = [];
const ok = (m) => console.log('ok   ' + m);
const falha = (m) => { console.log('FALHA ' + m); erros.push(m); };

const iso = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const ACOES = [
  { tipo: 'sessao', data: iso(1), materia: 'Cardiologia', tipoSessao: 'Aula', minutos: 180 },
  { tipo: 'sessao', data: iso(2), materia: 'Pediatria', tipoSessao: 'Questões', minutos: 120, questoes: 40, acertos: 31 },
  { tipo: 'sessao', data: iso(-3), materia: 'Futuro', minutos: 60 },
  { tipo: 'sessao', data: '2026-02-30', materia: 'Data que não existe', minutos: 30 },
  { tipo: 'sessao', materia: 'Sem data', minutos: 45 },
];
let pedido = null;

const servidor = http.createServer((q, r) => { if (servirSolto(q, r)) return; r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(fs.readFileSync(alvo)); });
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const navegador = await chromium.launch({ args: ['--no-sandbox'], ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}) });
const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => {
  if (location.protocol === 'about:' || sessionStorage.getItem('semeado')) return;
  sessionStorage.setItem('semeado', '1');
  localStorage.setItem('cadencia:v3:convite-notificacoes-aparelho', 'teste');
  localStorage.setItem('cadencia:v3', JSON.stringify({ profile: { name: 'Teste', onboarded: true }, tema: { versaoVisual: 2 } }));
});
await ctx.route('https://www.gstatic.com/**', (r) => r.abort());
await ctx.route('**/api/**', (r) => {
  const u = r.request().url();
  if (u.includes('/api/assistente')) {
    try { pedido = JSON.parse(r.request().postData() || '{}'); } catch (e) { /* noop */ }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ texto: 'Lancei as suas horas.\n<acoes>\n' + JSON.stringify(ACOES) + '\n</acoes>' }) });
  }
  return r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
});
const pag = await ctx.newPage();
const errosDaPagina = [];
pag.on('pageerror', (e) => errosDaPagina.push(e.message));
await pag.goto(`http://127.0.0.1:${servidor.address().port}/`, { waitUntil: 'load' });
await pag.waitForTimeout(1500);
const sc = pag.locator('button:has-text("usar sem conta")');
if (await sc.count()) { await sc.first().click(); await pag.waitForTimeout(500); }

await pag.locator('nav button:has-text("Assistente")').first().click();
await pag.waitForTimeout(600);
await pag.locator('input[placeholder="Escreva sua pergunta"]').fill('Lança 3h de cardio ontem e 2h de pediatria anteontem');
await pag.keyboard.press('Enter');
await pag.waitForFunction(() => { try { return (JSON.parse(localStorage.getItem('cadencia:v3')).sessions || []).length >= 5; } catch (e) { return false; } }, null, { timeout: 10000 }).catch(() => {});
const sess = ((await pag.evaluate(() => JSON.parse(localStorage.getItem('cadencia:v3') || '{}'))).sessions) || [];
const por = (t) => sess.find((s) => s.topic === t || (s.topic || '').includes(t));
const hoje = iso(0);

if (pedido && new RegExp(`DATA DE HOJE: .*, (domingo|segunda|terça|quarta|quinta|sexta|sábado) \\(${hoje}\\)`).test(pedido.contexto || '')) ok('a IA recebe a data de hoje com o dia da semana');
else falha('contexto: ' + String(pedido && pedido.contexto).slice(0, 120));
if (/"data":"\d{4}-\d{2}-\d{2}"/.test((pedido && pedido.instrucoes) || '') && /nunca junte tudo num dia só/.test((pedido && pedido.instrucoes) || '')) ok('a instrução pede uma sessão por dia, cada uma com a sua data');
else falha('instrução sem data');
const cardio = sess.find((s) => /Cardio/i.test(s.topic || ''));
const pedia = sess.find((s) => /Pediatria/i.test(s.topic || ''));
if (cardio && cardio.date === iso(1) && cardio.minutes === 180) ok('"ontem" vai para ontem, com os 180 minutos');
else falha('cardio: ' + JSON.stringify(cardio));
if (pedia && pedia.date === iso(2) && pedia.questions === 40) ok('"anteontem" vai para anteontem, com as questões');
else falha('pediatria: ' + JSON.stringify(pedia));
const futuro = por('Futuro'), invalida = por('Data que não existe'), semData = por('Sem data');
if (futuro && futuro.date === hoje) ok('data no futuro não é aceita: vira hoje');
else falha('futuro: ' + JSON.stringify(futuro));
if (invalida && invalida.date === hoje && semData && semData.date === hoje) ok('data que não existe, ou sem data, vira hoje');
else falha('inválida/sem data: ' + JSON.stringify([invalida, semData]));

if (!errosDaPagina.length) ok('nenhum erro de JavaScript na página');
else falha('erros: ' + errosDaPagina.slice(0, 3).join(' | '));
await navegador.close();
servidor.close();
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
