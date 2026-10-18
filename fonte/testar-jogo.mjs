/* Modo jogo do estudo interativo · a lógica pura (parte38.jsx).
 *
 * Confere: a correção de cada tipo de exercício; errar tira uma vida, zera
 * o combo e põe o exercício de volta no fim (até duas vezes); acertar o que
 * já tinha errado não conta "de primeira"; sem vidas, a lição acaba; o XP
 * da lição; a ofensiva (hoje sem lição ainda não quebra; um dia em branco
 * quebra; virada de mês e de ano); a limpeza do que vem da conta; o que
 * vira flashcard; e qual lição da trilha abre.
 *
 *   python3 extrair_jogo.py && node testar-jogo.mjs
 */
import * as J from './_jogo.mjs';

const erros = [];
const ok = (m) => console.log('ok   ' + m);
const falha = (m) => { console.log('FALHA ' + m); erros.push(m); };
const igual = (a, b, m) => (JSON.stringify(a) === JSON.stringify(b) ? ok(m) : falha(`${m}: veio ${JSON.stringify(a)}, esperado ${JSON.stringify(b)}`));

/* ── correção ────────────────────────────────────────────────────────── */
const escolha = { tipo: 'escolha', pergunta: 'Droga de escolha?', opcoes: ['A', 'B', 'C'], certa: 2, explicacao: 'porque sim' };
const vf = { tipo: 'vf', afirmacao: 'FE abaixo de 40% é reduzida', verdadeiro: true, explicacao: '' };
const lacuna = { tipo: 'lacuna', frase: 'A FE reduzida é abaixo de ___.', opcoes: ['40%', '70%'], certa: 0, explicacao: 'x' };
const ordem = { tipo: 'ordem', titulo: 'Ordem do atendimento', passos: ['A', 'B', 'C'], explicacao: '' };
const pares = { tipo: 'pares', titulo: 'Ligue', pares: [{ a: 'IECA', b: 'tosse' }, { a: 'BB', b: 'bradicardia' }, { a: 'Diurético', b: 'hipocalemia' }], explicacao: '' };
igual([J.conferirExercicio(escolha, 2), J.conferirExercicio(escolha, 0), J.conferirExercicio(escolha, null)], [true, false, false], 'múltipla escolha: só o índice certo');
igual([J.conferirExercicio(vf, true), J.conferirExercicio(vf, false)], [true, false], 'verdadeiro ou falso');
igual([J.conferirExercicio(lacuna, 0), J.conferirExercicio(lacuna, 1)], [true, false], 'lacuna');
igual([J.conferirExercicio(ordem, [0, 1, 2]), J.conferirExercicio(ordem, [1, 0, 2]), J.conferirExercicio(ordem, [0, 1])], [true, false, false], 'ordem: só a sequência inteira e certa');
igual([J.conferirExercicio(pares, 0), J.conferirExercicio(pares, 2)], [true, false], 'pares: certo só sem ligação errada');
igual(J.conferirExercicio({ tipo: 'ensina', titulo: 'x' }, null), true, 'cartão de ensinar não é corrigido');
igual(J.respostaCertaDoJogo(lacuna), 'A FE reduzida é abaixo de 40%.', 'a resposta certa da lacuna vem com a frase completa');
if (!/—|–/.test(J.respostaCertaDoJogo(pares) + J.respostaCertaDoJogo(ordem))) ok('resposta certa sem travessão');
else falha('resposta certa com travessão');

/* ── a partida ───────────────────────────────────────────────────────── */
let p = J.novaPartida(3);
igual([p.fila, p.vidas, p.pos], [[0, 1, 2], J.VIDAS_JOGO, 0], 'partida nova: fila na ordem e vidas cheias');
p = J.depoisDaResposta(p, 0, true);
p = J.depoisDaResposta(p, 1, false);
igual([p.vidas, p.combo, p.fila, p.dePrimeira], [J.VIDAS_JOGO - 1, 0, [0, 1, 2, 1], 1], 'errar: tira uma vida, zera o combo e o exercício volta no fim');
p = J.depoisDaResposta(p, 2, true);
p = J.depoisDaResposta(p, 1, true);
igual([p.dePrimeira, p.maiorCombo, J.partidaAcabou(p)], [2, 2, true], 'o que já errou não conta de primeira, e a lição acaba no fim da fila');
let q = J.novaPartida(1);
q = J.depoisDaResposta(q, 0, false); q = J.depoisDaResposta(q, 0, false); q = J.depoisDaResposta(q, 0, false);
igual(q.fila.length, 3, 'o mesmo exercício volta no máximo duas vezes');
let r = J.novaPartida(10);
for (let i = 0; i < J.VIDAS_JOGO; i += 1) r = J.depoisDaResposta(r, i, false);
igual([r.vidas, J.partidaAcabou(r)], [0, true], 'sem vidas, a lição acaba');
igual(J.pularNaPartida(J.novaPartida(2)).combo, 0, 'pular o cartão de ensinar não mexe no combo');

/* ── XP e ofensiva ───────────────────────────────────────────────────── */
igual(J.xpDaLicao({ dePrimeira: 8, maiorCombo: 10, perfeita: true }), 10 + 8 + 5 + 4, 'XP: base, acertos de primeira, perfeita e combo');
igual(J.xpDaLicao({ dePrimeira: 0, maiorCombo: 4 }), 10, 'XP mínimo é o da lição');
const dias = { '2026-10-16': 20, '2026-10-17': 15 };
igual(J.ofensivaDoJogo(dias, '2026-10-18'), 2, 'hoje ainda sem lição: a ofensiva conta até ontem');
igual(J.ofensivaDoJogo({ ...dias, '2026-10-18': 5 }, '2026-10-18'), 3, 'com lição hoje, conta hoje');
igual(J.ofensivaDoJogo(dias, '2026-10-19'), 0, 'um dia em branco quebra a ofensiva');
igual(J.ofensivaDoJogo({ '2026-02-28': 1, '2026-03-01': 1 }, '2026-03-01'), 2, 'virada de fevereiro para março');
igual(J.ofensivaDoJogo({ '2025-12-31': 1, '2026-01-01': 1 }, '2026-01-01'), 2, 'virada de ano');
const somado = J.somarXpDoJogo({ xp: 30, dias: { '2026-10-18': 10 }, meta: 50 }, 25, '2026-10-18');
igual([somado.xp, somado.dias['2026-10-18']], [55, 35], 'somar XP soma no total e no dia');

/* ── o que vem da conta ──────────────────────────────────────────────── */
const sujo = J.limparJogo({ xp: '-5', dias: { 'lixo': 9, '2026-10-01': -3, '2026-10-02': 7.6 }, meta: 33, som: false });
igual([sujo.xp, sujo.dias, sujo.meta, sujo.som], [0, { '2026-10-02': 8 }, 50, false], 'limpar: XP negativo, dia inválido e meta fora da lista');
const muitos = {}; for (let i = 0; i < 200; i += 1) muitos[`2026-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`] = 1;
igual(Object.keys(J.limparJogo({ dias: muitos }).dias).length, 120, 'guarda só os últimos 120 dias');
igual(J.limparJogo(null), { xp: 0, dias: {}, meta: 50, som: true }, 'sem nada, começa do zero');

/* ── flashcard do que errou e a trilha ───────────────────────────────── */
const f = J.fracoDoExercicio(escolha);
igual([f.enunciado, f.gabarito[0]], ['Droga de escolha?', 'C'], 'o que errou vira cartão com a resposta certa');
igual(J.fracoDoExercicio({ tipo: 'vf', afirmacao: 'X', verdadeiro: false, explicacao: '' }).gabarito, ['Falso'], 'verdadeiro ou falso vira cartão com a resposta');
const estudo = { blocos: [{ licoes: 0, feito: false }, { licoes: 0, feito: false }, { licoes: 0, feito: false }] };
igual([J.licaoLiberada(estudo, 0), J.licaoLiberada(estudo, 1)], [true, false], 'trilha: só a primeira lição abre no começo');
estudo.blocos[0].licoes = 1; estudo.blocos[1].feito = true;
igual([J.licaoLiberada(estudo, 1), J.licaoLiberada(estudo, 2)], [true, true], 'abre depois da lição anterior, ou do bloco feito pelos slides');
igual(J.embaralharDoJogo(5, 42), J.embaralharDoJogo(5, 42), 'embaralhar com a mesma semente dá a mesma ordem');
igual([...J.embaralharDoJogo(6, 9)].sort(), [0, 1, 2, 3, 4, 5], 'embaralhar não perde nem repete item');

if (erros.length) { console.log(`\n${erros.length} falha(s) no modo jogo`); process.exit(1); }
console.log('\nmodo jogo: tudo certo');
