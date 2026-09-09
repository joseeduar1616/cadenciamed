/* Testa o currículo próprio: substituir o padrão no todo ou só numa área,
 * sem duplicar entre uma leva e outra.
 *
 * Roda contra _curriculo.mjs, a cópia automática de montarCurriculo (do
 * base.jsx) e materiaParaAula/aplicarNoCronogramaProprio (do parte9.jsx) —
 * refeita pelo extrair_curriculo.py a cada build.
 *
 *   node testar-curriculo.mjs
 */
const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

const { montarCurriculo, materiaParaAula, aplicarNoCronogramaProprio } = await import('./_curriculo.mjs');
const { CURSO } = await import('./curriculo.js');

/* ── sem currículo próprio: o padrão continua valendo ────────────────── */
const padrao = montarCurriculo([]);
if (padrao.lista.length === CURSO.length) ok('sem currículo próprio, a lista ativa é o currículo padrão inteiro');
else falha(`tamanho da lista padrão: ${padrao.lista.length}, esperado ${CURSO.length}`);
if (Object.keys(padrao.byId).length === CURSO.length) ok('o índice por id cobre todo o padrão');
else falha('byId do padrão incompleto');
if (montarCurriculo(null).lista.length === CURSO.length) ok('cronogramaProprio nulo também cai no padrão, sem quebrar');
else falha('null não caiu no padrão');
if (montarCurriculo(undefined).lista.length === CURSO.length) ok('cronogramaProprio indefinido também cai no padrão');
else falha('undefined não caiu no padrão');

/* ── materiaParaAula: id nunca bate com o de uma aula padrão ─────────── */
const idsPadrao = new Set(CURSO.map((a) => a.id));
const m1 = materiaParaAula({ area: 'CI', titulo: 'Fraturas', esp: 'Ortopedia', topicos: ['Colles', 'Monteggia'] }, 1);
if (/^pp-/.test(m1.id)) ok('o id de uma aula própria começa com "pp-"');
else falha('id sem o prefixo pp-: ' + m1.id);
if (!idsPadrao.has(m1.id)) ok('o id de uma aula própria nunca bate com o de uma aula padrão');
else falha('colisão de id com o currículo padrão');
if (m1.area === 'CI' && m1.title === 'Fraturas' && m1.esp === 'Ortopedia' && m1.bonus.length === 2) {
  ok('materiaParaAula copia área, título, especialidade e tópicos certos');
} else falha('materiaParaAula: ' + JSON.stringify(m1));

/* ── um envio cobrindo uma área só substitui aquela área ─────────────── */
const materiasCI = [
  { area: 'CI', titulo: 'Fraturas', esp: 'Ortopedia', topicos: [] },
  { area: 'CI', titulo: 'Apendicite', esp: 'Cirurgia geral', topicos: [] },
];
const totalCIPadrao = CURSO.filter((a) => a.area === 'CI').length;
const primeiraLeva = aplicarNoCronogramaProprio([], materiasCI);
if (primeiraLeva.length === 2) ok('primeira leva: só as matérias enviadas entram no currículo próprio');
else falha('primeira leva tamanho: ' + primeiraLeva.length);

const ativoParcial = montarCurriculo(primeiraLeva);
if (ativoParcial.lista.length === CURSO.length - totalCIPadrao + 2) {
  ok('currículo ativo com uma área própria: o resto do padrão continua, só CI foi trocada');
} else falha(`tamanho do ativo parcial: ${ativoParcial.lista.length}, esperado ${CURSO.length - totalCIPadrao + 2}`);
if (ativoParcial.lista.filter((s) => s.area === 'CI').length === 2) {
  ok('só as 2 matérias próprias de CI aparecem, as antigas de CI da área sumiram');
} else falha('CI não foi totalmente substituída: ' + JSON.stringify(ativoParcial.lista.filter((s) => s.area === 'CI')));
if (ativoParcial.lista.some((s) => s.area === 'CL')) ok('outras áreas (ex.: CL) continuam vindo do currículo padrão');
else falha('área CL sumiu sem ter sido enviada');

/* ── um segundo envio, na MESMA área, substitui de novo (não acumula) ── */
const materiasCIv2 = [{ area: 'CI', titulo: 'Colecistite', esp: 'Cirurgia geral', topicos: [] }];
const segundaLeva = aplicarNoCronogramaProprio(primeiraLeva, materiasCIv2);
if (segundaLeva.length === 1 && segundaLeva[0].title === 'Colecistite') {
  ok('reenviar a mesma área substitui de novo, em vez de somar às matérias já lá');
} else falha('segunda leva na mesma área: ' + JSON.stringify(segundaLeva));

/* ── um envio numa área DIFERENTE preserva a anterior (ciclo clínico) ── */
const materiasCL = [{ area: 'CL', titulo: 'Pré-eclâmpsia', esp: 'Obstetrícia', topicos: [] }];
const duasAreas = aplicarNoCronogramaProprio(primeiraLeva, materiasCL);
if (duasAreas.length === 3 && duasAreas.some((s) => s.area === 'CI') && duasAreas.some((s) => s.area === 'CL')) {
  ok('enviar uma área nova (ciclo clínico) preserva o que já tinha sido trocado antes, em outra área');
} else falha('acumulou duas áreas errado: ' + JSON.stringify(duasAreas));

/* ── um envio cobrindo as 5 áreas substitui o currículo inteiro ──────── */
const AREAS_5 = ['CL', 'CI', 'GO', 'PE', 'PR'];
const materiasCompletas = AREAS_5.map((a) => ({ area: a, titulo: `Aula de ${a}`, esp: 'X', topicos: [] }));
const cronogramaInteiro = aplicarNoCronogramaProprio(duasAreas, materiasCompletas);
if (cronogramaInteiro.length === 5) ok('um envio com as 5 áreas troca o currículo inteiro, mesmo o que já existia');
else falha('cronograma inteiro: ' + cronogramaInteiro.length);
const ativoCompleto = montarCurriculo(cronogramaInteiro);
if (ativoCompleto.lista.length === 5) ok('currículo ativo com as 5 áreas próprias não mistura nada do padrão');
else falha('ativo completo misturou padrão: ' + ativoCompleto.lista.length);

console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
