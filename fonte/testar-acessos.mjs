/* Testa o painel de acessos, sem tocar no Firebase.
 *
 * O aviso de compra tem teste próprio, no testar-compra.mjs: manter os dois
 * aqui deixava duas versões da mesma regra, e foi assim que a exigência do
 * WEBHOOK_SEGREDO passou a ser afirmada num arquivo e negada no outro.
 *
 * Rodam contra os arquivos que vão para o ar (worker/api/). São as duas
 * funções que gravam assinatura, então valem teste próprio: um engano aqui
 * libera acesso pago para quem não pagou, ou deixa de liberar para quem pagou.
 *
 *   node testar-acessos.mjs
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

let QUEM = { email: 'joseeduardo1616@gmail.com', localId: 'uid-dono' };
let UID_DO_EMAIL = 'uid-aluna';   // o que a busca por e-mail encontra
let GRAVADO = null;
let APAGADO = null;
let LISTA = [];
let MENTORES = {};   // uid -> { fields }, para o "conceder-mentor"

const json = (corpo, status = 200) => new Response(JSON.stringify(corpo),
  { status, headers: { 'Content-Type': 'application/json' } });

globalThis.fetch = async (url, opcoes = {}) => {
  const u = String(url);
  const metodo = opcoes.method || 'GET';
  if (u.includes('identitytoolkit.googleapis.com')) {
    return QUEM ? json({ users: [QUEM] }) : json({ error: {} }, 400);
  }
  if (u.includes('oauth2.googleapis.com/token')) return json({ access_token: 'token-falso' });
  if (u.includes(':runQuery')) {
    return UID_DO_EMAIL
      ? json([{ document: { name: `projects/x/databases/(default)/documents/emails/${UID_DO_EMAIL}` } }])
      : json([{}]);
  }
  if (u.includes('/assinaturas')) {
    if (metodo === 'DELETE') { APAGADO = u; return json({}); }
    if (metodo === 'PATCH') { GRAVADO = JSON.parse(opcoes.body); return json({ name: 'ok' }); }
    if (u.includes('pageSize')) return json({ documents: LISTA });
    return json({ error: {} }, 404);
  }
  const m = /\/mentores\/([^/?]+)(?:\?|$)/.exec(u);
  if (m) {
    const uid = m[1];
    if (metodo === 'GET') return MENTORES[uid] ? json(MENTORES[uid]) : json({ error: {} }, 404);
    MENTORES[uid] = JSON.parse(opcoes.body);
    return json({ name: uid });
  }
  throw new Error('chamada inesperada: ' + u);
};

const env = { FIREBASE_API_KEY: 'k', FIREBASE_SERVICE_ACCOUNT: JSON.stringify(CONTA) };

const chamarAcessos = async (corpo, metodo = 'POST') => {
  const { onRequest } = await import('../worker/api/acessos.js?v=' + Math.random());
  const res = await onRequest({
    request: new Request('http://local/api/acessos', {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      ...(metodo === 'POST' ? { body: JSON.stringify(corpo) } : {}),
    }),
    env,
  });
  return { status: res.status, corpo: await res.json() };
};

/* ══ painel de acessos ═════════════════════════════════════════════════ */

/* só o dono entra */
QUEM = { email: 'aluna@email.com', localId: 'uid-aluna' };
let r = await chamarAcessos({ token: 't', acao: 'listar' });
if (r.status === 403 && /conta do dono/.test(r.corpo.erro)) ok('quem não é dono não abre o painel de acessos');
else falha('estranho no painel: ' + JSON.stringify(r));

QUEM = null;
r = await chamarAcessos({ token: 't', acao: 'listar' });
if (r.status === 401) ok('sessão inválida não abre o painel');
else falha('sessão inválida: ' + JSON.stringify(r));

QUEM = { email: 'joseeduardo1616@gmail.com', localId: 'uid-dono' };

/* listar */
LISTA = [
  { name: 'p/d/assinaturas/uid1', fields: { email: { stringValue: 'a@x.com' }, plano: { stringValue: 'anual' }, validoAte: { doubleValue: Date.now() + 1000 }, cortesia: { booleanValue: true } } },
  { name: 'p/d/assinaturas/uid2', fields: { email: { stringValue: 'b@x.com' }, plano: { stringValue: 'mensal' }, validoAte: { doubleValue: Date.now() + 9e9 } } },
];
r = await chamarAcessos({ token: 't', acao: 'listar' });
if (r.status === 200 && r.corpo.lista.length === 2) ok('o dono lista quem tem acesso');
else falha('listar: ' + JSON.stringify(r));
if (r.corpo.lista[0].email === 'b@x.com') ok('a lista vem do prazo mais longo para o mais curto');
else falha('ordem da lista: ' + JSON.stringify(r.corpo.lista.map((x) => x.email)));

/* liberar */
GRAVADO = null;
r = await chamarAcessos({ token: 't', acao: 'liberar', email: 'Aluna@Email.com', plano: 'anual' });
if (r.corpo.ok && GRAVADO.fields.plano.stringValue === 'anual') ok('o dono libera acesso por e-mail');
else falha('liberar: ' + JSON.stringify(r));
if (GRAVADO.fields.email.stringValue === 'aluna@email.com') ok('o e-mail é guardado em minúsculas');
else falha('e-mail não normalizado: ' + JSON.stringify(GRAVADO.fields.email));
if (GRAVADO.fields.liberadoPor.stringValue === 'joseeduardo1616@gmail.com') ok('fica registrado quem liberou');
else falha('sem liberadoPor');

/* e-mail sem conta: 404 com explicação, que é o que o painel mostra */
UID_DO_EMAIL = null;
r = await chamarAcessos({ token: 't', acao: 'liberar', email: 'ninguem@x.com' });
if (r.status === 404 && /precisa criar a conta/.test(r.corpo.erro)) ok('e-mail sem conta explica o que fazer');
else falha('e-mail sem conta: ' + JSON.stringify(r));
UID_DO_EMAIL = 'uid-aluna';

/* revogar */
APAGADO = null;
r = await chamarAcessos({ token: 't', acao: 'revogar', email: 'aluna@email.com' });
if (r.corpo.ok && APAGADO && APAGADO.includes('uid-aluna')) ok('o dono revoga acesso');
else falha('revogar: ' + JSON.stringify(r));

/* ── conceder o papel de mentor ────────────────────────────────────────
   Mesmo caminho do cupom "mentor1612" (concederMentor, em _comum.js), só
   que iniciado pelo dono, com o e-mail de quem ele escolher. */
MENTORES = {};
r = await chamarAcessos({ token: 't', acao: 'conceder-mentor', email: 'Aluna@Email.com' });
if (r.corpo.ok && /agora é mentor/.test(r.corpo.mensagem)) ok('o dono concede o papel de mentor por e-mail');
else falha('conceder-mentor: ' + JSON.stringify(r));
if (MENTORES['uid-aluna'] && MENTORES['uid-aluna'].fields.email.stringValue === 'aluna@email.com') {
  ok('o e-mail concedido fica gravado em minúsculas, no documento do mentor');
} else falha('documento do mentor: ' + JSON.stringify(MENTORES));

/* quem não é dono não concede mentor nenhum — mesma regra de "liberar" */
QUEM = { email: 'aluna@email.com', localId: 'uid-aluna' };
r = await chamarAcessos({ token: 't', acao: 'conceder-mentor', email: 'outra@x.com' });
if (r.status === 403) ok('quem não é dono não concede o papel de mentor');
else falha('conceder-mentor sem ser dono: ' + JSON.stringify(r));
QUEM = { email: 'joseeduardo1616@gmail.com', localId: 'uid-dono' };

/* conceder de novo não apaga os alunos que a pessoa já tinha */
MENTORES['uid-aluna'].fields.alunos = { arrayValue: { values: [{ mapValue: { fields: { uid: { stringValue: 'x' }, email: { stringValue: 'x@x.com' }, adicionadoEm: { doubleValue: 1 } } } }] } };
r = await chamarAcessos({ token: 't', acao: 'conceder-mentor', email: 'aluna@email.com' });
if (r.corpo.ok && (MENTORES['uid-aluna'].fields.alunos.arrayValue.values || []).length === 1) {
  ok('conceder o papel de novo preserva os alunos que já tinham sido adicionados');
} else falha('conceder de novo apagou os alunos: ' + JSON.stringify(MENTORES['uid-aluna']));

r = await chamarAcessos({}, 'GET');
if (r.status === 405) ok('o painel só aceita POST');
else falha('método: ' + JSON.stringify(r));

console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
