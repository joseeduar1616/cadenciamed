/* Testa a ficha de estudo de cada tópico.
 *
 * Tempo, acertos e dificuldade moravam em três abas diferentes, e a conta
 * que juntava os três era feita de cabeça — quer dizer, não era feita.
 *
 * Errar aqui não quebra tela nenhuma, e é esse o problema: a ficha mostra
 * 80% de acerto onde havia 40, a pessoa confia, para de revisar o que
 * estava fraco, e só descobre na prova.
 *
 *   node testar-ficha.mjs
 */
const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

const {
  somarEstudo, aproveitamento, dificuldadeSugerida, lerRegistro,
  fichaDoTopico, fazQuantoTempo, diasDesde, perfDeAproveitamento, fraseDoDia,
  MAX_MIN_REGISTRO, MAX_QUESTOES_REGISTRO,
} = await import('./_ficha.mjs');

const HOJE = '2026-09-24';
const ID = 'aula-ic';

const SESSOES = [
  { subjectId: ID,      date: '2026-09-01', minutes: 50, questions: 20, correct: 12 },
  { subjectId: ID,      date: '2026-09-20', minutes: 35, questions: 10, correct: 9 },
  { subjectId: 'outra', date: '2026-09-23', minutes: 90, questions: 40, correct: 10 },
  { subjectId: ID,      date: '2026-09-10', minutes: 25 },
];

/* ── a soma é só daquele tópico ───────────────────────────────────────
 * O erro que mais importa: somar as questões da matéria vizinha e mostrar
 * um aproveitamento que não é daquele conteúdo. */
let s = somarEstudo(SESSOES, ID);
if (s.minutos === 110 && s.sessoes === 3) ok('soma o tempo só dos registros daquele tópico');
else falha(`minutos=${s.minutos} sessões=${s.sessoes}`);
if (s.questoes === 30 && s.acertos === 21) ok('e as questões e os acertos também');
else falha(`questões=${s.questoes} acertos=${s.acertos}`);
if (s.ultima === '2026-09-20') ok('a última vez é a data mais recente, e não a última da lista');
else falha('última: ' + s.ultima);

if (somarEstudo(SESSOES, '').sessoes === 0) ok('sem id de tópico, a soma é zero em vez de somar tudo');
else falha('soma sem id trouxe registros');
if (somarEstudo(null, ID).minutos === 0) ok('lista ausente não estoura');
else falha('lista nula quebrou');

/* Registro estragado no disco não pode virar elogio: 90 acertos em 20
   questões daria 450% de aproveitamento. */
s = somarEstudo([{ subjectId: ID, date: HOJE, questions: 20, correct: 90 }], ID);
if (s.acertos === 20) ok('acerto maior que o total de questões é aparado no total');
else falha('acertos: ' + s.acertos);

/* ── aproveitamento ───────────────────────────────────────────────────
 * Zero por cento é alerta; nenhuma questão feita é folha em branco. As duas
 * coisas não podem aparecer iguais na tela. */
if (aproveitamento(30, 21) === 70) ok('aproveitamento em porcentagem redonda');
else falha('70%: ' + aproveitamento(30, 21));
if (aproveitamento(0, 0) === null) ok('sem questão nenhuma, o aproveitamento é nada — e não zero');
else falha('sem questões deu ' + aproveitamento(0, 0));
if (aproveitamento(10, 0) === 0) ok('e dez erradas em dez dá zero de verdade');
else falha('zero: ' + aproveitamento(10, 0));
if (aproveitamento(10, 40) === 100) ok('acerto impossível não passa de cem por cento');
else falha('estourou: ' + aproveitamento(10, 40));

/* ── a dificuldade sugerida é sugestão ────────────────────────────────
 * Ela existe só para o controle não começar às cegas no meio. Quem manda é
 * o que a pessoa declarou, e o teste da escada (testar-revisao.mjs) é que
 * garante isso do outro lado. */
if (dificuldadeSugerida(100) === 0) ok('acerto perfeito sugere dificuldade zero');
else falha('100%: ' + dificuldadeSugerida(100));
if (dificuldadeSugerida(40) === 10 && dificuldadeSugerida(10) === 10) {
  ok('acerto baixo sugere o topo da dificuldade, e não passa dele');
} else falha(`40%=${dificuldadeSugerida(40)} 10%=${dificuldadeSugerida(10)}`);
if (dificuldadeSugerida(70) > 0 && dificuldadeSugerida(70) < 10) ok('e no meio fica no meio');
else falha('70%: ' + dificuldadeSugerida(70));
if (dificuldadeSugerida(null) === null) ok('sem acerto medido, não há sugestão nenhuma');
else falha('sugeriu sem dado: ' + dificuldadeSugerida(null));

/* ── o formulário de registro ─────────────────────────────────────────
 * É a única porta por onde entra número digitado à mão. Um registro de 90
 * acertos em 20 questões contamina a média da matéria para sempre, e não há
 * tela onde a pessoa veja isso para corrigir depois. */
let r = lerRegistro({ minutos: '50', questoes: '20', acertos: '14', comoFoi: 'ok' });
if (r.ok && r.minutos === 50 && r.questoes === 20 && r.acertos === 14) ok('registro bom passa, com os números virando número');
else falha('registro bom: ' + JSON.stringify(r));

r = lerRegistro({ minutos: 30, questoes: 20, acertos: 90 });
if (!r.ok && /não podem passar/.test(r.erro)) ok('mais acertos que questões é recusado, com o motivo dito');
else falha('acertos demais: ' + JSON.stringify(r));

r = lerRegistro({ minutos: '', questoes: '', acertos: '' });
if (!r.ok && /pelo menos/.test(r.erro)) ok('registro vazio não cria linha em branco no histórico');
else falha('registro vazio: ' + JSON.stringify(r));

r = lerRegistro({ minutos: 40, questoes: '' });
if (r.ok && r.questoes === 0 && r.acertos === 0) ok('só tempo, sem questão, é um registro válido');
else falha('só tempo: ' + JSON.stringify(r));

r = lerRegistro({ minutos: '', questoes: 12, acertos: 9 });
if (r.ok && r.minutos === 0) ok('e só questões, sem tempo, também');
else falha('só questões: ' + JSON.stringify(r));

r = lerRegistro({ minutos: MAX_MIN_REGISTRO + 1 });
if (!r.ok) ok('mais minutos do que um dia tem é recusado');
else falha('aceitou ' + (MAX_MIN_REGISTRO + 1) + ' minutos');
r = lerRegistro({ questoes: MAX_QUESTOES_REGISTRO + 1 });
if (!r.ok) ok('e mil questões num registro só, também');
else falha('aceitou questões demais');
r = lerRegistro({ minutos: -30 });
if (!r.ok) ok('tempo negativo não vira desconto no total da semana');
else falha('aceitou minutos negativos');
r = lerRegistro({ minutos: 'quarenta' });
if (!r.ok) ok('texto no lugar do número é recusado, em vez de virar NaN no total');
else falha('aceitou texto como minutos');
r = lerRegistro({ minutos: 40, comoFoi: 'maravilhoso' });
if (r.ok && r.comoFoi === '') ok('resposta desconhecida no "como foi" é descartada, sem travar o registro');
else falha('comoFoi inventado: ' + JSON.stringify(r));

/* ── a ficha inteira ──────────────────────────────────────────────────── */
const REC = { dificuldade: 8, done: { 7: '2026-09-08', 30: '2026-09-22' }, ultimaRevisao: '2026-09-22' };
let f = fichaDoTopico(ID, SESSOES, REC, HOJE);
if (f.minutos === 110 && f.questoes === 30 && f.aproveitamento === 70 && f.dificuldade === 8) {
  ok('a ficha traz tempo, questões, aproveitamento e dificuldade num lugar só');
} else falha('ficha: ' + JSON.stringify(f));
if (f.revisoes === 2 && f.ultimaRevisao === '2026-09-22') ok('e quantas revisões já foram feitas, e quando foi a última');
else falha(`revisões=${f.revisoes} última=${f.ultimaRevisao}`);
if (f.diasSemEstudar === 4) ok('mais quantos dias faz desde o último registro');
else falha('dias sem estudar: ' + f.diasSemEstudar);

/* A declarada tem de ganhar da sugerida. O aproveitamento é de 70%, que
   sugeriria dificuldade 5; a pessoa disse 8. Vale 8. */
if (f.usada === 8 && f.sugerida === 5) ok('o que a pessoa declarou ganha da sugestão do acerto');
else falha(`usada=${f.usada} sugerida=${f.sugerida}`);

/* Sem nada declarado, a sugestão entra — mas só aí. */
f = fichaDoTopico(ID, SESSOES, {}, HOJE);
if (f.dificuldade === null && f.usada === 5) ok('sem dificuldade declarada, o acerto medido serve de palpite');
else falha('sem declarada: ' + JSON.stringify({ d: f.dificuldade, u: f.usada }));

/* E sem nada de nada, a ficha não inventa: escada base para conteúdo novo. */
f = fichaDoTopico('aula-nova', SESSOES, {}, HOJE);
if (f.usada === null && f.aproveitamento === null && f.minutos === 0) {
  ok('tópico nunca estudado não recebe nota inventada');
} else falha('tópico novo: ' + JSON.stringify(f));
if (f.quando === 'nunca registrado') ok('e a ficha diz isso em palavras, em vez de mostrar zeros');
else falha('quando: ' + f.quando);

/* Dificuldade estragada no disco é ignorada, não virada em número. */
f = fichaDoTopico(ID, SESSOES, { dificuldade: 'muito' }, HOJE);
if (f.dificuldade === null) ok('dificuldade ilegível no arquivo salvo é ignorada');
else falha('dificuldade suja: ' + f.dificuldade);
f = fichaDoTopico(ID, SESSOES, { dificuldade: 99 }, HOJE);
if (f.dificuldade === null) ok('e dificuldade fora da escala, também');
else falha('dificuldade 99 passou: ' + f.dificuldade);

/* ── a faixa de desempenho que o acerto medido corresponde ───────────
 * A pessoa escolhe essa faixa à mão numa lista, e ela entra na escada de
 * revisão. Uma faixa escolhida em março, com trinta questões feitas desde
 * então, empurra as revisões para o lugar errado sem nada discordando dela
 * na tela — por isso a ficha compara as duas. */
if (perfDeAproveitamento(85) === 1) ok('80% ou mais cai na faixa de cima');
else falha('85%: ' + perfDeAproveitamento(85));
if (perfDeAproveitamento(80) === 1 && perfDeAproveitamento(79) === 2) ok('e a borda dos 80 fica do lado certo');
else falha(`80=${perfDeAproveitamento(80)} 79=${perfDeAproveitamento(79)}`);
if (perfDeAproveitamento(61) === 2 && perfDeAproveitamento(60) === 3) ok('a dos 60, também');
else falha(`61=${perfDeAproveitamento(61)} 60=${perfDeAproveitamento(60)}`);
if (perfDeAproveitamento(null) === 0) ok('sem questão medida, a faixa é "não classificado" em vez de a pior');
else falha('sem medida: ' + perfDeAproveitamento(null));

/* ── quanto tempo faz, em palavras ────────────────────────────────────
 * "38 dias sem tocar nisso" muda o que a pessoa faz hoje. "18/08" não. */
if (fazQuantoTempo(HOJE, HOJE) === 'registrado hoje') ok('hoje é "hoje"');
else falha('hoje: ' + fazQuantoTempo(HOJE, HOJE));
if (fazQuantoTempo('2026-09-23', HOJE) === 'registrado ontem') ok('ontem é "ontem"');
else falha('ontem: ' + fazQuantoTempo('2026-09-23', HOJE));
if (/dias/.test(fazQuantoTempo('2026-09-21', HOJE))) ok('poucos dias vêm em dias');
else falha('3 dias: ' + fazQuantoTempo('2026-09-21', HOJE));
if (/semanas/.test(fazQuantoTempo('2026-09-04', HOJE))) ok('algumas semanas vêm em semanas');
else falha('20 dias: ' + fazQuantoTempo('2026-09-04', HOJE));
if (/mês|meses/.test(fazQuantoTempo('2026-06-24', HOJE))) ok('e meses em meses');
else falha('3 meses: ' + fazQuantoTempo('2026-06-24', HOJE));
if (fazQuantoTempo('', HOJE) === 'nunca registrado') ok('sem data, diz que nunca houve');
else falha('sem data: ' + fazQuantoTempo('', HOJE));

/* Data ilegível no arquivo salvo não pode virar "NaN dias sem registrar" na
   tela, nem estourar a linha da matéria. */
if (diasDesde('ontem', HOJE) === null) ok('data ilegível devolve nada, em vez de NaN');
else falha('data ilegível: ' + diasDesde('ontem', HOJE));
if (fazQuantoTempo('ontem', HOJE) === '') ok('e a frase sai vazia, sem NaN na tela');
else falha('frase com data ilegível: ' + fazQuantoTempo('ontem', HOJE));

/* ── a frase que vai na notificação ──────────────────────────────────
 * Este texto chega na tela de bloqueio do celular de outra pessoa, com o
 * site fechado. Um erro aqui não aparece em nenhuma tela daqui — aparece lá.
 */
if (fraseDoDia({ atrasadas: 3 }) === '3 revisões atrasadas.') ok('o atraso vira frase com a palavra, e não um número solto');
else falha('atrasadas: ' + fraseDoDia({ atrasadas: 3 }));
if (fraseDoDia({ atrasadas: 1 }) === '1 revisão atrasada.') ok('e no singular concorda');
else falha('singular: ' + fraseDoDia({ atrasadas: 1 }));

/* Nada pendente tem de dar frase VAZIA: um "você não tem nada hoje" diário
   é o aviso que faz a pessoa desligar os lembretes na segunda semana. */
for (const [nome, e] of [
  ['tudo zerado', { atrasadas: 0, cartoes: 0, blocos: [] }],
  ['sem nada informado', {}],
  ['argumento nenhum', undefined],
  ['números estragados', { atrasadas: 'três', cartoes: null, blocos: 'nenhum' }],
  ['números negativos', { atrasadas: -5, cartoes: -1 }],
]) {
  if (fraseDoDia(e) === '') ok(`${nome} não gera notificação nenhuma`);
  else falha(`${nome} gerou: ` + fraseDoDia(e));
}

const duas = fraseDoDia({ atrasadas: 2, cartoes: 40 });
if (duas === '2 revisões atrasadas e 40 cartões para revisar.') ok('duas pendências ligadas por "e"');
else falha('duas: ' + duas);

const tres = fraseDoDia({ atrasadas: 2, cartoes: 40, blocos: [{ start: '19:00' }, { start: '07:30' }] });
if (/^2 revisões atrasadas, 40 cartões para revisar e 2 blocos na agenda, o primeiro às 07:30\.$/.test(tres)) {
  ok('três pendências viram lista, e o bloco citado é o mais cedo do dia');
} else falha('três: ' + tres);

if (/^Um bloco na agenda, o primeiro às 06:00\.$/.test(fraseDoDia({ blocos: [{ start: '06:00' }] }))) {
  ok('um bloco só é "um bloco", sem número');
} else falha('um bloco: ' + fraseDoDia({ blocos: [{ start: '06:00' }] }));

/* Bloco sem horário no arquivo salvo não pode virar "às undefined". */
if (fraseDoDia({ blocos: [{ label: 'sem hora' }] }) === '') ok('bloco sem horário é ignorado, em vez de virar "às undefined"');
else falha('bloco sem hora: ' + fraseDoDia({ blocos: [{ label: 'sem hora' }] }));

/* O texto cabe numa notificação: acima de ~160 caracteres o sistema corta
   no meio da palavra. */
const cheia = fraseDoDia({ atrasadas: 99, cartoes: 999, blocos: Array.from({ length: 12 }, (_, i) => ({ start: '0' + (i % 10) + ':00' })) });
if (cheia.length <= 160) ok('mesmo no pior dia a frase cabe na notificação (' + cheia.length + ' caracteres)');
else falha('frase longa demais: ' + cheia.length);

console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
