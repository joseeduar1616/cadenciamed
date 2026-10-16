/* Testa o teto diário de uso da IA.
 *
 * O que está em jogo aqui é dinheiro, não conforto. A assinatura é um valor
 * fixo por mês e o custo de cada chamada à IA é variável: uma conta que
 * processe um acervo inteiro num sábado gasta num dia mais do que paga num
 * ano. Um teto que não fecha é o mesmo que não ter teto — e ninguém
 * descobre isso por uma tela quebrada, e sim pela fatura no mês seguinte.
 *
 * Do outro lado, um teto que fecha DEMAIS é pior ainda: a pessoa pagou,
 * está estudando, e o site diz não.
 *
 *   node testar-limites.mjs
 */
const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

const L = await import('../worker/api/_limites.js');

/* 14:00 UTC = 11:00 em Brasília, dia 25. */
const TARDE = Date.parse('2026-09-25T14:00:00Z');
/* 01:00 UTC do dia 26 = 22:00 do dia 25 em Brasília. É o caso que quebra
   quem conta o dia em UTC: seriam dois orçamentos na mesma noite. */
const NOITE = Date.parse('2026-09-26T01:00:00Z');

/* ── o dia de cobrança é o de quem estuda ─────────────────────────────── */
if (L.diaDeCobranca(TARDE) === '2026-09-25') ok('de tarde, o dia é o de hoje');
else falha('tarde: ' + L.diaDeCobranca(TARDE));
if (L.diaDeCobranca(NOITE) === '2026-09-25') {
  ok('às 22h de Brasília ainda é o mesmo dia, e não um orçamento novo');
} else falha('noite: ' + L.diaDeCobranca(NOITE));
if (L.diaDeCobranca(Date.parse('2026-09-26T03:30:00Z')) === '2026-09-26') ok('e depois da meia-noite vira o dia seguinte');
else falha('madrugada: ' + L.diaDeCobranca(Date.parse('2026-09-26T03:30:00Z')));
if (L.diaDeCobranca('não é data') === '') ok('data ilegível não vira dia inventado');
else falha('data ilegível: ' + L.diaDeCobranca('não é data'));

/* ── cada rota custa o que custa ──────────────────────────────────────
 * Contar "uma chamada" para todas seria dizer que comentar uma prova de
 * trezentas questões custa o mesmo que responder uma dúvida. */
if (L.custoDaRota('provas-ia') > L.custoDaRota('assistente') * 5) {
  ok('comentar uma prova pesa muito mais que uma pergunta ao assistente');
} else falha(`prova=${L.custoDaRota('provas-ia')} assistente=${L.custoDaRota('assistente')}`);
if (L.custoDaRota('/api/flashcards-ia') === L.custoDaRota('flashcards-ia')) {
  ok('o nome da rota vale com ou sem o /api na frente');
} else falha('o prefixo /api mudou o custo');
if (L.custoDaRota('rota-que-não-existe') === L.CUSTO_PADRAO && L.CUSTO_PADRAO > 0) {
  ok('rota nova que ninguém cadastrou custa o padrão, e não zero');
} else falha('rota desconhecida: ' + L.custoDaRota('rota-que-não-existe'));

/* ── o contador se zera sozinho ───────────────────────────────────────
 * Sem isso alguém teria de varrer o banco à meia-noite, e o dia em que
 * essa varredura falhasse seria o dia em que ninguém conseguiria usar. */
if (L.gastoDeHoje({ dia: '2026-09-25', pontos: 40 }, TARDE) === 40) ok('o gasto de hoje é lido do registro');
else falha('gasto de hoje: ' + L.gastoDeHoje({ dia: '2026-09-25', pontos: 40 }, TARDE));
if (L.gastoDeHoje({ dia: '2026-09-24', pontos: 119 }, TARDE) === 0) {
  ok('o gasto de ontem vale zero hoje: o contador vira sozinho');
} else falha('o gasto de ontem vazou para hoje');
for (const [nome, r] of [
  ['registro nulo', null],
  ['sem dia', { pontos: 40 }],
  ['pontos em texto', { dia: '2026-09-25', pontos: 'muitos' }],
  ['pontos negativos', { dia: '2026-09-25', pontos: -900 }],
]) {
  if (L.gastoDeHoje(r, TARDE) === 0) ok(`${nome} conta como zero, sem estourar`);
  else falha(`${nome} deu ` + L.gastoDeHoje(r, TARDE));
}
/* Pontos negativos gravados no banco não podem virar crédito infinito. */
const negativo = L.podePelaCota({ registro: { dia: '2026-09-25', pontos: -99999 }, rota: 'provas-ia', dono: false, agora: TARDE });
if (negativo.ok && negativo.gasto === 0) ok('saldo negativo no banco não vira crédito extra');
else falha('negativo: ' + JSON.stringify(negativo));

/* ── a decisão ────────────────────────────────────────────────────────── */
let v = L.podePelaCota({ registro: null, rota: 'assistente', dono: false, agora: TARDE });
if (v.ok) ok('quem não usou nada hoje passa');
else falha('barrou quem não usou nada: ' + v.erro);

v = L.podePelaCota({ registro: { dia: '2026-09-25', pontos: L.ORCAMENTO_DIA }, rota: 'assistente', dono: false, agora: TARDE });
if (!v.ok) ok('quem chegou ao teto é barrado');
else falha('deixou passar acima do teto');
if (!v.ok && /limite diário/.test(v.erro) && /volta/.test(v.erro)) {
  ok('e a mensagem diz o que houve e quando volta, em vez de parecer defeito');
} else falha('mensagem ruim: ' + v.erro);
if (!v.ok && /continua salvo/.test(v.erro)) ok('e tranquiliza sobre o que já foi gerado');
else falha('a mensagem não diz que o trabalho está salvo');

/* A borda: uma chamada que cabe exatamente, e a seguinte que não cabe. */
const quase = L.ORCAMENTO_DIA - L.custoDaRota('provas-ia');
if (L.podePelaCota({ registro: { dia: '2026-09-25', pontos: quase }, rota: 'provas-ia', dono: false, agora: TARDE }).ok) {
  ok('a última chamada que cabe inteira passa');
} else falha('barrou uma chamada que cabia');
if (!L.podePelaCota({ registro: { dia: '2026-09-25', pontos: quase + 1 }, rota: 'provas-ia', dono: false, agora: TARDE }).ok) {
  ok('e a que não cabe é barrada antes de gastar, e não no meio');
} else falha('deixou começar uma chamada que não cabia');

/* Uma rota barata ainda passa quando uma cara já não passa: o teto é sobre
   custo, e não sobre "você usou demais o site". */
const apertado = { dia: '2026-09-25', pontos: L.ORCAMENTO_DIA - 2 };
if (L.podePelaCota({ registro: apertado, rota: 'assistente', dono: false, agora: TARDE }).ok
  && !L.podePelaCota({ registro: apertado, rota: 'provas-ia', dono: false, agora: TARDE }).ok) {
  ok('com pouco saldo dá para perguntar ao assistente, mas não para comentar uma prova');
} else falha('o teto não distingue rota cara de rota barata no fim do orçamento');

/* O dono paga a conta e precisa processar acervo para publicar prova por
   código: teto nele seria travar o trabalho de quem sustenta o site. */
const muito = { dia: '2026-09-25', pontos: 99999 };
if (L.podePelaCota({ registro: muito, rota: 'provas-ia', dono: true, agora: TARDE }).ok) ok('o dono não tem teto');
else falha('barrou o dono');

/* O orçamento precisa ser generoso de verdade: o teto é para o caso
   extremo, não para o uso pesado de quem está em reta final. */
if (L.ORCAMENTO_DIA / L.custoDaRota('assistente') >= 100) {
  ok('cabem mais de cem perguntas ao assistente num dia só');
} else falha('o orçamento aperta o uso normal: ' + L.ORCAMENTO_DIA);
if (L.ORCAMENTO_DIA / L.custoDaRota('flashcards-ia') >= 20) {
  ok('e mais de vinte baralhos montados com IA no mesmo dia');
} else falha('poucos baralhos por dia: ' + (L.ORCAMENTO_DIA / L.custoDaRota('flashcards-ia')));

/* ── o registro depois da chamada ─────────────────────────────────────── */
let reg = L.registroApos(null, 'assistente', TARDE);
if (reg.dia === '2026-09-25' && reg.pontos === L.custoDaRota('assistente')) ok('a primeira chamada do dia abre o registro');
else falha('primeiro registro: ' + JSON.stringify(reg));
reg = L.registroApos(reg, 'provas-ia', TARDE);
if (reg.pontos === L.custoDaRota('assistente') + L.custoDaRota('provas-ia')) ok('e a seguinte soma em cima');
else falha('soma: ' + reg.pontos);
reg = L.registroApos({ dia: '2026-09-24', pontos: 118 }, 'assistente', TARDE);
if (reg.pontos === L.custoDaRota('assistente')) ok('virando o dia, o registro recomeça do zero');
else falha('não zerou na virada: ' + reg.pontos);

/* Cem chamadas seguidas param no teto e não passam dele nem por um ponto. */
let acumulado = null;
let barrou = 0;
for (let i = 0; i < 200; i++) {
  const d = L.podePelaCota({ registro: acumulado, rota: 'flashcards-ia', dono: false, agora: TARDE });
  if (!d.ok) { barrou += 1; continue; }
  acumulado = L.registroApos(acumulado, 'flashcards-ia', TARDE);
}
if (barrou > 0 && acumulado.pontos <= L.ORCAMENTO_DIA) {
  ok(`duzentas tentativas param em ${acumulado.pontos} pontos, dentro do orçamento`);
} else falha('o acumulado passou do teto: ' + JSON.stringify(acumulado));

/* ── quanto falta para virar ──────────────────────────────────────────
 * Dizer "amanhã" às 23h50 é tecnicamente certo e praticamente inútil. */
if (/^em \d+h$/.test(L.faltaParaVirar(TARDE))) ok('de tarde, fala em horas');
else falha('tarde: ' + L.faltaParaVirar(TARDE));
if (/min/.test(L.faltaParaVirar(Date.parse('2026-09-26T02:30:00Z')))) ok('e perto da virada, em minutos');
else falha('perto da virada: ' + L.faltaParaVirar(Date.parse('2026-09-26T02:30:00Z')));
if (L.faltaParaVirar('qualquer coisa') === '') ok('data ilegível não vira "em NaN h"');
else falha('ilegível: ' + L.faltaParaVirar('qualquer coisa'));

console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
