/* O que foi estudado no Anki conta aqui (parte35).
 *
 * Monta coleções do Anki de verdade (SQLite com a tabela revlog) nos dois
 * formatos: o antigo (collection.anki21) e o novo do AnkiDroid, compactado
 * com zstd (collection.anki21b). Confere: as revisões viram uma sessão de
 * Flashcards por dia, com os minutos certos; reagendamento manual e linha
 * sem botão não contam; resposta esquecida aberta tem teto; importar de
 * novo não duplica, e um arquivo mais completo atualiza o dia; e o mesmo
 * arquivo novo também traz os cartões pelo "Trazer baralho".
 *
 *   node testar-anki-historico.mjs [teste.html]
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const initSqlJs = require('./sql-asm.js');
const { zipSync } = require('fflate');
const alvo = path.resolve(process.argv[2] || 'teste.html');
const erros = [];
const ok = (m) => console.log('ok   ' + m);
const falha = (m) => { console.log('FALHA ' + m); erros.push(m); };

const SQL = await initSqlJs();
const DIA = 86400000;
/* meio-dia local de N dias atrás, para a data não escorregar de dia */
const dia = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); return d.getTime() - n * DIA; };
const iso = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function colecao(revisoes) {
  const db = new SQL.Database();
  db.run(`CREATE TABLE col (id integer primary key, decks text);
    CREATE TABLE notes (id integer primary key, flds text, tags text);
    CREATE TABLE revlog (id integer primary key, cid integer, usn integer, ease integer, ivl integer, lastIvl integer, factor integer, time integer, type integer);`);
  db.run("INSERT INTO col VALUES (1, ?)", [JSON.stringify({ 1: { name: 'Default' }, 2: { name: 'Cardio' } })]);
  db.run("INSERT INTO notes VALUES (1, ?, '')", ['Tríade de Beck\u001fHipotensão, turgência jugular, abafamento']);
  db.run("INSERT INTO notes VALUES (2, ?, '')", ['Droga da FA instável\u001fCardioversão elétrica']);
  let k = 0;
  for (const [t, ms, tipo = 1, botao = 3] of revisoes) {
    db.run('INSERT INTO revlog VALUES (?,?,?,?,?,?,?,?,?)', [t + (k++), 1, 0, botao, 1, 0, 2500, ms, tipo]);
  }
  const bytes = db.export();
  db.close();
  return bytes;
}
const pacote = (bytes, novo) => Buffer.from(zipSync(novo
  ? { 'collection.anki21b': new Uint8Array(zlib.zstdCompressSync(Buffer.from(bytes))), 'collection.anki2': colecao([]), media: new Uint8Array([0]) }
  : { 'collection.anki21': bytes, media: new TextEncoder().encode('{}') }));

/* ontem: 60 respostas de 10 s = 10 min; anteontem: 30 de 8 s = 4 min, mais
   uma resposta "esquecida" de 2 horas (teto de 5 min) = 9 min; e linhas que
   não contam: reagendamento manual (type 4) e sem botão (ease 0) */
const REV = [
  ...Array.from({ length: 60 }, (_, i) => [dia(1) + i * 1000, 10000]),
  ...Array.from({ length: 30 }, (_, i) => [dia(2) + i * 1000, 8000]),
  [dia(2) + 99000, 2 * 3600 * 1000],
  [dia(3), 600000, 4, 0],
  [dia(3) + 1000, 600000, 1, 0],
  [dia(500), 60000],   /* mais de um ano: fica de fora */
];
const NOVO = pacote(colecao(REV), true);
const MAIS = pacote(colecao([...REV, ...Array.from({ length: 30 }, (_, i) => [dia(1) + 200000 + i * 1000, 10000])]), false);

const servidor = http.createServer((q, r) => {
  const u = q.url.split('?')[0];
  if (u === '/fzstd.min.js') { r.writeHead(200, { 'Content-Type': 'text/javascript' }); return r.end(fs.readFileSync('fzstd.min.js')); }
  if (u === '/sql-asm.js') { r.writeHead(200, { 'Content-Type': 'text/javascript' }); return r.end(fs.readFileSync('sql-asm.js')); }
  r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(fs.readFileSync(alvo));
});
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
const pag = await ctx.newPage();
const errosDaPagina = [];
pag.on('pageerror', (e) => errosDaPagina.push(e.message));
await pag.goto(`http://127.0.0.1:${servidor.address().port}/`, { waitUntil: 'load' });
await pag.waitForTimeout(1500);
const sc = pag.locator('button:has-text("usar sem conta")');
if (await sc.count()) { await sc.first().click(); await pag.waitForTimeout(500); }
const dados = () => pag.evaluate(() => JSON.parse(localStorage.getItem('cadencia:v3') || '{}'));
const sessoesAnki = async () => ((await dados()).sessions || []).filter((s) => /^anki-/.test(s.id));
const esperarSessoes = (n) => pag.waitForFunction((k) => {
  try { return (JSON.parse(localStorage.getItem('cadencia:v3')).sessions || []).filter((s) => /^anki-/.test(s.id)).length === k; } catch (e) { return false; }
}, n, { timeout: 8000 }).catch(() => {});

await pag.locator('nav button:has-text("Cartões")').first().click();
await pag.waitForTimeout(500);
await pag.locator('button:has-text("Trazer baralho")').first().click();
await pag.waitForTimeout(400);
if (await pag.locator('[data-teste="anki-historico"]').count()) ok('em Cartões › Trazer baralho aparece "Contar o que estudei no Anki", com o passo a passo');
else falha('o bloco do histórico do Anki não aparece');

/* ── 1. o arquivo novo do AnkiDroid (zstd) ───────────────────────────── */
await pag.locator('[data-teste="anki-historico-arquivo"]').setInputFiles([{ name: 'colecao.colpkg', mimeType: 'application/octet-stream', buffer: NOVO }]);
await pag.waitForSelector('[data-teste="anki-historico-resultado"]', { timeout: 10000 }).catch(() => {});
const res1 = await pag.locator('[data-teste="anki-historico-resultado"]').innerText().catch(() => '');
await esperarSessoes(2);
let s = await sessoesAnki();
const ontem = s.find((x) => x.date === iso(dia(1)));
const anteontem = s.find((x) => x.date === iso(dia(2)));
if (s.length === 2 && ontem && anteontem) ok('o formato novo do AnkiDroid (compactado) abre, e cada dia com revisão vira uma sessão');
else falha('sessões: ' + JSON.stringify(s) + ' / ' + res1);
if (ontem && ontem.minutes === 10 && ontem.kind === 'Flashcards' && /60 cartões/.test(ontem.topic)) ok('ontem: 60 cartões, 10 minutos, como Flashcards');
else falha('ontem: ' + JSON.stringify(ontem));
if (anteontem && anteontem.minutes === 9) ok('resposta esquecida aberta por 2 horas conta no máximo 5 minutos');
else falha('anteontem: ' + JSON.stringify(anteontem));
if (!s.find((x) => x.date === iso(dia(3))) && !s.find((x) => x.date === iso(dia(500)))) ok('reagendamento manual, linha sem resposta e o que tem mais de um ano não contam');
else falha('contou o que não devia: ' + JSON.stringify(s.map((x) => x.date)));
if (/91 cartões/.test(res1) && /19 ?min/.test(res1)) ok('a tela diz quantos cartões e quanto tempo entraram');
else falha('mensagem: ' + res1);

/* ── 2. importar de novo não duplica ─────────────────────────────────── */
await pag.locator('[data-teste="anki-historico-arquivo"]').setInputFiles([{ name: 'colecao.colpkg', mimeType: 'application/octet-stream', buffer: NOVO }]);
await pag.waitForTimeout(1500);
s = await sessoesAnki();
const res2 = await pag.locator('[data-teste="anki-historico-resultado"]').innerText().catch(() => '');
if (s.length === 2 && /já estavam contados/.test(res2)) ok('importar o mesmo arquivo de novo não duplica nada');
else falha('reimportação: ' + s.length + ' / ' + res2);

/* ── 3. arquivo mais completo atualiza o dia ─────────────────────────── */
await pag.locator('[data-teste="anki-historico-arquivo"]').setInputFiles([{ name: 'colecao-antiga.apkg', mimeType: 'application/octet-stream', buffer: MAIS }]);
await pag.waitForFunction((d) => {
  try { const x = JSON.parse(localStorage.getItem('cadencia:v3')).sessions.find((y) => y.id === 'anki-' + d); return x && x.minutes === 15; } catch (e) { return false; }
}, iso(dia(1)), { timeout: 8000 }).catch(() => {});
s = await sessoesAnki();
const ontem2 = s.find((x) => x.date === iso(dia(1)));
if (s.length === 2 && ontem2 && ontem2.minutes === 15) ok('o formato antigo também entra, e o dia que ganhou revisões é atualizado: 15 min, sem sessão dobrada');
else falha('atualização: ' + JSON.stringify(s));

/* ── 4. o mesmo arquivo novo traz os cartões ─────────────────────────── */
await pag.locator('input[type="file"][accept^=".apkg"]').setInputFiles([{ name: 'colecao.apkg', mimeType: 'application/octet-stream', buffer: NOVO }]);
await pag.waitForFunction(() => { try { return (JSON.parse(localStorage.getItem('cadencia:v3')).flash || []).length >= 2; } catch (e) { return false; } }, null, { timeout: 10000 }).catch(() => {});
const flash = (await dados()).flash || [];
if (flash.some((c) => /Tríade de Beck/.test(c.frente))) ok('o "Trazer baralho" agora também abre o formato novo do Anki (sem pedir o modo de compatibilidade)');
else falha('cartões do formato novo: ' + JSON.stringify(flash).slice(0, 200));

if (!errosDaPagina.length) ok('nenhum erro de JavaScript na página');
else falha('erros: ' + errosDaPagina.slice(0, 3).join(' | '));
await navegador.close();
servidor.close();
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
