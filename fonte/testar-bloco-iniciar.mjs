/* Iniciar um bloco da agenda e contar o tempo, como o Foco (parte28).
 *
 * Relógio de mentira, parado numa terça às 9h, com dois blocos da
 * mentoria para hoje. Confere: o botão aparece em Hoje, na Agenda e no
 * plano da mentoria; o tempo corre e acompanha por todas as abas;
 * Concluir registra a sessão e marca o bloco cumprido; e o "Você está
 * aí?" vale aqui também — sem resposta, conta só até a pergunta.
 *
 *   node testar-bloco-iniciar.mjs [arquivo.html]
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
await pag.clock.install({ time: new Date('2026-10-06T09:00:00') });

const HOJE = '2026-10-06';
const semana = Array.from({ length: 7 }, (_, dia) => ({
  dia,
  blocos: dia === 1 ? [
    { inicio: '09:00', fim: '10:30', titulo: 'Tema novo de cardio', tipo: 'Estudo', como: 'teoria e questões' },
    { inicio: '11:00', fim: '12:00', titulo: 'Questões do tema', tipo: 'Questões', como: '20 questões' },
  ] : [],
}));
await pag.addInitScript((sem) => {
  try { const k = 'cadencia:v3:convite-notificacoes-aparelho'; if (!localStorage.getItem(k)) localStorage.setItem(k, '1'); } catch (e) { /* segue */ }
  if (sessionStorage.getItem('semeado')) return;
  sessionStorage.setItem('semeado', '1');
  localStorage.setItem('cadencia:v3', JSON.stringify({
    profile: { name: 'Teste', onboarded: true, examDate: '2027-03-10' },
    routine: [
      { id: 'm-cardio', day: 1, label: 'Tema novo de cardio', type: 'Estudo', start: '09:00', end: '10:30', origem: 'mentoria' },
      { id: 'm-quest', day: 1, label: 'Questões do tema', type: 'Questões', start: '11:00', end: '12:00', origem: 'mentoria' },
      { id: 'plantao', day: 1, label: 'Plantão', type: 'Plantão', start: '13:00', end: '19:00' },
    ],
    rolagem: { modo: 'mentoria', ate: '2026-10-05' },
    mentoria: {
      perfil: { horarios: 'manhãs' }, planoEm: Date.now(), aplicadoEm: Date.now(),
      plano: { resumo: 'Plano.', semana: sem, comoEstudar: [], checklist: [], metas: { questoesDia: 0, simuladosPorMes: 0 } },
    },
  }));
}, semana);

await pag.goto('file://' + alvo, { waitUntil: 'load' });
await pag.waitForTimeout(1800);
const semConta = pag.locator('button:has-text("usar sem conta")');
if (await semConta.count() > 0) { await semConta.first().click(); await pag.waitForTimeout(500); }

const dados = () => pag.evaluate(() => JSON.parse(localStorage.getItem('cadencia:v3')));
const ir = async (nome) => {
  const b = pag.locator(`nav button:has-text("${nome}")`).first();
  if (await b.count()) { await b.click(); await pag.waitForTimeout(500); return true; }
  falha(`aba ${nome} não encontrada`);
  return false;
};
const barra = pag.locator('[data-teste="barra-bloco"]');

/* ── 1. em Hoje ──────────────────────────────────────────────────────── */
await ir('Hoje');
const iniciarHoje = pag.locator('main [aria-label="Iniciar Tema novo de cardio"]');
if (await iniciarHoje.count()) ok('em Hoje, o bloco da mentoria tem "Iniciar"');
else falha('não achei "Iniciar" em Hoje');
if (!(await pag.locator('main [aria-label="Iniciar Plantão"]').count())) ok('plantão não tem "Iniciar" (não é estudo)');
else falha('apareceu "Iniciar" num plantão');
await iniciarHoje.first().click();
await pag.waitForTimeout(400);
if (await barra.count() && /Tema novo de cardio/.test(await barra.innerText())) ok('iniciar abre a barra do bloco em andamento');
else falha('a barra do bloco não apareceu');

/* no celular, a barra cabe sem empurrar nada para o lado */
await pag.setViewportSize({ width: 390, height: 844 });
await pag.waitForTimeout(300);
if (!(await pag.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1))) ok('no celular, a barra cabe na largura da tela');
else falha('a barra do bloco passou da largura do celular');
if (process.env.CAPTURA_BLOCO) await pag.screenshot({ path: process.env.CAPTURA_BLOCO });
await pag.setViewportSize({ width: 1280, height: 900 });
await pag.waitForTimeout(300);

/* ── 2. o tempo corre, e acompanha as abas ───────────────────────────── */
await pag.clock.fastForward('25:00');
await pag.waitForTimeout(600);
const t1 = await barra.innerText().catch(() => '');
if (/25:0\d/.test(t1)) ok('25 minutos depois, a barra mostra 25 minutos');
else falha('o relógio do bloco não andou: ' + t1);
await ir('Agenda');
if (await barra.count()) ok('trocando de aba, a barra continua lá');
else falha('a barra sumiu ao trocar de aba');
if (await pag.locator('main [data-teste="relogio-bloco"]').count()) ok('na Agenda, o cartão do bloco mostra o relógio correndo');
else falha('a Agenda não mostrou o bloco em andamento');
if (await pag.locator('main [aria-label="Iniciar Questões do tema"]').count()) ok('e o outro bloco de hoje continua com "Iniciar"');
else falha('o outro bloco perdeu o botão');

await ir('Assistente');
const mentoria = pag.locator('button[role="tab"]:has-text("Mentoria de estudo")');
if (await mentoria.count()) { await mentoria.first().click(); await pag.waitForTimeout(400); }
if (await pag.locator('main [data-teste="relogio-bloco"]').count()) ok('no plano da mentoria, o bloco de hoje aparece em andamento (é o mesmo da Agenda)');
else falha('o plano da mentoria não reconheceu o bloco em andamento');

/* ── 3. concluir ─────────────────────────────────────────────────────── */
await barra.locator('button:has-text("Concluir")').click();
await pag.waitForTimeout(600);
if (!(await barra.count())) ok('concluir fecha a barra');
else falha('a barra continuou depois de concluir');
if (await pag.locator('button:has-text("deixar como")').count()) {
  ok('e abre a mesma pergunta do Foco (tipo, questões, acertos)');
  await pag.locator('button:has-text("deixar como")').first().click();
} else falha('a pergunta de classificar a sessão não abriu');
await pag.waitForTimeout(1900);
let d = await dados();
const sessao = (d.sessions || []).find((s) => s.topic === 'Tema novo de cardio');
if (sessao && sessao.minutes === 25 && sessao.date === HOJE) ok('o tempo vira sessão de estudo: 25 minutos, com o nome do bloco');
else falha('sessão: ' + JSON.stringify(sessao));
if (d.blocos && d.blocos[`m-cardio|${HOJE}`]) ok('e o bloco fica cumprido (não vai para os próximos dias)');
else falha('o bloco não foi marcado como cumprido');

/* ── 4. "Você está aí?" no bloco ─────────────────────────────────────── */
await ir('Agenda');
await pag.locator('main [aria-label="Iniciar Questões do tema"]').first().click();
await pag.waitForTimeout(300);
await pag.clock.fastForward('30:05');
await pag.waitForTimeout(600);
const pergunta = pag.locator('[role="alertdialog"]:has-text("Você está aí?")');
if (await pergunta.count() && /Questões do tema/.test(await pergunta.innerText())) ok('aos 30 minutos, o bloco pergunta "Você está aí?"');
else falha('a pergunta de presença não apareceu no bloco');
await pergunta.locator('button:has-text("Estou aqui")').click();
await pag.waitForTimeout(400);
if (!(await pergunta.count()) && await barra.count()) ok('"Estou aqui" fecha a pergunta e o bloco segue contando');
else falha('responder não manteve o bloco correndo');

await pag.clock.fastForward('30:00');
await pag.waitForTimeout(300);
await pag.clock.fastForward('01:10');
await pag.waitForTimeout(800);
if (!(await barra.count())) ok('sem resposta na segunda pergunta, o bloco para sozinho');
else falha('o bloco continuou sem ninguém responder');
if (await pag.locator('button:has-text("deixar como")').count()) await pag.locator('button:has-text("deixar como")').first().click();
await pag.waitForTimeout(1900);
d = await dados();
const s2 = (d.sessions || []).find((s) => s.topic === 'Questões do tema');
if (s2 && s2.minutes === 60) ok('e conta só até a pergunta (60 min, não 61)');
else falha('sessão sem resposta: ' + JSON.stringify(s2));
if (!(d.blocos || {})[`m-quest|${HOJE}`]) ok('parado assim, o bloco não fica cumprido');
else falha('marcou como cumprido sem a pessoa concluir');

if (!errosDaPagina.length) ok('nenhum erro de JavaScript na página');
else falha('erros: ' + errosDaPagina.slice(0, 3).join(' | '));

await navegador.close();
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
