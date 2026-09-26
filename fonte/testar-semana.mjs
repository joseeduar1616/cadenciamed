/* Testa a semana montada a partir do tempo que a pessoa tem.
 *
 * O cronograma que não cabe na semana é abandonado na segunda semana, e o
 * erro aqui é do tipo que não aparece: entrega uma semana com cara de boa,
 * mal repartida, e ninguém percebe olhando.
 *
 *   node testar-semana.mjs
 */
const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

const { montarSemana, notaDaEspecialidade, BLOCO_MINIMO, BLOCO_MAXIMO } =
  await import('./_semana.mjs');

const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex'];
const esp = (nome, extra) => ({ esp: nome, peso: 5, total: 10, feitas: 0, atrasadas: 0, ...extra });

const soma = (s) => s.reduce((a, b) => a + b.minutos, 0);
const porDia = (s) => DIAS.map((d) => s.filter((b) => b.dia === d).reduce((a, b) => a + b.minutos, 0));
const porEsp = (s, nome) => s.filter((b) => b.esp === nome).reduce((a, b) => a + b.minutos, 0);

/* ── o básico ─────────────────────────────────────────────────────────── */
let semana = montarSemana({
  especialidades: [esp('Cardiologia'), esp('Pediatria'), esp('GO')],
  dias: DIAS, minPorDia: 60, maxPorDia: 180, metaSemanal: 600,
});
if (semana.length) ok('a semana sai montada');
else falha('não montou nada');

if (soma(semana) <= 600) ok('e nunca passa da meta semanal');
else falha('passou da meta: ' + soma(semana));

if (porDia(semana).every((m) => m === 0 || m <= 180)) ok('nenhum dia passa do máximo pedido');
else falha('dia acima do máximo: ' + porDia(semana).join(','));

if (semana.every((b) => b.minutos >= BLOCO_MINIMO && b.minutos <= BLOCO_MAXIMO)) {
  ok(`nenhum bloco fica menor que ${BLOCO_MINIMO} min nem maior que ${BLOCO_MAXIMO}`);
} else falha('bloco fora dos limites: ' + semana.map((b) => b.minutos).join(','));

if (semana.every((b) => DIAS.includes(b.dia))) ok('todo bloco cai num dia que a pessoa escolheu');
else falha('bloco em dia não escolhido');

/* ── o peso manda ─────────────────────────────────────────────────────── */
semana = montarSemana({
  especialidades: [esp('Cardiologia', { peso: 10 }), esp('Genética', { peso: 0 })],
  dias: DIAS, minPorDia: 60, maxPorDia: 180, metaSemanal: 600,
});
if (porEsp(semana, 'Cardiologia') > porEsp(semana, 'Genética')) {
  ok(`o que a pessoa marcou como importante recebe mais tempo (${porEsp(semana, 'Cardiologia')} contra ${porEsp(semana, 'Genética')} min)`);
} else falha('o peso não teve efeito');

/* ── o que já acabou sai da conta ─────────────────────────────────────── */
semana = montarSemana({
  especialidades: [esp('Cardiologia'), esp('Pronta', { peso: 10, feitas: 10 })],
  dias: DIAS, minPorDia: 60, maxPorDia: 180, metaSemanal: 600,
});
if (porEsp(semana, 'Pronta') === 0) ok('especialidade terminada não ocupa tempo, nem com peso dez');
else falha('a especialidade pronta recebeu ' + porEsp(semana, 'Pronta'));
if (notaDaEspecialidade({ peso: 10, total: 10, feitas: 10 }) === 0) ok('e a nota dela é zero, e não um número pequeno');
else falha('nota da terminada: ' + notaDaEspecialidade({ peso: 10, total: 10, feitas: 10 }));

/* ── o atraso puxa a fila, sem sequestrar a semana ────────────────────── */
const comAtraso = notaDaEspecialidade(esp('X', { atrasadas: 3 }));
const semAtraso = notaDaEspecialidade(esp('X'));
if (comAtraso > semAtraso) ok('revisão vencida faz a especialidade subir na fila');
else falha('o atraso não mudou nada');
if (comAtraso < semAtraso * 3) ok('mas não a ponto de engolir a semana de quem tem outras dez coisas');
else falha('o atraso pesou demais: ' + comAtraso + ' contra ' + semAtraso);

/* ── pouco tempo ──────────────────────────────────────────────────────── */
semana = montarSemana({
  especialidades: [esp('Cardiologia'), esp('Pediatria')],
  dias: ['sab'], minPorDia: 0, maxPorDia: 120, metaSemanal: 120,
});
if (soma(semana) <= 120 && semana.every((b) => b.dia === 'sab')) {
  ok('quem só tem sábado recebe uma semana só de sábado');
} else falha('um dia só: ' + JSON.stringify(semana));

semana = montarSemana({
  especialidades: [esp('Cardiologia')],
  dias: DIAS, minPorDia: 0, maxPorDia: 60, metaSemanal: 20,
});
if (semana.length === 0) ok('menos tempo do que um bloco útil não vira um toco de estudo');
else falha('montou bloco curto demais: ' + JSON.stringify(semana));

/* ── entradas vazias ou estragadas ────────────────────────────────────── */
if (montarSemana({ especialidades: [], dias: DIAS, metaSemanal: 600 }).length === 0) {
  ok('sem especialidade nenhuma, devolve vazio em vez de estourar');
} else falha('montou algo sem especialidades');
if (montarSemana({ especialidades: [esp('X')], dias: [], metaSemanal: 600 }).length === 0) {
  ok('sem dia escolhido, também');
} else falha('montou algo sem dias');
if (montarSemana({}).length === 0) ok('e sem nada, igualmente');
else falha('montou algo do nada');

const sujo = montarSemana({
  especialidades: [esp('X', { peso: 'abc', total: null, feitas: 'x' })],
  dias: DIAS, minPorDia: 'y', maxPorDia: 180, metaSemanal: 300,
});
if (Array.isArray(sujo) && sujo.every((b) => b.minutos > 0)) {
  ok('dado estragado não vira bloco de zero minuto nem trava a conta');
} else falha('entrada suja: ' + JSON.stringify(sujo));

console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
