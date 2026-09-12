/* Dados de demonstração para as capturas dos PDFs.
 *
 * O app nasce vazio, e um painel vazio não ensina nada: as capturas do
 * tutorial precisam mostrar barra com altura, revisão vencendo e cartão
 * marcado. Aqui é montada uma conta de mentira, com seis semanas de estudo
 * já registradas, e ela é escrita no localStorage antes da página abrir.
 *
 * Nada disso vai para o site publicado: só é usado por gerar.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

/* o mesmo currículo do app, lido do arquivo de verdade */
export function lerCurso() {
  const s = fs.readFileSync(path.join(RAIZ, 'fonte/curriculo.js'), 'utf8');
  const m = s.match(/export const CURSO\s*=\s*(\[[\s\S]*?\n\];)/);
  if (!m) throw new Error('não achei o CURSO em fonte/curriculo.js');
  // eslint-disable-next-line no-eval
  return eval(m[1].replace(/;$/, ''));
}

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const menos = (base, n) => { const d = new Date(base); d.setDate(d.getDate() - n); return iso(d); };

/* embaralho previsível: a mesma conta de mentira em toda geração */
function aleatorio(semente) {
  let x = semente;
  return () => { x = (x * 1664525 + 1013904223) % 4294967296; return x / 4294967296; };
}

const TIPOS = ['Aula', 'Questões', 'Revisão', 'Apostila', 'Flashcards'];

export function montarDados() {
  const curso = lerCurso();
  const rnd = aleatorio(20260910);
  const hoje = new Date();
  const hojeIso = iso(hoje);

  /* 46 das 90 aulas feitas, com as marcas espalhadas nas cinco áreas para o
     radar de Temas não ficar todo de uma cor só */
  const marks = {};
  const reviews = {};
  const feitas = [];
  curso.forEach((a, i) => {
    if (i % 90 >= 46) return;
    const quando = menos(hoje, 4 + Math.floor(rnd() * 44));
    const perf = [0, 1, 1, 2, 2, 3][Math.floor(rnd() * 6)];
    const bonusDone = {};
    (a.topicos || []).forEach((_, k) => { if (rnd() < 0.62) bonusDone[k] = 1; });
    marks[a.id] = {
      aula: true, qts: rnd() < 0.7, cards: rnd() < 0.4,
      perf, date: quando, bonusDone,
    };
    feitas.push({ id: a.id, area: a.area, quando });
    /* alguns degraus de revisão já batidos, para a escada não nascer toda
       vencida nem toda em branco */
    const done = {};
    if (rnd() < 0.72) done['7'] = menos(hoje, Math.floor(rnd() * 30));
    if (rnd() < 0.42) done['30'] = menos(hoje, Math.floor(rnd() * 16));
    reviews[a.id] = { anchor: quando, done, undone: {} };
  });

  /* seis semanas de sessões, mais densas perto de hoje */
  const sessions = [];
  for (let dia = 0; dia < 44; dia += 1) {
    const data = menos(hoje, dia);
    const quantas = rnd() < 0.16 ? 0 : 1 + Math.floor(rnd() * 3);
    for (let k = 0; k < quantas; k += 1) {
      const alvo = feitas[Math.floor(rnd() * feitas.length)];
      const aula = curso.find((a) => a.id === alvo.id);
      const kind = TIPOS[Math.floor(rnd() * TIPOS.length)];
      const minutes = 25 + Math.floor(rnd() * 85);
      const questions = kind === 'Questões' ? 20 + Math.floor(rnd() * 40) : (rnd() < 0.3 ? 10 + Math.floor(rnd() * 20) : 0);
      const correct = questions ? Math.round(questions * (0.6 + rnd() * 0.32)) : 0;
      sessions.push({
        id: `s${dia}-${k}`, date: data, subjectId: aula.id, area: aula.area,
        topic: aula.titulo, kind, minutes, questions, correct,
        notes: '', createdAt: Date.now() - dia * 86400000,
      });
    }
  }

  /* rotina fixa da semana */
  const routine = [
    { id: 'r1', day: 0, label: 'Internato, enfermaria', type: 'Enfermaria', start: '07:00', end: '12:00' },
    { id: 'r2', day: 0, label: 'Bloco de questões', type: 'Questões', start: '19:00', end: '20:30' },
    { id: 'r3', day: 1, label: 'Internato, enfermaria', type: 'Enfermaria', start: '07:00', end: '12:00' },
    { id: 'r4', day: 1, label: 'Aula do cronograma', type: 'Aula', start: '19:30', end: '21:30' },
    { id: 'r5', day: 2, label: 'Ambulatório', type: 'Enfermaria', start: '07:00', end: '12:00' },
    { id: 'r6', day: 2, label: 'Revisão espaçada', type: 'Estudo', start: '19:00', end: '20:00' },
    { id: 'r7', day: 3, label: 'Internato, enfermaria', type: 'Enfermaria', start: '07:00', end: '12:00' },
    { id: 'r8', day: 3, label: 'Bloco de questões', type: 'Questões', start: '19:00', end: '21:00' },
    { id: 'r9', day: 4, label: 'Plantão', type: 'Plantão', start: '19:00', end: '07:00' },
    { id: 'r10', day: 5, label: 'Estudo longo', type: 'Estudo', start: '09:00', end: '12:30' },
    { id: 'r11', day: 5, label: 'Descanso', type: 'Descanso', start: '14:00', end: '18:00' },
    { id: 'r12', day: 6, label: 'Simulado ou revisão', type: 'Estudo', start: '09:00', end: '12:00' },
  ];

  const agenda = [
    { id: 'a1', date: menos(hoje, -3), label: 'Simulado 4', type: 'Questões', start: '08:00', end: '12:00' },
    { id: 'a2', date: menos(hoje, -10), label: 'Prova do módulo de Cardiologia', type: 'Aula', start: '14:00', end: '17:00' },
  ];

  /* baralhos de flashcards, alguns já vencidos para a aba nascer com fila */
  const CARTOES = [
    ['Clínica', 'Cardiologia', 'Primeira conduta na fibrilação atrial com instabilidade?', 'Cardioversão elétrica sincronizada, imediata.'],
    ['Clínica', 'Cardiologia', 'Tríade da insuficiência cardíaca descompensada', 'Dispneia, congestão e baixo débito.'],
    ['Clínica', 'Nefrologia', 'Critério de KDIGO para lesão renal aguda', 'Creatinina sobe 0,3 mg/dL em 48h, ou 1,5x a basal em 7 dias.'],
    ['Clínica', 'Pneumologia', 'Quando internar uma pneumonia pelo CURB-65?', 'Pontuação 2 ou mais.'],
    ['Cirurgia', 'Trauma', 'Ordem do atendimento inicial ao politraumatizado', 'A, B, C, D, E, na sequência do ATLS.'],
    ['Cirurgia', 'Abdome agudo', 'Sinal de Blumberg indica o quê?', 'Irritação peritoneal.'],
    ['GO', 'Obstetrícia', 'Definição de pré-eclâmpsia grave', 'PA 160x110 ou mais, ou lesão de órgão-alvo.'],
    ['GO', 'Obstetrícia', 'Conduta na eclâmpsia', 'Sulfato de magnésio e estabilização, depois parto.'],
    ['Pediatria', 'Neonatologia', 'Apgar avalia quais cinco itens?', 'Frequência cardíaca, respiração, tônus, irritabilidade e cor.'],
    ['Pediatria', 'Infectologia', 'Sinal clínico clássico do sarampo', 'Manchas de Koplik.'],
    ['Preventiva', 'Epidemiologia', 'Diferença entre incidência e prevalência', 'Incidência conta casos novos; prevalência conta casos existentes.'],
    ['Preventiva', 'Epidemiologia', 'O que mede a sensibilidade de um teste?', 'A chance de dar positivo em quem tem a doença.'],
  ];
  const flash = CARTOES.map((c, i) => ({
    id: `c${i}`, frente: c[2], verso: c[3], subjectId: null,
    baralho: c[1], pasta: c[0],
    criado: menos(hoje, 30 - i),
    prox: i < 5 ? menos(hoje, 1) : menos(hoje, -(1 + i)),
    inter: i < 5 ? 3 : 6 + i, facilidade: 2.5, revisoes: 2 + (i % 4), lapsos: i % 2,
  }));
  const pastas = ['Clínica', 'Cirurgia', 'GO', 'Pediatria', 'Preventiva'];

  const habitLog = {};
  for (let dia = 0; dia < 30; dia += 1) {
    const data = menos(hoje, dia);
    habitLog[data] = { h1: rnd() < 0.7, h2: rnd() < 0.6, h3: rnd() < 0.5 };
  }

  return {
    profile: { name: 'Ana', examDate: menos(hoje, -184), onboarded: true },
    theme: 'dark', layout: 'auto',
    sessions, marks, reviews, routine, agenda,
    tasks: [
      { id: 't1', text: 'Refazer as questões erradas de Nefrologia', done: false },
      { id: 't2', text: 'Montar cartões de arritmias', done: false },
      { id: 't3', text: 'Ler o capítulo de choque', done: true },
    ],
    blocos: {},
    goals: { daily: 180, weekly: 900, questions: 250 },
    pomo: {
      focus: 25, short: 5, long: 15, cycle: 4, modo: 'pomodoro',
      autoNext: true, sound: true, corFoco: '#A182E6', corPausa: '#45C08A', estilo: 'anel',
    },
    pomoLog: [], simulados: {}, provas: [
      { id: 'p1', nome: 'USP 2025', data: menos(hoje, 21), questoes: 100, acertos: 71 },
      { id: 'p2', nome: 'UNIFESP 2025', data: menos(hoje, 45), questoes: 100, acertos: 64 },
    ],
    habits: [
      { id: 'h1', text: '200 questões por semana' },
      { id: 'h2', text: 'Exercício 5x por semana' },
      { id: 'h3', text: 'Dormir antes da meia-noite' },
    ],
    habitLog,
    rever: [{ id: 'v1', text: 'Antibiótico na pneumonia grave', done: false }],
    notes: {}, googleCal: { id: '', ultima: 0, autoSync: false },
    cronograma: { nome: '', texto: '' },
    /* Um ciclo clínico de mentira, para a aba de Ciclo clínico existir
       nas capturas. Só a área CL é substituída, então Matérias continua
       com as outras quatro. */
    cronogramaProprio: [
      { id: 'ciclo-clinica-med', week: 1, area: 'CL', title: 'Enfermaria de Clínica Médica', esp: 'Internato', bonus: ['Visita', 'Evolução', 'Prescrição'] },
      { id: 'ciclo-pronto-socorro', week: 2, area: 'CL', title: 'Pronto-socorro adulto', esp: 'Internato', bonus: ['Dor torácica', 'Dispneia'] },
      { id: 'ciclo-ambulatorio', week: 3, area: 'CL', title: 'Ambulatório de Endocrinologia', esp: 'Internato', bonus: ['Diabetes', 'Tireoide'] },
      { id: 'ciclo-uti', week: 4, area: 'CL', title: 'UTI adulto', esp: 'Internato', bonus: ['Ventilação', 'Sedação'] },
    ],
    cronogramaModo: 'somar',
    anotacoes: {}, mostrarDesempenho: true,
    flash, pastas, baralhoCfg: {},
    hojeIso,
  };
}
