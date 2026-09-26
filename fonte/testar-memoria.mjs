/* Testa o perfil de memória e as contas dos cartões.
 *
 * O perfil transforma seis respostas numa escada de revisão, e ela passa a
 * decidir quando cada conteúdo volta, por meses. Uma escada errada não
 * quebra tela nenhuma: faz a pessoa revisar cedo demais o que já sabia e
 * tarde demais o que estava esquecendo — e ela nunca vai saber.
 *
 * Os cartões têm o mesmo tipo de erro silencioso: uma "confiança" que só
 * sobe mente para quem parou de estudar; uma múltipla escolha com duas
 * respostas iguais marca erro em quem acertou.
 *
 *   node testar-memoria.mjs
 */
const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

const M = await import('./_memoria.mjs');
const C = await import('./_cartoes.mjs');

const COMUM = { esquece: 2.5, jeito: 2.5, memoria: 1, ativo: 1, revisar: 1, prazo: 150 };
const FRACA = { esquece: 0.5, jeito: 1.6, memoria: 0.7, ativo: 0.8, revisar: 0.75, prazo: 25 };
const FORTE = { esquece: 12, jeito: 2.6, memoria: 1.3, ativo: 1.2, revisar: 1.25, prazo: 365 };

const escada = (r, prova) => M.escadaDoPerfil(M.perfilDeMemoria(r, prova));

/* ── as perguntas ─────────────────────────────────────────────────────── */
if (M.PERGUNTAS_MEMORIA.length === 6) ok('são seis perguntas');
else falha('perguntas: ' + M.PERGUNTAS_MEMORIA.length);
if (M.PERGUNTAS_MEMORIA.every((p) => p.opcoes.length >= 3 && p.opcoes.every((o) => Number.isFinite(o.valor) && o.valor > 0))) {
  ok('toda opção tem valor numérico positivo — o perfil guarda número, não rótulo');
} else falha('alguma opção sem valor válido');
const ids = M.PERGUNTAS_MEMORIA.map((p) => p.id);
if (new Set(ids).size === ids.length) ok('nenhuma pergunta repete o id, senão uma resposta apagaria a outra');
else falha('ids repetidos: ' + ids.join(','));

/* ── a escada responde ao perfil ──────────────────────────────────────── */
const comum = escada(COMUM);
const fraca = escada(FRACA);
const forte = escada(FORTE);

/* Com o MESMO prazo, para só a memória mudar. No começo da escada a trava
   de intervalo crescente manda (todo mundo revisa no dia 1 e no dia 3);
   é mais adiante que o perfil faz a diferença. */
const f150 = escada({ ...FRACA, prazo: 150 });
const c150 = escada({ ...COMUM, prazo: 150 });
const r150 = escada({ ...FORTE, prazo: 150 });
if (f150[4] < c150[4]) {
  ok(`mesmo prazo: quem esquece rápido revisa antes (5ª revisão no dia ${f150[4]} contra ${c150[4]})`);
} else falha(`ordem errada: fraca=${f150} comum=${c150} forte=${r150}`);
if (r150[0] > c150[0]) ok(`quem guarda bem começa a revisar mais tarde (dia ${r150[0]} contra ${c150[0]})`);
else falha(`forte=${r150} comum=${c150}`);

/* Estudar ativamente rende mais a cada revisão, então precisa de MENOS
   revisões — é o efeito de teste, e é o que o jeito de estudar decide. */
const reler = escada({ ...COMUM, jeito: 1.6, ativo: 0.8, prazo: 365 });
const questoes = escada({ ...COMUM, jeito: 2.6, ativo: 1.2, prazo: 365 });
if (questoes.length < reler.length) {
  ok(`quem estuda tentando lembrar precisa de menos revisões (${questoes.length}) que quem relê (${reler.length})`);
} else falha(`ativo=${questoes.length} passivo=${reler.length}`);

/* ── a escada é uma escada ────────────────────────────────────────────── */
for (const [nome, e] of [['comum', comum], ['fraca', fraca], ['forte', forte], ['vazia', escada({})]]) {
  const crescente = e.every((d, i) => i === 0 || d > e[i - 1]);
  const intervalos = e.map((d, i) => d - (i ? e[i - 1] : 0));
  const expande = intervalos.every((x, i) => i === 0 || x > intervalos[i - 1]);
  if (crescente && expande) ok(`escada ${nome}: dias crescentes e intervalos sempre maiores (${e.join(', ')})`);
  else falha(`escada ${nome} não expande: ${e.join(', ')} · intervalos ${intervalos.join(', ')}`);
}
if (!fraca.some((d, i) => i >= 2 && d - fraca[i - 1] === 1 && fraca[i - 1] - fraca[i - 2] === 1)) {
  ok('nunca três revisões em dias seguidos, nem para quem esquece muito rápido');
} else falha('três dias seguidos: ' + fraca.join(', '));

/* ── o prazo manda no fim da escada ───────────────────────────────────── */
const curta = escada({ ...COMUM, prazo: 25 });
if (curta[curta.length - 1] <= 25 || curta.length === 2) ok('com prova em 25 dias, nenhuma revisão cai depois da prova');
else falha('revisão depois da prova: ' + curta.join(', '));
/* Prova amanhã: o horizonte tem piso de uma semana, porque uma escada de
   um dia só não serve para nada — e ela vale para os próximos assuntos
   também, não só para o de hoje. */
const amanha = escada(COMUM, 1);
if (amanha.length >= 2 && amanha[amanha.length - 1] <= 7) {
  ok('com a prova amanhã, a escada cabe na primeira semana (' + amanha.join(', ') + ')');
} else falha('prova amanhã: ' + amanha.join(', '));
/* Quem guarda muito bem, com prova perto, teria uma revisão só — e uma só
   não consolida nada. */
const forteCurta = escada(FORTE, 7);
if (forteCurta.length === 2) ok('memória forte e prova perto: ainda assim duas revisões (' + forteCurta.join(', ') + ')');
else falha('forte e prova perto: ' + forteCurta.join(', '));
if (comum.length <= 8 && escada({}).length <= 8) ok('nunca passa de oito degraus, o teto da escada do app');
else falha('degraus demais');

/* A data cadastrada no perfil ganha da resposta de prazo: ela é exata. */
const pComData = M.perfilDeMemoria({ ...COMUM, prazo: 365 }, 40);
if (pComData.horizonte === 40) ok('a data de prova cadastrada ganha da faixa respondida');
else falha('horizonte: ' + pComData.horizonte);
if (M.perfilDeMemoria(COMUM, 5000).horizonte === 400 && M.perfilDeMemoria(COMUM, 2).horizonte === 7) {
  ok('e fica entre uma semana e pouco mais de um ano, sem valor absurdo');
} else falha('horizonte fora da faixa');

/* Prova perto pede alvo de lembrança mais alto, e por isso mais revisões. */
if (M.alvoDoPrazo(20) > M.alvoDoPrazo(120) && M.alvoDoPrazo(120) > M.alvoDoPrazo(365)) {
  ok('prova perto pede mais segurança que prova longe');
} else falha('alvos: ' + [20, 120, 365].map(M.alvoDoPrazo).join(','));

/* ── respostas estragadas não viram escada absurda ────────────────────── */
const lixo = escada({ esquece: 'muito', jeito: -3, memoria: null, ativo: 99, revisar: {}, prazo: 'ontem' });
if (lixo.length >= 2 && lixo.every((d) => Number.isFinite(d) && d >= 1 && d <= 3650)) {
  ok('respostas ilegíveis caem no padrão, e a escada continua válida (' + lixo.join(', ') + ')');
} else falha('escada com lixo: ' + JSON.stringify(lixo));

/* ── a curva ──────────────────────────────────────────────────────────── */
const perfil = M.perfilDeMemoria(COMUM);
const curva = M.curvaDeRetencao(perfil, comum, 150);
if (curva[0].com === 100 && curva[0].sem === 100) ok('a curva começa em 100% no dia do estudo');
else falha('início: ' + JSON.stringify(curva[0]));
const fim = curva[curva.length - 1];
if (fim.com > fim.sem + 30) ok(`no dia da prova, revisando você guarda ${fim.com}%; sem revisar, ${fim.sem}%`);
else falha('as revisões não fizeram diferença: ' + JSON.stringify(fim));
const semRev = curva.map((p) => p.sem);
if (semRev.every((v, i) => i === 0 || v <= semRev[i - 1])) ok('sem revisão a lembrança só cai, nunca sobe sozinha');
else falha('a curva sem revisão subiu');

/* Logo depois de cada revisão a lembrança volta a 100%. */
const depois = M.lembrancaNoDia(perfil, comum, comum[2], true);
if (Math.abs(depois - 1) < 1e-9) ok('no dia da revisão a lembrança volta ao topo');
else falha('depois da revisão: ' + depois);
/* E cai mais devagar depois de cada revisão: é a estabilidade crescendo. */
const queda1 = 1 - M.lembrancaNoDia(perfil, comum, comum[0] + 1, true);
const queda3 = 1 - M.lembrancaNoDia(perfil, comum, comum[2] + 1, true);
if (queda3 < queda1) ok('um dia depois da 3ª revisão esquece-se menos que um dia depois da 1ª');
else falha(`queda1=${queda1} queda3=${queda3}`);

/* ═══ cartões ════════════════════════════════════════════════════════ */
const HOJE = '2026-09-26';
const novo = { id: 'n', revisoes: 0, inter: 0, prox: HOJE };
const errado = { id: 'e', revisoes: 3, inter: 0, prox: HOJE };
const noPrazo = { id: 'p', revisoes: 4, inter: 10, prox: HOJE };          // vence hoje
const meio = { id: 'm', revisoes: 4, inter: 10, prox: '2026-10-01' };     // 5 de 10 dias
const recente = { id: 'r', revisoes: 4, inter: 10, prox: '2026-10-06' };  // revisado hoje
const atrasado = { id: 'a', revisoes: 4, inter: 10, prox: '2026-09-16' }; // 10 dias atrasado

if (C.chanceDeLembrar(novo, HOJE) === 0) ok('cartão nunca estudado: 0%');
else falha('novo: ' + C.chanceDeLembrar(novo, HOJE));
if (C.chanceDeLembrar(errado, HOJE) === 0.5) ok('cartão recém-errado fica no meio, nem sabido nem esquecido');
else falha('errado: ' + C.chanceDeLembrar(errado, HOJE));
if (Math.abs(C.chanceDeLembrar(recente, HOJE) - 1) < 1e-9) ok('revisado hoje: 100%');
else falha('recente: ' + C.chanceDeLembrar(recente, HOJE));
if (Math.abs(C.chanceDeLembrar(noPrazo, HOJE) - 0.9) < 1e-9) ok('no dia de vencer: 90%, que é o alvo do agendador');
else falha('no prazo: ' + C.chanceDeLembrar(noPrazo, HOJE));
const cMeio = C.chanceDeLembrar(meio, HOJE);
if (cMeio > 0.9 && cMeio < 1) ok(`a meio caminho: entre 90 e 100% (${Math.round(cMeio * 100)}%)`);
else falha('meio: ' + cMeio);
if (C.chanceDeLembrar(atrasado, HOJE) < 0.9) ok('atrasado: abaixo de 90% — a barra cai sozinha sem estudo');
else falha('atrasado: ' + C.chanceDeLembrar(atrasado, HOJE));
if (C.chanceDeLembrar({ revisoes: 2, inter: 5, prox: 'ontem' }, HOJE) === 0.5) ok('data ilegível não vira NaN');
else falha('data ilegível');

const conf = C.confiancaDoBaralho([novo, recente], HOJE);
if (conf === 50) ok('confiança do baralho é a média das chances, em porcentagem');
else falha('confiança: ' + conf);
if (C.confiancaDoBaralho([], HOJE) === null) ok('baralho vazio não tem 0%: não tem confiança nenhuma');
else falha('vazio: ' + C.confiancaDoBaralho([], HOJE));

/* ── múltipla escolha ─────────────────────────────────────────────────── */
let semente = 1;
const rng = () => { semente = (semente * 16807) % 2147483647; return (semente - 1) / 2147483646; };
const alvo = { id: 'x', frente: 'Marcador mais específico de necrose miocárdica?', verso: 'Troponina', baralho: 'IAM', pasta: 'Cardio' };
const mesmos = [
  { id: 'a', verso: 'CK-MB', baralho: 'IAM', pasta: 'Cardio' },
  { id: 'b', verso: 'Mioglobina', baralho: 'IAM', pasta: 'Cardio' },
  { id: 'c', verso: 'BNP', baralho: 'IAM', pasta: 'Cardio' },
];
const outros = [
  { id: 'd', verso: 'Guerra do Paraguai', baralho: 'História', pasta: 'Outros' },
  { id: 'e', verso: 'Cloroquina', baralho: 'Malária', pasta: 'Infecto' },
];

let alt = C.alternativasDoCartao(alvo, [...outros, ...mesmos], rng);
if (alt.possivel && alt.opcoes.length === 4) ok('quatro alternativas');
else falha('alternativas: ' + JSON.stringify(alt));
if (alt.opcoes.filter((o) => o.certa).length === 1 && alt.opcoes.find((o) => o.certa).texto === 'Troponina') {
  ok('exatamente uma certa, e é a resposta do cartão');
} else falha('certas: ' + JSON.stringify(alt.opcoes));
if (alt.opcoes.filter((o) => !o.certa).every((o) => ['CK-MB', 'Mioglobina', 'BNP'].includes(o.texto))) {
  ok('as erradas vêm do mesmo baralho primeiro — a confusão que vale treinar');
} else falha('erradas de fora: ' + alt.opcoes.map((o) => o.texto).join(', '));

/* A posição da certa muda: senão a pessoa decora "é sempre a primeira". */
const posicoes = new Set();
for (let i = 0; i < 40; i++) {
  const a = C.alternativasDoCartao(alvo, mesmos, rng);
  posicoes.add(a.opcoes.findIndex((o) => o.certa));
}
if (posicoes.size >= 3) ok('a certa muda de lugar entre as rodadas');
else falha('a certa ficou sempre em ' + [...posicoes].join(','));

/* Resposta igual escrita de outro jeito não pode virar alternativa "errada". */
const disfarcada = C.alternativasDoCartao(alvo, [
  { id: 'q', verso: 'troponina.', baralho: 'IAM', pasta: 'Cardio' },
  { id: 'w', verso: 'TROPONÍNA', baralho: 'IAM', pasta: 'Cardio' },
  ...mesmos,
], rng);
if (!disfarcada.opcoes.some((o) => !o.certa && /tropon/i.test(o.texto))) {
  ok('a mesma resposta escrita diferente não aparece como alternativa errada');
} else falha('duas "Troponina": ' + disfarcada.opcoes.map((o) => o.texto).join(' | '));

/* Com poucos cartões, não finge: volta para o modo de virar. */
if (!C.alternativasDoCartao(alvo, [mesmos[0]], rng).possivel) ok('com só uma errada disponível, a múltipla escolha não é oferecida');
else falha('ofereceu cara ou coroa');
if (C.alternativasDoCartao(alvo, [mesmos[0], mesmos[1]], rng).opcoes.length === 3) ok('com duas erradas, sai com três opções');
else falha('com duas erradas');
if (!C.alternativasDoCartao({ id: 'z', verso: '' }, mesmos, rng).possivel) ok('cartão sem resposta não vira pergunta');
else falha('cartão sem verso virou pergunta');
if (!C.alternativasDoCartao(alvo, [{ ...alvo }], rng).possivel) ok('o próprio cartão não entra como alternativa dele mesmo');
else falha('o cartão virou alternativa dele mesmo');

/* Resposta que é só figura, ou tem marcador e HTML no meio. */
if (C.textoDaAlternativa('Onda T apiculada [[img:ecg.png]] no <b>V2</b>') === 'Onda T apiculada no V2') {
  ok('marcador de figura e HTML saem do texto da alternativa');
} else falha('limpeza: ' + JSON.stringify(C.textoDaAlternativa('Onda T apiculada [[img:ecg.png]] no <b>V2</b>')));
const comFigura = C.alternativasDoCartao(alvo, [
  { id: 'f1', verso: '[[img:ecg.png]]', baralho: 'IAM', pasta: 'Cardio' },
  { id: 'f2', verso: '  <br> [[img:rx.jpg]] ', baralho: 'IAM', pasta: 'Cardio' },
  ...mesmos,
], rng);
if (comFigura.opcoes.every((o) => o.texto.trim())) ok('resposta que é só figura não vira botão em branco');
else falha('alternativa vazia: ' + JSON.stringify(comFigura.opcoes));
if (!C.alternativasDoCartao({ id: 'g', verso: '[[img:so-figura.png]]' }, mesmos, rng).possivel) {
  ok('cartão cuja resposta é só figura fica no modo de virar');
} else falha('cartão só-figura virou múltipla escolha');

/* ── a nota que a escolha vale ────────────────────────────────────────── */
const nota = C.notaDaEscolha;
if (nota({ acertou: false }) === 'errei') ok('errou: "errei", volta hoje');
else falha('errou: ' + nota({ acertou: false }));
if (nota({ acertou: true, revelou: true }) === 'errei') ok('revelou a resposta: conta como erro');
else falha('revelou');
if (nota({ acertou: true, usouDica: true, segundos: 2 }) === 'dificil') ok('acertou com dica: "difícil", mesmo que rápido');
else falha('dica');
if (nota({ acertou: true, segundos: 3 }) === 'facil') ok('acertou rápido: "fácil"');
else falha('rápido');
if (nota({ acertou: true, segundos: 30 }) === 'bom') ok('acertou devagar: "bom" — pode ter sido por eliminação');
else falha('devagar');
if (nota({ acertou: true }) === 'bom') ok('sem tempo medido, fica no "bom"');
else falha('sem tempo');

/* ── pontos ───────────────────────────────────────────────────────────── */
if (C.pontosDaResposta('errei', 9) === 0) ok('erro não dá ponto, nem com sequência');
else falha('pontos no erro');
if (C.pontosDaResposta('facil', 0) > C.pontosDaResposta('bom', 0) && C.pontosDaResposta('bom', 0) > C.pontosDaResposta('dificil', 0)) {
  ok('pontos seguem a nota');
} else falha('ordem dos pontos');
if (C.pontosDaResposta('bom', 50) === C.pontosDaResposta('bom', 5)) ok('o bônus de sequência tem teto');
else falha('sequência sem teto');

/* ── a cor do baralho ──────────────────────────────────────────────────
 * Cor desconhecida (de uma versão antiga, ou digitada à mão no arquivo de
 * backup) não pode virar "var(--undefined)", que o navegador desenha como
 * transparente: o baralho ficaria sem faixa nenhuma e ninguém saberia
 * por quê. */
if (C.CORES_BARALHO.every((c) => C.corDoBaralho(c.id) === `var(--${c.id})`)) ok('toda cor da paleta vira a variável do tema');
else falha('cor da paleta mal convertida');
if (C.corDoBaralho('fucsia') === 'var(--neon)' && C.corDoBaralho(undefined) === 'var(--neon)') {
  ok('cor desconhecida ou ausente cai no roxo da casa, e não em transparente');
} else falha('fallback: ' + C.corDoBaralho('fucsia'));
if (new Set(C.CORES_BARALHO.map((c) => c.id)).size === C.CORES_BARALHO.length) ok('nenhuma cor repetida na paleta');
else falha('cor repetida');

console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
