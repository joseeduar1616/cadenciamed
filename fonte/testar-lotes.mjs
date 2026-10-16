/* Testa a divisão de uma prova em lotes.
 *
 * O relato: "tá indo em média 20 questões por arquivo, não está lendo
 * tudo". Não era a leitura: era a resposta da IA batendo no teto de saída,
 * porque a prova inteira ia numa chamada só. Agora vai em lotes — e o
 * risco novo é o corte cair no meio de uma questão, o que transformaria
 * uma questão em duas pela metade, sem ninguém perceber olhando a tela.
 *
 *   node testar-lotes.mjs
 */
const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

const { dividirEmLotes, juntarQuestoes, contarQuestoesNoTexto, LOTE_ALVO, MAX_LOTES, POR_LOTE } =
  await import('./_lotes.mjs');

/* O teto de questões POR CHAMADA da rota (worker/api/provas-ia.js). O lote
   é medido em questões justamente por causa dele, então o teste conhece o
   número: se a rota subir o teto e o lote não acompanhar, sobra capacidade
   parada; se o lote passar do teto, questão some. */
const TETO_DA_ROTA = 20;

/* Uma prova de verdade: questões numeradas, enunciado, quatro alternativas. */
const questao = (n) => `\n${n}. Paciente de ${20 + (n % 40)} anos com quadro clínico número ${n}, `
  + 'evoluindo com achados ao exame físico que exigem raciocínio. Qual a conduta?\n'
  + 'A) primeira alternativa desta questão\nB) segunda alternativa desta questão\n'
  + 'C) terceira alternativa desta questão\nD) quarta alternativa desta questão\n';

const prova = (quantas) => Array.from({ length: quantas }, (_, i) => questao(i + 1)).join('\n');

/* ── prova pequena ────────────────────────────────────────────────────── */
let lotes = dividirEmLotes(prova(5));
if (lotes.length === 1) ok('prova pequena vai numa chamada só, sem partir à toa');
else falha('partiu uma prova pequena em ' + lotes.length);

/* ── prova grande ─────────────────────────────────────────────────────── */
const grande = prova(60);
lotes = dividirEmLotes(grande);
if (lotes.length > 1) ok(`prova de 60 questões é dividida (${lotes.length} lotes)`);
else falha('prova grande não foi dividida');

if (lotes.every((l) => l.length <= LOTE_ALVO * 1.05)) ok('nenhum lote passa do tamanho pedido');
else falha('lote grande demais: ' + lotes.map((l) => l.length).join(', '));

/* ── NADA pode se perder no corte ─────────────────────────────────────── */
const juntoDeVolta = lotes.join('\n');
const contar = (t) => (t.match(/quadro clínico número \d+/g) || []).length;
if (contar(juntoDeVolta) === 60) ok('as 60 questões continuam inteiras depois de partir');
else falha(`sobraram ${contar(juntoDeVolta)} enunciados de 60`);

/* ── o corte cai ENTRE questões, não no meio de uma ───────────────────── */
const comecaEmQuestao = lotes.slice(1).every((l) => /^\s*(?:quest[ãa]o\s*)?\d{1,3}\s*[).\-–—:]?\s/i.test(l));
if (comecaEmQuestao) ok('cada lote começa no início de uma questão, e não no meio de uma');
else falha('um lote começou no meio: ' + JSON.stringify(lotes[1].slice(0, 60)));

/* Nenhum lote pode terminar com alternativas órfãs de enunciado. */
const orfao = lotes.find((l) => /\n[A-D]\)\s[^\n]*$/.test(l.trim()) && !/\d{1,3}\s*[).\-–—:]?\s/.test(l.slice(-400)));
if (!orfao) ok('nenhum lote termina com alternativas soltas, sem a pergunta delas');
else falha('lote terminou órfão');

/* ── texto sem numeração nenhuma ──────────────────────────────────────── */
const corrido = 'palavra '.repeat(6000);
lotes = dividirEmLotes(corrido);
if (lotes.length > 1 && lotes.join('').replace(/\s/g, '').length === corrido.replace(/\s/g, '').length) {
  ok('texto sem número de questão também é partido, e sem perder conteúdo');
} else falha('texto corrido: ' + lotes.length + ' lotes');

/* ── teto de lotes ────────────────────────────────────────────────────── */
lotes = dividirEmLotes(prova(600));
if (lotes.length <= MAX_LOTES) ok(`prova absurda para no teto de ${MAX_LOTES} lotes`);
else falha('passou do teto: ' + lotes.length);

/* ── o caso que motivou tudo: 316 questões ────────────────────────────
 *
 * Mandou um arquivo com 316 e voltaram 38. Medindo o lote por caracteres,
 * uma prova dessas virava dez lotes de trinta questões cada — e como cada
 * chamada devolve no máximo vinte, cento e dezesseis questões sumiam sem
 * nada na tela. O lote tem de ser medido pelo limite que manda, que é o da
 * RESPOSTA, e não pelo tamanho do texto.
 */
const provaGrande = 'CADERNO DE PROVAS - INSTRUÇÕES DA BANCA\n\n' + prova(316);
lotes = dividirEmLotes(provaGrande);
const porLote = lotes.map((l) => (l.match(/quadro clínico número \d+/g) || []).length);

if (porLote.reduce((a, b) => a + b, 0) === 316) ok('as 316 questões continuam todas lá depois de dividir');
else falha(`sobraram ${porLote.reduce((a, b) => a + b, 0)} de 316`);

if (porLote.every((n) => n <= TETO_DA_ROTA)) ok('nenhum lote pede mais questões do que uma chamada devolve');
else falha('lote acima do teto da rota: ' + porLote.join(', '));

if (porLote.every((n) => n <= POR_LOTE)) ok(`e nenhum passa das ${POR_LOTE} por lote, que é a folga do teto`);
else falha('lote acima do próprio alvo: ' + porLote.join(', '));

if (/INSTRUÇÕES DA BANCA/.test(lotes[0])) ok('o cabeçalho da banca fica no primeiro lote, onde faz sentido');
else falha('o cabeçalho se perdeu');

/* ── contar as questões do material ───────────────────────────────────
 * É esse número que a tela compara com o que voltou. Sem ele, "vieram 38"
 * parece um resultado em vez de um problema. */
if (contarQuestoesNoTexto(provaGrande) === 316) ok('a tela sabe quantas questões o arquivo tem, para comparar com o que voltou');
else falha('contagem: ' + contarQuestoesNoTexto(provaGrande) + ' de 316');

/* ── juntar sem repetir ───────────────────────────────────────────────── */
const q = (enunciado, numero) => ({ enunciado, numero });
let juntas = juntarQuestoes([], [q('Paciente com dor torácica súbita e dispneia', 1)]);
juntas = juntarQuestoes(juntas, [q('Paciente com dor torácica súbita e dispneia', 1), q('Outra questão diferente', 2)]);
if (juntas.length === 2) ok('questão repetida entre lotes entra uma vez só');
else falha('juntou repetida: ' + juntas.length);

/* Números iguais em questões diferentes (dois cadernos) não podem colidir. */
juntas = juntarQuestoes([q('Primeira pergunta sobre cardiologia aguda', 1)], [q('Segunda pergunta, sobre pediatria', 1)]);
if (juntas.length === 2) ok('número repetido em questões diferentes não descarta nenhuma');
else falha('descartou por número igual');

console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
