/* Testa a escada de revisão que se adapta a cada tópico.
 *
 * A escada fixa — 1-7-30-90 igual para tudo — é o que quase todo aplicativo
 * de revisão faz, e é o que a literatura desaconselha: o intervalo ideal
 * AUMENTA conforme o conteúdo consolida, e algoritmos que estimam a chance
 * de lembrar batem heurísticas fixas com folga.
 *
 * Errar aqui não quebra tela nenhuma. Só faz a pessoa revisar na hora
 * errada por meses, sem nada aparecendo — que é exatamente o tipo de erro
 * que precisa de teste.
 *
 *   node testar-revisao.mjs
 */
const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

const { fatorDoTopico, diasDoTopico, depoisDaRevisao, FATOR_MINIMO, FATOR_MAXIMO } =
  await import('./_revisao.mjs');

const ESCADA = [{ d: 7 }, { d: 30 }, { d: 60 }, { d: 120 }, { d: 180 }];
const HOJE = '2026-09-24';

/* ── sem saber nada do tópico, a escada é a da pessoa ─────────────────── */
let dias = diasDoTopico(ESCADA, {}, 0);
if (JSON.stringify(dias) === JSON.stringify([7, 30, 60, 120, 180])) {
  ok('tópico novo segue a escada escolhida, sem invenção');
} else falha('escada base saiu ' + dias.join(','));

/* ── dificuldade declarada ────────────────────────────────────────────── */
const facil = diasDoTopico(ESCADA, { dificuldade: 0 }, 0);
const dificil = diasDoTopico(ESCADA, { dificuldade: 10 }, 0);
if (facil[0] > 7 && dificil[0] < 7) ok('o que a pessoa achou fácil volta mais tarde; o difícil, mais cedo');
else falha(`fácil=${facil.join(',')} difícil=${dificil.join(',')}`);
if (dificil[dificil.length - 1] < facil[facil.length - 1]) {
  ok('e a diferença cresce ao longo da escada, em vez de sumir no fim');
} else falha('a diferença não se mantém no fim da escada');

/* ── o acerto em questões entra, mas não manda ────────────────────────
 * Ele é sobre a matéria inteira, e não sobre aquele tópico: pode inclinar,
 * não decidir. Um acerto alto não pode transformar um tópico que a pessoa
 * marcou como difícil num tópico fácil. */
const dificilSozinho = fatorDoTopico({ dificuldade: 9 }, 0);
const dificilAcertando = fatorDoTopico({ dificuldade: 9 }, 95);
if (dificilAcertando > dificilSozinho) ok('acertar muito afrouxa um pouco o intervalo');
else falha('o acerto não teve efeito nenhum');
if (dificilAcertando < fatorDoTopico({ dificuldade: 5 }, 0)) {
  ok('mas não o bastante para um tópico difícil virar médio: quem manda é a experiência direta');
} else falha('o acerto em questões passou por cima da dificuldade declarada');

/* ── as revisões corrigem o fator ─────────────────────────────────────── */
let rec = { dificuldade: 5 };
const antes = fatorDoTopico(rec, 0);
rec = depoisDaRevisao(rec, 'facil', HOJE);
if (fatorDoTopico(rec, 0) > antes) ok('revisão fácil afasta a próxima');
else falha('a revisão fácil não afastou nada');

rec = depoisDaRevisao(rec, 'dificil', HOJE);
rec = depoisDaRevisao(rec, 'dificil', HOJE);
if (fatorDoTopico(rec, 0) < antes) ok('duas revisões difíceis aproximam de volta');
else falha('as revisões difíceis não aproximaram');

/* O intervalo tem de CRESCER com acertos seguidos: é o ponto central da
   literatura, e o que uma escada fixa não faz. */
let cresce = { dificuldade: 5 };
const linha = [];
for (let i = 0; i < 4; i++) {
  cresce = depoisDaRevisao(cresce, 'facil', HOJE);
  linha.push(diasDoTopico(ESCADA, cresce, 0)[1]);
}
if (linha[0] < linha[1] && linha[1] < linha[2] && linha[2] < linha[3]) {
  ok('acertos seguidos vão afastando a revisão, degrau após degrau (' + linha.join(' → ') + ' dias)');
} else falha('o intervalo não cresceu com os acertos: ' + linha.join(','));

/* ── errar recomeça, e recomeça HOJE ──────────────────────────────────
 * Adiar para o próximo degrau seria revisar daqui a um mês algo que se
 * perdeu em dois dias. A fase rápida do esquecimento não espera. */
let errou = { dificuldade: 5, anchor: '2026-01-01', done: { 7: '2026-01-08', 30: '2026-02-01' } };
const fatorAntes = fatorDoTopico(errou, 0);
errou = depoisDaRevisao(errou, 'errei', HOJE);
if (errou.anchor === HOJE) ok('errar recomeça a contagem de hoje, e não do dia da aula');
else falha('a âncora não voltou para hoje: ' + errou.anchor);
if (Object.keys(errou.done || {}).length === 0) ok('e os degraus já feitos são zerados, porque o conteúdo voltou a ser novo');
else falha('sobraram degraus marcados depois de errar');
if (fatorDoTopico(errou, 0) < fatorAntes) ok('além de puxar a escada inteira para mais perto');
else falha('errar não aproximou a escada');

/* ── os limites seguram ───────────────────────────────────────────────── */
let teimoso = { dificuldade: 0 };
for (let i = 0; i < 40; i++) teimoso = depoisDaRevisao(teimoso, 'facil', HOJE);
if (fatorDoTopico(teimoso, 100) <= FATOR_MAXIMO) ok('nem cem acertos mandam a revisão para daqui a dez anos');
else falha('o fator estourou: ' + fatorDoTopico(teimoso, 100));

let sofrido = { dificuldade: 10 };
for (let i = 0; i < 40; i++) sofrido = depoisDaRevisao(sofrido, 'errei', HOJE);
const apertado = diasDoTopico(ESCADA, sofrido, 0);
if (fatorDoTopico(sofrido, 0) >= FATOR_MINIMO && apertado[0] >= 1) {
  ok('e nem quarenta erros fazem a revisão cair para hoje de novo, sem fim');
} else falha('o fator furou o piso: ' + fatorDoTopico(sofrido, 0));

/* ── dois degraus nunca caem no mesmo dia ─────────────────────────────
 * Aconteceria com um fator pequeno numa escada apertada, e a pessoa veria
 * duas revisões do mesmo conteúdo no mesmo dia. */
const apertadaDemais = diasDoTopico([{ d: 1 }, { d: 2 }, { d: 3 }, { d: 4 }], { dificuldade: 10 }, 0);
const repetido = apertadaDemais.some((d, i) => i > 0 && d <= apertadaDemais[i - 1]);
if (!repetido) ok('degraus nunca colidem no mesmo dia (' + apertadaDemais.join(', ') + ')');
else falha('degraus colidiram: ' + apertadaDemais.join(','));

/* ── lixo na entrada não vira escada quebrada ─────────────────────────── */
const sujo = diasDoTopico(ESCADA, { dificuldade: 'abc', facilidade: null }, 'x');
if (JSON.stringify(sujo) === JSON.stringify([7, 30, 60, 120, 180])) {
  ok('dado estragado no disco cai na escada base, em vez de quebrar');
} else falha('entrada suja: ' + sujo.join(','));
if (diasDoTopico(null, null, null).length === 0) ok('sem escada nenhuma, devolve lista vazia sem estourar');
else falha('escada nula não deu lista vazia');

console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
