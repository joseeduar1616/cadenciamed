/* Testa a conferência de plano sem tocar no Firebase de verdade.
 *
 * Esta rota existe por um motivo específico: quando as regras publicadas do
 * Firestore não liberam a leitura de assinaturas/{uid}, o navegador é
 * recusado em silêncio e quem tem cupom vê a tela de pagamento. Aqui quem
 * lê é a conta de serviço, que passa por cima das regras — então o teste
 * mais importante é o que prova que a resposta não depende delas.
 *
 *   node testar-plano.mjs
 */
const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

const { generateKeyPairSync } = await import('node:crypto');
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const CONTA = {
  client_email: 'teste@exemplo.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
};

let ASSINATURAS = {};      // uid -> { fields }
let QUEM = { email: 'ana@email.com', localId: 'uid-ana' };
let ERRO_BANCO = 0;        // status para forçar falha do Firestore

const json = (corpo, status = 200) => new Response(JSON.stringify(corpo),
  { status, headers: { 'Content-Type': 'application/json' } });

globalThis.fetch = async (url) => {
  const u = String(url);
  if (u.includes('identitytoolkit.googleapis.com')) {
    return QUEM ? json({ users: [QUEM] }) : json({ error: {} }, 400);
  }
  if (u.includes('oauth2.googleapis.com/token')) return json({ access_token: 'token-falso' });

  const m = /\/documents\/assinaturas\/([^/?]+)/.exec(u);
  if (m) {
    if (ERRO_BANCO) return json({ error: {} }, ERRO_BANCO);
    return ASSINATURAS[m[1]] ? json(ASSINATURAS[m[1]]) : json({ error: {} }, 404);
  }
  throw new Error('chamada inesperada: ' + u);
};

const env = { FIREBASE_API_KEY: 'chave', FIREBASE_SERVICE_ACCOUNT: JSON.stringify(CONTA) };
const mod = await import('../worker/api/plano.js');

const pedir = async (corpo, metodo = 'POST') => {
  const res = await mod.onRequest({
    request: new Request('http://local/api/plano', {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      ...(metodo === 'POST' ? { body: JSON.stringify(corpo) } : {}),
    }),
    env,
  });
  return { status: res.status, corpo: await res.json() };
};

const como = (email, uid) => { QUEM = { email, localId: uid }; };
const assinar = (uid, ate, plano = 'anual') => {
  ASSINATURAS[uid] = {
    fields: {
      plano: { stringValue: plano },
      validoAte: { doubleValue: ate },
      cortesia: { booleanValue: true },
    },
  };
};

/* ── sem assinatura ──────────────────────────────────────────────────── */
let r = await pedir({ token: 't' });
if (r.status === 200 && r.corpo.pro === false) ok('conta sem assinatura responde "sem plano", e não erro');
else falha('sem assinatura: ' + JSON.stringify(r));

/* ── com cupom em dia ────────────────────────────────────────────────── */
assinar('uid-ana', Date.now() + 86400000 * 300);
r = await pedir({ token: 't' });
if (r.corpo.pro && r.corpo.plano === 'anual') ok('quem resgatou cupom aparece com o plano liberado');
else falha('com cupom: ' + JSON.stringify(r.corpo));
if (r.corpo.cortesia) ok('a cortesia vem marcada, para a tela saber que não foi compra');
else falha('cortesia não veio');

/* ── vencida ─────────────────────────────────────────────────────────── */
assinar('uid-ana', Date.now() - 86400000);
r = await pedir({ token: 't' });
if (!r.corpo.pro) ok('assinatura vencida não libera');
else falha('vencida liberou: ' + JSON.stringify(r.corpo));

/* ── o banco fora do ar ──────────────────────────────────────────────── */
/* Responder "sem plano" aqui mandaria para a tela de pagamento quem já
   pagou. É melhor a tela dizer que não deu para conferir. */
assinar('uid-ana', Date.now() + 86400000 * 300);
ERRO_BANCO = 500;
r = await pedir({ token: 't' });
if (r.status === 502 && !('pro' in r.corpo)) ok('banco fora do ar vira erro, e não um "sem plano" mentiroso');
else falha('banco com erro: ' + JSON.stringify(r));
ERRO_BANCO = 0;

/* ── o dono ──────────────────────────────────────────────────────────── */
como('joseeduardo1616@gmail.com', 'uid-dono');
r = await pedir({ token: 't' });
if (r.corpo.pro && r.corpo.plano === 'dono') ok('o dono tem acesso sem assinatura gravada');
else falha('dono: ' + JSON.stringify(r.corpo));
como('ana@email.com', 'uid-ana');

/* ── cada um vê o próprio plano ──────────────────────────────────────── */
assinar('uid-bia', Date.now() + 86400000 * 300);
delete ASSINATURAS['uid-ana'];
r = await pedir({ token: 't' });
if (!r.corpo.pro) ok('a assinatura de outra pessoa não libera a minha conta');
else falha('plano vazou entre contas: ' + JSON.stringify(r.corpo));

/* ── recusas gerais ──────────────────────────────────────────────────── */
QUEM = null;
r = await pedir({ token: 't' });
if (r.status === 401) ok('sem sessão válida, não responde');
else falha('sessão inválida: ' + JSON.stringify(r));
como('ana@email.com', 'uid-ana');

r = await pedir({}, 'GET');
if (r.status === 405) ok('só aceita POST');
else falha('método: ' + JSON.stringify(r));

delete env.FIREBASE_SERVICE_ACCOUNT;
r = await pedir({ token: 't' });
if (r.status === 500 && /FIREBASE_SERVICE_ACCOUNT/.test(r.corpo.erro)) ok('sem conta de serviço, explica o que falta');
else falha('sem conta de serviço: ' + JSON.stringify(r));
env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify(CONTA);

console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
