/* Testa o resgate de cupom sem tocar no Firebase de verdade.
 *
 * Roda contra o arquivo que vai para o ar (worker/api/cupom.js).
 *
 * A identidade e o banco são respondidos aqui mesmo, então dá para
 * exercitar cupom certo, cupom errado, sessão inválida e quem já tem plano.
 *
 *   node testar-cupom.mjs
 */
const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

/* Uma chave privada de teste, gerada na hora. Não é segredo de nada: serve
   só para o assinador RSA da função ter algo válido para assinar. */
const { generateKeyPairSync } = await import('node:crypto');
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const CONTA = {
  client_email: 'teste@exemplo.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
};

let QUEM = { email: 'aluna@email.com', localId: 'uid-aluna' };
let PLANO_ATUAL = null;          // o que o banco já tem para esse uid
let GRAVADO = null;              // o que a função tentou gravar
let FALHAR_GRAVACAO = false;

const json = (corpo, status = 200) => new Response(JSON.stringify(corpo),
  { status, headers: { 'Content-Type': 'application/json' } });

globalThis.fetch = async (url, opcoes = {}) => {
  const u = String(url);
  if (u.includes('identitytoolkit.googleapis.com')) {
    return QUEM ? json({ users: [QUEM] }) : json({ error: {} }, 400);
  }
  if (u.includes('oauth2.googleapis.com/token')) {
    return json({ access_token: 'token-falso' });
  }
  if (u.includes('firestore.googleapis.com')) {
    if ((opcoes.method || 'GET') === 'GET') {
      if (!PLANO_ATUAL) return json({ error: {} }, 404);
      return json({ fields: { validoAte: { doubleValue: PLANO_ATUAL } } });
    }
    if (FALHAR_GRAVACAO) return json({ error: {} }, 500);
    GRAVADO = JSON.parse(opcoes.body);
    return json({ name: 'ok' });
  }
  throw new Error('chamada inesperada: ' + u);
};

const env = {};
const carregar = async () => (await import('../worker/api/cupom.js?v=' + Math.random())).onRequest;
const pedir = async (corpo, metodo = 'POST') => {
  const fn = await carregar();
  const res = await fn({
    request: new Request('http://local/api/cupom', {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      ...(metodo === 'POST' ? { body: JSON.stringify(corpo) } : {}),
    }),
    env,
  });
  return { status: res.status, corpo: await res.json() };
};

env.FIREBASE_API_KEY = 'chave-firebase';
env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify(CONTA);
delete env.CUPONS;

/* ── os dois cupons combinados funcionam ─────────────────────────────── */
for (const cod of ['secdamocada', 'medeasysoft']) {
  GRAVADO = null; PLANO_ATUAL = null;
  const r = await pedir({ token: 't', codigo: cod });
  if (r.status === 200 && r.corpo.ok) ok(`cupom "${cod}" libera o acesso`);
  else falha(`cupom "${cod}": ` + JSON.stringify(r));
  const f = GRAVADO && GRAVADO.fields;
  if (f && f.plano.stringValue === 'anual') ok(`"${cod}" grava plano anual`);
  else falha(`"${cod}" gravou: ` + JSON.stringify(GRAVADO));
  if (f && f.validoAte.doubleValue > Date.now() + 300 * 86400000) ok(`"${cod}" vale por cerca de um ano`);
  else falha(`"${cod}" prazo errado`);
  if (f && f.email.stringValue === 'aluna@email.com') ok(`"${cod}" guarda o e-mail de quem resgatou`);
  else falha(`"${cod}" sem e-mail`);
}

/* maiúsculas e espaços não podem atrapalhar quem digita */
GRAVADO = null;
let r = await pedir({ token: 't', codigo: '  SecDaMoCada  ' });
if (r.corpo.ok) ok('o código não diferencia maiúscula nem espaço em volta');
else falha('maiúsculas: ' + JSON.stringify(r));

/* ── recusas ─────────────────────────────────────────────────────────── */
GRAVADO = null;
r = await pedir({ token: 't', codigo: 'naoexiste' });
if (r.status === 404 && /inválido/i.test(r.corpo.erro)) ok('cupom errado é recusado');
else falha('cupom errado: ' + JSON.stringify(r));
if (GRAVADO === null) ok('cupom errado não grava nada no banco');
else falha('cupom errado gravou algo');

r = await pedir({ token: 't', codigo: '' });
if (r.status === 400) ok('cupom vazio é recusado');
else falha('cupom vazio: ' + JSON.stringify(r));

QUEM = null;
r = await pedir({ token: 't', codigo: 'secdamocada' });
if (r.status === 401 && /Entre na sua conta/.test(r.corpo.erro)) ok('sem sessão válida, o cupom não passa');
else falha('sessão inválida: ' + JSON.stringify(r));
QUEM = { email: 'aluna@email.com', localId: 'uid-aluna' };

r = await pedir({ codigo: 'secdamocada' });
if (r.status === 401) ok('sem token, o cupom não passa');
else falha('sem token: ' + JSON.stringify(r));

r = await pedir({}, 'GET');
if (r.status === 405) ok('só aceita POST');
else falha('método: ' + JSON.stringify(r));

/* ── quem já tem plano em dia não gasta o cupom ──────────────────────── */
GRAVADO = null;
PLANO_ATUAL = Date.now() + 60 * 86400000;
r = await pedir({ token: 't', codigo: 'secdamocada' });
if (r.corpo.ok && r.corpo.jaTinha) ok('quem já tem plano em dia recebe aviso em vez de regravar');
else falha('plano em dia: ' + JSON.stringify(r));
if (GRAVADO === null) ok('plano em dia não é sobrescrito');
else falha('sobrescreveu um plano em dia');

/* plano vencido pode ser renovado pelo cupom */
GRAVADO = null;
PLANO_ATUAL = Date.now() - 86400000;
r = await pedir({ token: 't', codigo: 'secdamocada' });
if (r.corpo.ok && !r.corpo.jaTinha && GRAVADO) ok('plano vencido é renovado pelo cupom');
else falha('plano vencido: ' + JSON.stringify(r));
PLANO_ATUAL = null;

/* ── configuração pela variável de ambiente ──────────────────────────── */
env.CUPONS = 'turma2026:mensal,vip:vitalicio';
GRAVADO = null;
r = await pedir({ token: 't', codigo: 'turma2026' });
if (r.corpo.ok && GRAVADO.fields.plano.stringValue === 'mensal') ok('CUPONS troca a lista sem mexer no código');
else falha('CUPONS: ' + JSON.stringify(r));
r = await pedir({ token: 't', codigo: 'secdamocada' });
if (r.status === 404) ok('com CUPONS cadastrada, os cupons padrão deixam de valer');
else falha('CUPONS não substituiu os padrão: ' + JSON.stringify(r));
delete env.CUPONS;

/* ── falhas de configuração e de banco ───────────────────────────────── */
delete env.FIREBASE_SERVICE_ACCOUNT;
r = await pedir({ token: 't', codigo: 'secdamocada' });
if (r.status === 500 && /FIREBASE_SERVICE_ACCOUNT/.test(r.corpo.erro)) ok('sem conta de serviço, explica o que falta');
else falha('sem conta de serviço: ' + JSON.stringify(r));
env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify(CONTA);

FALHAR_GRAVACAO = true;
r = await pedir({ token: 't', codigo: 'secdamocada' });
if (r.status === 500 && !r.corpo.ok) ok('falha ao gravar não vira falso positivo');
else falha('falha de gravação: ' + JSON.stringify(r));
FALHAR_GRAVACAO = false;

console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
