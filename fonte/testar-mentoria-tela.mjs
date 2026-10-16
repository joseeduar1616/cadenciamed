/* A mentoria na tela, de ponta a ponta, com a IA de mentira.
 *
 * O teste da rota (testar-mentoria.mjs) garante o que o servidor deixa
 * passar. Este garante o que a TELA faz com isso, que é onde estão os
 * estragos que a pessoa sentiria:
 *
 *   · o que ela conta tem de ficar guardado no perfil, e não só na
 *     conversa — senão a mentoria pergunta tudo de novo depois de catorze
 *     mensagens;
 *   · pôr o plano na Agenda não pode apagar nem atropelar um bloco que a
 *     pessoa criou (o plantão dela continua lá, e o bloco da mentoria que
 *     bateria com ele fica de fora, com aviso ANTES de confirmar);
 *   · aplicar de novo não duplica, e "tirar da Agenda" tira só o que a
 *     mentoria pôs.
 *
 *   node testar-mentoria-tela.mjs [arquivo.html]
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

/* Um bloco da PESSOA na segunda, 19h às 20h. O plano da mentoria vai
   tentar pôr um bloco por cima dele — e não pode. */
await pag.addInitScript(() => {
  /* O convite de ativar as notificações abre por cima de tudo na primeira
     visita, e aqui ele só atrapalharia os cliques. */
  try { const k = 'cadencia:v3:convite-notificacoes-aparelho'; if (!localStorage.getItem(k)) localStorage.setItem(k, '1'); } catch (e) { /* segue */ }
  if (sessionStorage.getItem('semeado')) return;
  sessionStorage.setItem('semeado', '1');
  try {
    localStorage.setItem('cadencia:v3', JSON.stringify({
      profile: { name: 'Teste', onboarded: true, examDate: '2027-03-10' },
      routine: [{ id: 'meu-plantao', day: 0, label: 'Plantão do hospital', type: 'Plantão', start: '19:00', end: '20:00' }],
      goals: { daily: 120, weekly: 720, questions: 200 },
    }));
  } catch (e) { /* segue */ }
});

/* A IA de mentira. Cada pedido recebe a próxima resposta da fila, e o
   corpo de cada pedido fica guardado para conferir o que a tela mandou. */
const pedidos = [];
const plano = {
  resumo: 'Noites de semana para tema novo, sábado de questões mistas, domingo livre.',
  semana: [
    { dia: 0, blocos: [
      { inicio: '19:00', fim: '20:30', titulo: 'Tema novo de clínica', tipo: 'Estudo', como: 'teoria e folha em branco' },
      { inicio: '21:00', fim: '22:00', titulo: 'Questões do tema', tipo: 'Questões', como: '20 questões lendo os comentários' },
    ] },
    { dia: 1, blocos: [{ inicio: '19:00', fim: '20:30', titulo: 'Tema novo de cirurgia', tipo: 'Estudo', como: 'teoria e questões' }] },
    { dia: 2, blocos: [{ inicio: '19:00', fim: '20:30', titulo: 'Tema novo de pediatria', tipo: 'Estudo', como: 'teoria e questões' }] },
    { dia: 3, blocos: [{ inicio: '19:00', fim: '20:30', titulo: 'Tema novo de GO', tipo: 'Estudo', como: 'teoria e questões' }] },
    { dia: 4, blocos: [{ inicio: '19:00', fim: '20:30', titulo: 'Tema novo de preventiva', tipo: 'Estudo', como: 'teoria e questões' }] },
    { dia: 5, blocos: [{ inicio: '09:00', fim: '12:00', titulo: 'Questões mistas', tipo: 'Questões', como: 'intercalação e caderno de erros' }] },
    { dia: 6, blocos: [] },
  ],
  comoEstudar: [{ situacao: 'Tema novo', passos: ['teoria objetiva', 'folha em branco', '20 questões'] }],
  checklist: ['Fiz o Anki do dia?', 'Registrei os erros com o motivo?'],
  metas: { questoesDia: 40, simuladosPorMes: 1 },
};
const fila = [
  { texto: 'Vejo que faltam 160 dias para a prova. Quais são os seus horários livres?', opcoes: ['Noites de semana', 'Manhãs', 'Fins de semana'], perfil: {}, plano: null },
  { texto: 'Ótimo, noites. Como você estuda hoje um tema novo?', opcoes: ['Assisto aula', 'Leio resumo'], perfil: { horarios: 'noites de semana' }, plano: null },
  { texto: 'Aqui está o seu plano, montado com prática de recuperação e intercalação.', opcoes: [], perfil: { jeitoAtual: 'assiste aula' }, plano },
];
await pag.route('**/api/assistente', async (rota) => {
  const corpo = JSON.parse(rota.request().postData() || '{}');
  pedidos.push(corpo);
  const r = fila.shift() || { texto: 'ok', opcoes: [], perfil: {}, plano: null };
  await rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...r, cortado: false }) });
});

await pag.goto('file://' + alvo, { waitUntil: 'load' });
await pag.waitForTimeout(1800);
const semConta = pag.locator('button:has-text("usar sem conta")');
if (await semConta.count() > 0) { await semConta.first().click(); await pag.waitForTimeout(500); }

const dados = () => pag.evaluate(() => {
  try { return JSON.parse(localStorage.getItem('cadencia:v3')); } catch (e) { return null; }
});
/* Títulos e rótulos do app são escritos em caixa alta por CSS, e o
   innerText devolve o texto JÁ transformado — por isso as conferências de
   título usam /i. */
const texto = () => pag.evaluate(() => (document.querySelector('main') || document.body).innerText);

const aba = pag.locator('nav button:has-text("Assistente")');
if (await aba.count() === 0) {
  falha('a aba Assistente não está na barra do build de teste');
} else {
  await aba.first().click();
  await pag.waitForTimeout(500);

  /* ── o modo ───────────────────────────────────────────────────────── */
  const botaoModo = pag.locator('button[role="tab"]:has-text("Mentoria de estudo")');
  if (await botaoModo.count() > 0) ok('o Assistente tem o modo Mentoria de estudo');
  else falha('não achei o seletor da mentoria');
  await botaoModo.first().click();
  await pag.waitForTimeout(400);
  if (/O que ela já sabe de você · 0 de 22/i.test(await texto())) ok('a mentoria abre mostrando que ainda não sabe nada');
  else falha('o andamento da entrevista não apareceu');

  /* ── começar ──────────────────────────────────────────────────────── */
  await pag.locator('main button:has-text("Começar a mentoria")').first().click();
  await pag.waitForTimeout(900);
  const p1 = pedidos[0] || {};
  if (p1.modo === 'mentoria') ok('o pedido vai marcado como mentoria');
  else falha('o pedido não foi como mentoria: ' + JSON.stringify(p1).slice(0, 120));
  if (/PROVA:/.test(p1.contexto || '')) ok('e leva os dados do painel junto');
  else falha('os dados do painel não foram junto');
  if (!p1.instrucoes) ok('e não manda instruções próprias: quem manda é o servidor');
  else falha('a tela mandou instruções no modo mentoria');

  if (/faltam 160 dias/.test(await texto())) ok('a primeira fala da mentoria aparece');
  else falha('a resposta da mentoria não apareceu');

  /* ── responder tocando ─────────────────────────────────────────────── */
  const opcao = pag.locator('main button:has-text("Noites de semana")');
  if (await opcao.count() > 0) ok('as opções aparecem como botões de toque');
  else falha('as opções de toque não apareceram');
  await opcao.first().click();
  await pag.waitForTimeout(900);
  if ((pedidos[1] && pedidos[1].mensagens || []).some((m) => m.content === 'Noites de semana')) {
    ok('tocar na opção manda a resposta');
  } else falha('tocar na opção não mandou nada');

  await pag.waitForTimeout(1900);
  let d = await dados();
  if (d && d.mentoria && d.mentoria.perfil && d.mentoria.perfil.horarios === 'noites de semana') {
    ok('o que a pessoa contou fica guardado no perfil da conta, e não só na conversa');
  } else falha('o perfil não foi guardado: ' + JSON.stringify(d && d.mentoria));
  if (/O que ela já sabe de você · 1 de 22/i.test(await texto())) ok('e o andamento da entrevista anda');
  else falha('o andamento não mudou depois da resposta');

  /* O perfil vai em toda chamada seguinte: é o que impede a mentoria de
     perguntar de novo quando a conversa passar de catorze mensagens. */
  await pag.locator('main textarea').first().fill('Assisto aula e depois faço umas questões');
  await pag.locator('main button[title="Enviar"]').first().click();
  await pag.waitForTimeout(900);
  if ((pedidos[2] && pedidos[2].perfil || {}).horarios === 'noites de semana') {
    ok('o perfil guardado vai junto no pedido seguinte');
  } else falha('o pedido seguinte foi sem o perfil');

  /* ── o plano ───────────────────────────────────────────────────────── */
  await pag.waitForTimeout(1900);
  let t = await texto();
  if (/Seu plano/i.test(t) && /Noites de semana para tema novo/.test(t)) ok('o plano aparece num cartão próprio, fora da conversa');
  else falha('o cartão do plano não apareceu');
  if (/Hoje, /i.test(t)) ok('o plano mostra primeiro o que é de hoje');
  else falha('o plano não destaca o dia de hoje');
  if (/Questões mistas/.test(t) && /Tema novo de preventiva/.test(t)) ok('e a semana inteira');
  else falha('a semana não apareceu inteira');

  /* ── pôr na Agenda ─────────────────────────────────────────────────── */
  await pag.locator('main button:has-text("Pôr na minha Agenda")').first().click();
  await pag.waitForTimeout(400);
  t = await texto();
  if (/6 blocos vão para a sua Agenda/.test(t)) ok('a confirmação diz quantos blocos vão entrar');
  else falha('a confirmação não deu o número certo: ' + (t.match(/\d+ blocos? v[ãa]o[^.]*/) || ['?'])[0]);
  if (/Ficam de fora 1/.test(t) && /Plantão do hospital/.test(t)) ok('e avisa ANTES qual bloco fica de fora por bater com o plantão da pessoa');
  else falha('a colisão com o bloco da pessoa não foi avisada');
  if (/Google Agenda/.test(t)) ok('e avisa que vai para o Google Agenda, se estiver ligado');
  else falha('a confirmação não falou do Google Agenda');

  await pag.locator('main button:has-text("Confirmar")').first().click();
  await pag.waitForTimeout(1900);
  d = await dados();
  const rotina = (d && d.routine) || [];
  const daMentoria = rotina.filter((b) => b.origem === 'mentoria');
  const meu = rotina.find((b) => b.id === 'meu-plantao');
  if (daMentoria.length === 6) ok('os blocos da mentoria entram na rotina, marcados como dela');
  else falha(`entraram ${daMentoria.length} blocos da mentoria`);
  if (meu && meu.start === '19:00' && meu.label === 'Plantão do hospital') ok('o plantão da pessoa continua intacto');
  else falha('o bloco da pessoa foi mexido: ' + JSON.stringify(meu));
  if (!daMentoria.some((b) => b.day === 0 && b.start === '19:00')) ok('e nada da mentoria ficou por cima dele');
  else falha('a mentoria pôs um bloco por cima do plantão');
  if (d.goals && d.goals.questions === 240) ok('a meta semanal de questões foi ajustada (40 por dia em 6 dias)');
  else falha('a meta semanal ficou ' + (d.goals && d.goals.questions));

  /* Aplicar de novo não pode duplicar. */
  await pag.locator('main button:has-text("Atualizar na Agenda")').first().click();
  await pag.waitForTimeout(300);
  await pag.locator('main button:has-text("Confirmar")').first().click();
  await pag.waitForTimeout(1900);
  d = await dados();
  if ((d.routine || []).filter((b) => b.origem === 'mentoria').length === 6) ok('atualizar na Agenda troca os blocos, sem duplicar');
  else falha('aplicar de novo duplicou: ' + (d.routine || []).filter((b) => b.origem === 'mentoria').length);

  /* Tirar da Agenda tira só o que é da mentoria. */
  await pag.locator('main button:has-text("tirar da Agenda")').first().click();
  await pag.waitForTimeout(1900);
  d = await dados();
  if (!(d.routine || []).some((b) => b.origem === 'mentoria')) ok('"tirar da Agenda" tira os blocos da mentoria');
  else falha('sobraram blocos da mentoria');
  if ((d.routine || []).some((b) => b.id === 'meu-plantao')) ok('e deixa os da pessoa');
  else falha('tirar da Agenda apagou o bloco da pessoa');

  /* ── o checklist do dia ────────────────────────────────────────────── */
  const caixas = pag.locator('main input[type="checkbox"]');
  if (await caixas.count() >= 2) {
    await caixas.first().check();
    await pag.waitForTimeout(1900);
    d = await dados();
    const feitos = d.mentoria && d.mentoria.feitos ? Object.values(d.mentoria.feitos)[0] : null;
    if (Array.isArray(feitos) && feitos.indexOf(0) >= 0) ok('o checklist do dia fica marcado');
    else falha('marcar o checklist não guardou: ' + JSON.stringify(d.mentoria && d.mentoria.feitos));
  } else falha('o checklist do dia não apareceu');

  /* ── voltar depois ─────────────────────────────────────────────────── */
  /* O Chromium do teste, abrindo o site como arquivo local, às vezes
     perde o localStorage inteiro num reload (ver o mesmo relato no
     testar.mjs). Não é o app: a chave já está nula ANTES de qualquer
     código dele rodar. Então guarda o que havia e, se sumir, devolve e
     recarrega — o que se confere continua sendo o app remontar sozinho a
     partir do que está guardado. */
  const guardado = await pag.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
  await pag.reload({ waitUntil: 'load' });
  if (await pag.evaluate(() => localStorage.getItem('cadencia:v3') === null)) {
    await pag.evaluate((g) => { for (const [k, v] of Object.entries(JSON.parse(g))) localStorage.setItem(k, v); }, guardado);
    await pag.reload({ waitUntil: 'load' });
  }
  await pag.waitForTimeout(2200);
  const semConta2 = pag.locator('button:has-text("usar sem conta")');
  if (await semConta2.count() > 0) { await semConta2.first().click(); await pag.waitForTimeout(600); }
  await pag.waitForSelector('main', { timeout: 15000 }).catch(() => undefined);
  /* espera a tela remontar de verdade, em vez de um tempo fixo: com o
     build inteiro rodando em paralelo, 2,2 s às vezes não bastavam */
  await pag.waitForSelector('nav button:has-text("Assistente")', { timeout: 15000 }).catch(() => undefined);
  const aba2 = pag.locator('nav button:has-text("Assistente")');
  if (await aba2.count()) { await aba2.first().click(); }
  await pag.waitForFunction(() => /Seu plano/i.test((document.querySelector('main') || document.body).innerText)
    && /Aqui está o seu plano/.test((document.querySelector('main') || document.body).innerText), null, { timeout: 10000 }).catch(() => undefined);
  t = await texto();
  if (/Seu plano/i.test(t) && /O que ela já sabe de você · 2 de 22/i.test(t)) {
    ok('recarregando, a mentoria volta aberta com o perfil e o plano');
  } else falha('depois de recarregar, a mentoria perdeu o estado: ' + t.slice(0, 400).replace(/\n+/g, ' | '));
  if (/Aqui está o seu plano/.test(t)) ok('e a conversa da entrevista continua neste aparelho');
  else falha('a conversa da entrevista sumiu ao recarregar');
}

if (!errosDaPagina.length) ok('nenhum erro de JavaScript na página durante o caminho todo');
else falha('erros na página: ' + errosDaPagina.slice(0, 3).join(' | '));

await navegador.close();
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
