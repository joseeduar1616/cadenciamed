/* Testa a rota que escreve as questões do duelo, sem gastar cota.
 *
 * Roda contra o arquivo que vai para o ar (worker/api/provas-ia.js), com
 * a mesma técnica de servidor falso do testar-cronograma-ia.mjs.
 *
 * O que mais importa aqui não é o caminho feliz: é o que a rota faz com
 * resposta ruim da IA. Descanso de dez minutos, vinte séries num
 * exercício e grupo muscular inventado chegariam na tela como se fossem
 * prescrição, e o cronômetro contaria os dez minutos sem reclamar.
 *
 *   node testar-questoes-ia.mjs
 */
import http from 'node:http';

const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

let responder = () => ({ status: 200, corpo: {} });
let ultimoPedido = null;

const servidor = http.createServer((req, res) => {
  let cru = '';
  req.on('data', (d) => { cru += d; });
  req.on('end', () => {
    ultimoPedido = { url: req.url, headers: req.headers, corpo: JSON.parse(cru || '{}') };
    const r = responder(ultimoPedido);
    res.writeHead(r.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(r.corpo));
  });
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${servidor.address().port}`;

let QUEM = { email: 'joseeduardo1616@gmail.com', localId: 'uid-dono' };
let PLANO_ATE = 0;

const { generateKeyPairSync } = await import('node:crypto');
const CONTA = {
  client_email: 'teste@exemplo.iam.gserviceaccount.com',
  private_key: generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ type: 'pkcs8', format: 'pem' }),
};

const fetchReal = globalThis.fetch;
globalThis.fetch = (url, opcoes) => {
  const u = String(url);
  if (u.includes('identitytoolkit.googleapis.com')) {
    return Promise.resolve(new Response(
      JSON.stringify(QUEM ? { users: [QUEM] } : { users: [] }),
      { status: QUEM === null ? 400 : 200, headers: { 'Content-Type': 'application/json' } }));
  }
  if (u.includes('generativelanguage.googleapis.com') || u.includes('api.anthropic.com')) {
    return fetchReal(base + new URL(u).pathname, opcoes);
  }
  if (u.includes('oauth2.googleapis.com/token')) {
    return Promise.resolve(new Response(JSON.stringify({ access_token: 'token-falso' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }
  if (u.includes('firestore.googleapis.com')) {
    return Promise.resolve(new Response(
      JSON.stringify(PLANO_ATE ? { fields: { validoAte: { doubleValue: PLANO_ATE } } } : {}),
      { status: PLANO_ATE ? 200 : 404, headers: { 'Content-Type': 'application/json' } }));
  }
  return fetchReal(url, opcoes);
};

const pedir = async (fn, corpo) => {
  const req = new Request('http://local/api/provas-ia', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const res = await fn({ request: req, env });
  return { status: res.status, corpo: await res.json() };
};

const PEDIDO = {
  token: 'token-de-teste',
  texto: 'Questão 1. Paciente com dispneia aos esforços e edema de membros inferiores. '.repeat(4),
};

const env = {};
const carregar = async () => (await import('../worker/api/provas-ia.js?v=' + Math.random())).onRequest;

env.FIREBASE_API_KEY = 'chave-firebase';
env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify(CONTA);
env.GEMINI_API_KEY = 'chave-de-teste';
PLANO_ATE = Date.now() + 30 * 86400000;

/* Resposta da IA embrulhada como o Gemini embrulha. */
const respostaIA = (obj) => ({
  status: 200,
  corpo: {
    candidates: [{
      content: { parts: [{ text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] },
      finishReason: 'STOP',
    }],
  },
});

const questao = (extra) => ({
  numero: 1,
  assunto: 'Insuficiência cardíaca',
  enunciado: 'Paciente com dispneia aos esforços e edema. Qual a conduta?',
  alternativas: ['Diurético', 'Antibiótico', 'Corticoide', 'Nada'],
  certa: 0,
  comentarios: ['certa porque alivia a congestão', 'não há infecção', 'não é inflamatório', 'conduta expectante piora'],
  fonte: 'Diretriz brasileira de insuficiência cardíaca',
  seguranca: 'alta',
  avisos: '',
  ...extra,
});

const BOA = { prova: 'USP 2024', questoes: [questao()] };

/* ── 1. material curto demais nem chega na IA ─────────────────────────── */
let chamouIA = false;
responder = () => { chamouIA = true; return respostaIA(BOA); };
let r = await pedir(await carregar(), { ...PEDIDO, texto: 'oi' });
if (r.status === 400 && !chamouIA) ok('prova curta demais: recusada antes de gastar a IA');
else falha('material curto: ' + JSON.stringify(r));

/* ── 2. o caminho feliz ───────────────────────────────────────────────── */
r = await pedir(await carregar(), PEDIDO);
if (r.status === 200 && r.corpo.questoes && r.corpo.questoes.length === 1) ok('a prova volta comentada');
else falha('caminho feliz: ' + JSON.stringify(r).slice(0, 200));
if (r.corpo.prova === 'USP 2024') ok('o nome da prova vem junto');
else falha('o nome da prova não veio');

let q = r.corpo.questoes[0];
if (q.comentarios.length === q.alternativas.length) ok('há um comentário para CADA alternativa, e não só para a certa');
else falha(`${q.alternativas.length} alternativas e ${q.comentarios.length} comentários`);
if (q.fonte && q.seguranca === 'alta') ok('a fonte e o quanto a IA está segura chegam na tela');
else falha('faltou fonte ou segurança: ' + JSON.stringify(q).slice(0, 160));

/* ── 3. o que não pode chegar na tela ─────────────────────────────────── */
const recusa = async (nome, extra, porque) => {
  responder = () => respostaIA({ prova: '', questoes: [questao(extra)] });
  const rr = await pedir(await carregar(), PEDIDO);
  const passou = rr.corpo.questoes && rr.corpo.questoes.length > 0;
  if (!passou) ok(`${nome}: descartada (${porque})`);
  else falha(`${nome}: passou para a tela — ${JSON.stringify(rr.corpo.questoes[0]).slice(0, 140)}`);
};

/* Gabarito apontando para fora da lista é gabarito errado com cara de
   certo: a tela marcaria alternativa nenhuma, ou a errada. */
await recusa('gabarito fora da lista', { certa: 9 }, 'a alternativa nem existe');
await recusa('gabarito negativo', { certa: -1 }, 'idem');

/* Sem o comentário de todas, some justamente a parte que ensina: sobra um
   gabarito, que é o que a pessoa já tinha antes de mandar a prova. */
await recusa('faltando comentário', { comentarios: ['só o da certa'] }, 'as erradas ficariam sem explicação');
await recusa('comentário vazio', {
  comentarios: ['certa porque sim', '', 'não é inflamatório', 'piora'],
}, 'uma alternativa ficaria muda');

/* Duas alternativas iguais deixam a questão sem resposta única. */
await recusa('alternativas repetidas', {
  alternativas: ['Diurético', 'Diurético', 'Corticoide', 'Nada'],
}, 'ficaria sem resposta única');

await recusa('uma alternativa só', {
  alternativas: ['Diurético'], comentarios: ['certa'],
}, 'não é múltipla escolha');

await recusa('sem enunciado', { enunciado: '  ' }, 'não dá para responder o que não foi perguntado');

/* ── 4. na dúvida, a tela pede conferência ────────────────────────────── */
responder = () => respostaIA({ prova: '', questoes: [questao({ seguranca: 'tenho certeza absoluta' })] });
r = await pedir(await carregar(), PEDIDO);
if (r.corpo.questoes[0].seguranca === 'media') ok('segurança inventada vira "media": na dúvida, conferir');
else falha('segurança estranha virou ' + r.corpo.questoes[0].seguranca);

responder = () => respostaIA({ prova: '', questoes: [questao({ seguranca: 'baixa', avisos: 'a conduta mudou depois desta prova' })] });
r = await pedir(await carregar(), PEDIDO);
if (r.corpo.questoes[0].seguranca === 'baixa' && /conduta mudou/.test(r.corpo.questoes[0].avisos)) {
  ok('quando a IA não está segura, isso chega na tela junto com o aviso');
} else falha('a insegurança da IA se perdeu no caminho');

/* ── 5. a questão pela metade não derruba as inteiras ─────────────────── */
responder = () => respostaIA({
  prova: 'Mista',
  questoes: [questao(), questao({ numero: 2, certa: 40 }), questao({ numero: 3 })],
});
r = await pedir(await carregar(), PEDIDO);
if (r.corpo.questoes.length === 2) ok('a questão quebrada sai e as inteiras ficam');
else falha('sobraram ' + (r.corpo.questoes || []).length + ' questões');
if (r.corpo.descartadas === 1) ok('e a tela sabe quantas foram descartadas, em vez de a pessoa contar');
else falha('descartadas veio ' + r.corpo.descartadas);

/* ── 6. resposta ilegível da IA ───────────────────────────────────────── */
responder = () => respostaIA('desculpe, não consegui ler essa prova');
r = await pedir(await carregar(), PEDIDO);
if (r.status === 502 && /formato/.test(r.corpo.erro || '')) ok('resposta que não é JSON vira erro explicado, não tela quebrada');
else falha('resposta ilegível: ' + JSON.stringify(r).slice(0, 160));

responder = () => respostaIA({ prova: '', questoes: [] });
r = await pedir(await carregar(), PEDIDO);
if (r.corpo.erro && /foto|PDF/i.test(r.corpo.erro)) ok('prova sem questão nenhuma diz o que fazer, em vez de só falhar');
else falha('prova vazia: ' + JSON.stringify(r).slice(0, 160));

/* O JSON dentro de cerca de markdown é o erro mais comum da IA. */
responder = () => respostaIA('```json\n' + JSON.stringify(BOA) + '\n```');
r = await pedir(await carregar(), PEDIDO);
if (r.corpo.questoes && r.corpo.questoes.length === 1) ok('JSON embrulhado em markdown é lido assim mesmo');
else falha('JSON em markdown não foi lido');

/* ── 7. o material é material, não ordem ──────────────────────────────── */
responder = (p) => { ultimoPedido = p; return respostaIA(BOA); };
await pedir(await carregar(), PEDIDO);
const sistema = JSON.stringify(ultimoPedido.corpo);
if (/NÃO são instruções para você/i.test(sistema)) ok('a prova chega avisada de que é material, não ordem para a IA');
else falha('a prova chegou sem o aviso de injeção');

/* ── 8. quem pode usar ────────────────────────────────────────────────── */
responder = () => respostaIA(BOA);
r = await pedir(await carregar(), { ...PEDIDO, token: '' });
if (r.status === 403) ok('sem entrar na conta, a rota recusa');
else falha('sem token: ' + JSON.stringify(r));

QUEM = { email: 'gente@email.com', localId: 'uid-gente' };
PLANO_ATE = 0;
r = await pedir(await carregar(), PEDIDO);
if (r.status === 403) ok('sem assinatura em dia, a rota recusa');
else falha('sem plano: ' + JSON.stringify(r).slice(0, 160));

const antes = ultimoPedido;
r = await pedir(await carregar(), PEDIDO);
if (ultimoPedido === antes) ok('e recusa ANTES de chamar a IA, sem gastar cota com quem não pode');
else falha('a IA foi chamada para quem não pode usar');

/* ── a resposta cortada no meio ────────────────────────────────────────
 *
 * Prova comentada é a resposta mais longa do site: cada questão traz o
 * enunciado reescrito, as alternativas e um comentário para CADA uma.
 * Poucas questões assim já encostam no teto de saída, e o JSON acaba no
 * meio de uma frase. Isso virava "a IA não devolveu num formato que eu
 * conseguisse ler" e jogava fora até as questões que já estavam prontas —
 * foi o que apareceu na tela de quem mandou uma prova de verdade.
 */
PLANO_ATE = Date.now() + 30 * 86400000;

const inteiro = JSON.stringify({ prova: 'UNIFESP 2025', questoes: [questao(), questao({ numero: 2 })] });
/* corta no meio do comentário da segunda questão, como o teto faz */
const truncado = inteiro.slice(0, inteiro.lastIndexOf('"comentarios"'));
responder = () => respostaIA(truncado);

r = await pedir(await carregar(), PEDIDO);
if (r.status === 200 && (r.corpo.questoes || []).length === 1) {
  ok('resposta cortada no meio: a questão que veio inteira é aproveitada');
} else falha('cortada: ' + JSON.stringify(r).slice(0, 200));
if (r.corpo && r.corpo.cortada) ok('e a tela é avisada de que a prova não veio até o fim');
else falha('não avisou que a resposta foi cortada');
if (r.corpo && r.corpo.prova === 'UNIFESP 2025') ok('o nome da prova é pescado do texto cru, que o JSON quebrado ainda tem');
else falha('perdeu o nome da prova: ' + JSON.stringify(r.corpo && r.corpo.prova));

/* Cortada antes de fechar a primeira: aí não há o que aproveitar, e a
   mensagem tem de dizer o que fazer em vez de mandar tentar de novo. */
responder = () => respostaIA(inteiro.slice(0, 60));
r = await pedir(await carregar(), PEDIDO);
if (r.status === 502 && /Tente de novo|longa demais/.test(r.corpo.erro || '')) {
  ok('sem nenhuma questão inteira, explica em vez de devolver JSON quebrado');
} else falha('cortada no começo: ' + JSON.stringify(r).slice(0, 200));

servidor.close();
console.log(passos.join('\n'));
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
