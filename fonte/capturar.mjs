/* Tira uma foto de cada aba do app, no computador e no celular.
 *
 * Usa o teste.html, que é o mesmo app com o plano e o modo dono ligados —
 * é o único jeito de fotografar as abas pagas sem uma conta de verdade.
 * As chamadas ao servidor são respondidas aqui mesmo, com dados de
 * demonstração, para as telas que dependem de rede não saírem vazias.
 *
 * O teste.html é feito pelo montar_teste.py, que o ./montar.sh já roda.
 *
 *   python3 montar_teste.py
 *   node capturar.mjs teste.html ../divulgacao
 *
 * O terceiro argumento é opcional: um JSON com outros dados de estudo, no
 * formato da chave "cadencia:v3" do navegador. Sem ele, vale o histórico
 * de demonstração montado aqui embaixo.
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const alvo = path.resolve(process.argv[2]);
const saida = path.resolve(process.argv[3]);
if (!fs.existsSync(alvo)) { console.error('não achei', alvo); process.exit(1); }
fs.mkdirSync(saida, { recursive: true });

const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/* Histórico de estudo de demonstração.
 *
 * Uma conta recém-criada não tem o que mostrar: Desempenho, Progresso e
 * Metas saem com gráfico vazio, e gráfico vazio não divulga nada. Então o
 * app encontra estes dados já gravados quando sobe.
 *
 * É montado a partir do currículo de verdade, para as matérias das fotos
 * serem as que existem no site, e com ritmo de quem estuda mesmo: dias
 * cheios, dias fracos e domingos em branco. Um histórico redondo demais
 * (três horas todo santo dia) denuncia que é falso.
 *
 * Passe um JSON como quarto argumento para usar outro no lugar deste.
 */
async function dadosDeDemonstracao() {
  const { CURSO } = await import('./curriculo.js');
  const dia = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  const TIPOS = ['Aula', 'Apostila', 'Questões', 'Revisão', 'Flashcards'];

  const sessions = [];
  for (let d = 62; d >= 0; d--) {
    const data = dia(d);
    const domingo = new Date(data + 'T12:00:00').getDay() === 0;
    if (domingo && d % 14 < 7) continue;            // dois domingos por mês em branco
    const blocos = domingo ? 1 : 2 + (d % 3 === 0 ? 1 : 0);
    for (let b = 0; b < blocos; b++) {
      const aula = CURSO[(d * 3 + b) % CURSO.length];
      const tipo = TIPOS[(d + b) % TIPOS.length];
      const q = tipo === 'Questões' ? 25 + ((d + b) % 30) : (b === 0 ? 10 + (d % 12) : 0);
      sessions.push({
        id: `s${d}-${b}`, date: data, subjectId: aula.id, area: aula.area,
        topic: aula.titulo, kind: tipo,
        minutes: 35 + ((d * 7 + b * 13) % 60),
        questions: q, correct: Math.round(q * (0.62 + ((d % 9) / 40))),
        notes: '',
      });
    }
  }

  const marks = {};
  CURSO.slice(0, 34).forEach((a, i) => {
    marks[a.id] = {
      aula: true, qts: i % 5 !== 3, cards: i % 3 !== 2,
      perf: 58 + ((i * 11) % 34), date: dia(Math.round(62 - i * 1.7)), bonusDone: {},
    };
  });

  const prova = new Date();
  prova.setMonth(prova.getMonth() + 4);

  return JSON.stringify({
    profile: { name: 'José Eduardo', apelido: 'Zé', foto: '', examDate: prova.toISOString().slice(0, 10), onboarded: true },
    theme: 'dark', layout: 'auto',
    sessions, marks, reviews: {}, routine: [], agenda: [], tasks: [], blocos: {},
    goals: { daily: 180, weekly: 900, questions: 350 },
    pomoLog: Array.from({ length: 48 }, (_, i) => ({ date: dia(i % 21), minutes: 25 })),
    simulados: {}, provas: [], mostrarDesempenho: true, flash: [], pastas: [],
  });
}

const DADOS = process.argv[4] && fs.existsSync(process.argv[4])
  ? fs.readFileSync(process.argv[4], 'utf8')
  : await dadosDeDemonstracao();

/* As abas, na ordem em que a barra as mostra agora. O primeiro grupo é o
   que interessa para divulgação: é o que a pessoa abre todo dia. */
const ABAS = [
  { id: 'foco',        botao: 'Foco',          nome: '01-foco' },
  { id: 'cronograma',  botao: 'Cronograma',    nome: '02-cronograma' },
  { id: 'cartoes',     botao: 'Cartões',       nome: '03-cartoes' },
  { id: 'assistente',  botao: 'Assistente',    nome: '04-assistente' },
  { id: 'rotina',      botao: 'Agenda',        nome: '05-agenda' },
  { id: 'amigos',      botao: 'Amigos',        nome: '06-amigos' },
  { id: 'hoje',        botao: 'Hoje',          nome: '07-hoje' },
  { id: 'materias',    botao: 'Matérias',      nome: '08-materias' },
  { id: 'temas',       botao: 'Temas',         nome: '10-temas' },
  { id: 'revisoes',    botao: 'Revisões',      nome: '11-revisoes' },
  { id: 'provas',      botao: 'Provas',        nome: '12-provas' },
  { id: 'desempenho',  botao: 'Desempenho',    nome: '13-desempenho' },
  { id: 'progresso',   botao: 'Progresso',     nome: '14-progresso' },
  { id: 'metas',       botao: 'Metas',         nome: '15-metas' },
  { id: 'simulados',   botao: 'Simulados',     nome: '16-simulados' },
  { id: 'treino',      botao: 'Treino',        nome: '17-treino' },
  { id: 'planos',      botao: 'Plano|Assinar', nome: '18-plano' },
  { id: 'config',      botao: 'Configurações', nome: '19-configuracoes' },
];

const TELAS = [
  { rotulo: 'pc',      viewport: { width: 1440, height: 900 }, escala: 2, movel: false, inteira: true },
  { rotulo: 'celular', viewport: { width: 390, height: 844 },  escala: 3, movel: true,  inteira: false },
];

/* Dados de demonstração para as rotas do servidor. Sem isso a sala de
   amigos aparece vazia, que é justamente a tela que mais vende o produto. */
const AGORA = Date.now();
const SALA = {
  ok: true,
  salas: [{ id: 'residencia26', nome: 'Residência 2026', membros: 6 }],
  sala: {
    id: 'residencia26', nome: 'Residência 2026', dono: 'voce',
    ranking: [
      { uid: 'u1', nome: 'Marina R.',   minutos: 1420, questoes: 980, acertos: 742, estudando: true,  desde: AGORA - 41 * 60000 },
      { uid: 'u0', nome: 'José Eduardo', minutos: 1265, questoes: 874, acertos: 690, estudando: true,  desde: AGORA - 26 * 60000, eu: true },
      { uid: 'u2', nome: 'Caio F.',     minutos: 1108, questoes: 812, acertos: 601, estudando: false },
      { uid: 'u3', nome: 'Letícia A.',  minutos: 940,  questoes: 733, acertos: 559, estudando: true,  desde: AGORA - 8 * 60000 },
      { uid: 'u4', nome: 'Rafael M.',   minutos: 725,  questoes: 512, acertos: 366, estudando: false },
      { uid: 'u5', nome: 'Bia L.',      minutos: 610,  questoes: 488, acertos: 351, estudando: false },
    ],
    mensagens: [
      { uid: 'u2', nome: 'Caio F.',  texto: 'alguém já fechou o bloco de cardio?', em: AGORA - 52 * 60000 },
      { uid: 'u1', nome: 'Marina R.', texto: 'fechei ontem, as questões de arritmia são as piores', em: AGORA - 44 * 60000 },
      { uid: 'u3', nome: 'Letícia A.', texto: 'bora duelo depois do plantão?', em: AGORA - 11 * 60000 },
    ],
  },
  baralhos: [],
};

const navegador = await chromium.launch({
  args: ['--no-sandbox'],
  ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}),
});

const feitas = [];
const faltaram = [];

for (const tela of TELAS) {
  const ctx = await navegador.newContext({
    viewport: tela.viewport,
    deviceScaleFactor: tela.escala,
    isMobile: tela.movel,
    hasTouch: tela.movel,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });
  const pag = await ctx.newPage();

  await pag.route('**/api/**', (rota) => {
    const url = rota.request().url();
    const corpo = /salas/.test(url) ? JSON.stringify(SALA)
      : /plano/.test(url) ? JSON.stringify({ ok: true, pro: true, plano: 'anual', validoAte: AGORA + 300 * 86400000 })
      : '{"ok":true}';
    rota.fulfill({ status: 200, contentType: 'application/json', body: corpo });
  });

  /* Histórico de estudo de demonstração, gravado antes de o app subir: as
     telas de desempenho, progresso e metas não têm o que mostrar numa
     conta recém-criada, e uma foto de gráfico vazio não divulga nada. */
  if (DADOS) {
    await pag.addInitScript(([chave, valor]) => {
      try { window.localStorage.setItem(chave, valor); } catch (e) { /* sem storage, segue */ }
    }, ['cadencia:v3', DADOS]);
  }

  await pag.goto('file://' + alvo, { waitUntil: 'load' });
  await pag.waitForTimeout(2400);

  /* Passa pelas boas-vindas: sem rede o Firebase não sobe, e o app oferece
     a entrada pelo nome — que é o caminho que serve aqui. */
  const semConta = pag.locator('button:has-text("usar sem conta")');
  if (await semConta.count() > 0) { await semConta.first().click(); await pag.waitForTimeout(500); }
  const campoNome = pag.locator('input[placeholder="Seu nome"]');
  if (await campoNome.count() > 0) {
    await campoNome.fill('José Eduardo');
    await pag.locator('button:has-text("Começar")').first().click();
    await pag.waitForTimeout(1400);
  }

  /* Fecha o passo a passo de boas-vindas, se ele aparecer: ele cobre a
     tela e é a primeira coisa que estraga uma foto de divulgação. */
  for (const rotulo of ['Entendi', 'Fechar', 'Pular', 'Começar a usar']) {
    const b = pag.locator(`button:has-text("${rotulo}")`).first();
    if (await b.count() > 0 && await b.isVisible().catch(() => false)) {
      await b.click().catch(() => {});
      await pag.waitForTimeout(400);
    }
  }

  const abrir = async (botoes) => {
    for (const nome of String(botoes).split('|')) {
      const b = pag.locator(`nav button:has-text("${nome}")`).first();
      if (await b.count() === 0) continue;
      try { await b.click({ timeout: 6000 }); } catch (e) { continue; }
      await pag.waitForTimeout(900);
      return true;
    }
    return false;
  };

  for (const aba of ABAS) {
    /* No celular a barra é uma gaveta: precisa ser aberta antes de cada
       troca de aba, e ela se fecha sozinha ao escolher. */
    if (tela.movel) {
      const menu = pag.locator('button[aria-label="Abrir menu"]').first();
      if (await menu.count() > 0 && await menu.isVisible().catch(() => false)) {
        await menu.click().catch(() => {});
        await pag.waitForTimeout(600);
      }
    }
    if (!(await abrir(aba.botao))) {
      faltaram.push(`${aba.nome} (${tela.rotulo})`);
      if (tela.movel) await pag.keyboard.press('Escape').catch(() => {});
      continue;
    }
    await pag.waitForTimeout(700);
    const arquivo = path.join(saida, `${aba.nome}-${tela.rotulo}.png`);
    await pag.screenshot({ path: arquivo, fullPage: !!tela.inteira });
    feitas.push(path.basename(arquivo));
  }

  await ctx.close();
}

await navegador.close();
console.log(`${feitas.length} imagens em ${saida}`);
if (faltaram.length) console.log('não abriram: ' + faltaram.join(', '));
