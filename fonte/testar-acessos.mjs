/* Testa o painel de acessos e o aviso de compra, sem tocar no Firebase.
 *
 * Rodam contra os arquivos do Cloudflare Pages (functions/api/). São as duas
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
  throw new Error('chamada inesperada: ' + u);
};

const env = { FIREBASE_API_KEY: 'k', FIREBASE_SERVICE_ACCOUNT: JSON.stringify(CONTA) };

const chamarAcessos = async (corpo, metodo = 'POST') => {
  const { onRequest } = await import('../functions/api/acessos.js?v=' + Math.random());
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

r = await chamarAcessos({}, 'GET');
if (r.status === 405) ok('o painel só aceita POST');
else falha('método: ' + JSON.stringify(r));

/* ══ aviso de compra ═══════════════════════════════════════════════════ */

const chamarCompra = async (corpo, busca = '') => {
  const { onRequest } = await import('../functions/api/compra.js?v=' + Math.random());
  const res = await onRequest({
    request: new Request('http://local/api/compra' + busca, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    }),
    env,
  });
  return { status: res.status, texto: await res.text() };
};

const KIWIFY_PAGO = { Customer: { email: 'compradora@x.com' }, order_status: 'paid', Product: { product_name: 'Plano Anual' } };

/* sem segredo cadastrado, aceita (é o estado de quem ainda não configurou) */
delete env.WEBHOOK_SEGREDO;
GRAVADO = null;
let c = await chamarCompra(KIWIFY_PAGO);
if (c.status === 200 && GRAVADO && GRAVADO.fields.plano.stringValue === 'anual') ok('compra da Kiwify libera o plano anual');
else falha('kiwify: ' + JSON.stringify(c) + ' ' + JSON.stringify(GRAVADO));
if (GRAVADO.fields.cortesia.booleanValue === false) ok('compra paga não é marcada como cortesia');
else falha('compra marcada como cortesia');

/* com segredo cadastrado, recusa quem não manda o segredo certo */
env.WEBHOOK_SEGREDO = 'abre-te-sesamo';
GRAVADO = null;
c = await chamarCompra(KIWIFY_PAGO);
if (c.status === 401) ok('sem o segredo, o aviso de compra é recusado');
else falha('sem segredo: ' + JSON.stringify(c));
if (GRAVADO === null) ok('aviso recusado não grava nada');
else falha('gravou mesmo recusando');

c = await chamarCompra(KIWIFY_PAGO, '?segredo=errado');
if (c.status === 401) ok('segredo errado é recusado');
else falha('segredo errado: ' + JSON.stringify(c));

GRAVADO = null;
c = await chamarCompra(KIWIFY_PAGO, '?segredo=abre-te-sesamo');
if (c.status === 200 && GRAVADO) ok('com o segredo certo, a compra passa');
else falha('segredo certo: ' + JSON.stringify(c));
delete env.WEBHOOK_SEGREDO;

/* Hotmart */
GRAVADO = null;
c = await chamarCompra({ event: 'PURCHASE_APPROVED', data: { buyer: { email: 'h@x.com' }, product: { name: 'Assinatura Mensal' } } });
if (c.status === 200 && GRAVADO.fields.plano.stringValue === 'mensal') ok('compra da Hotmart libera o plano mensal');
else falha('hotmart: ' + JSON.stringify(c));

/* eventos que não são compra aprovada não liberam nada */
GRAVADO = null;
c = await chamarCompra({ event: 'PURCHASE_REFUNDED', data: { buyer: { email: 'h@x.com' } } });
if (c.status === 200 && GRAVADO === null) ok('estorno não libera acesso');
else falha('estorno: ' + JSON.stringify(c) + ' ' + JSON.stringify(GRAVADO));

GRAVADO = null;
c = await chamarCompra({ Customer: { email: 'x@x.com' }, order_status: 'waiting_payment' });
if (c.status === 200 && GRAVADO === null) ok('pagamento pendente não libera acesso');
else falha('pendente: ' + JSON.stringify(c));

/* compra de quem ainda não criou conta no site */
UID_DO_EMAIL = null;
GRAVADO = null;
c = await chamarCompra(KIWIFY_PAGO);
if (c.status === 200 && GRAVADO === null) ok('compra sem conta correspondente não quebra o webhook');
else falha('compra sem conta: ' + JSON.stringify(c));
UID_DO_EMAIL = 'uid-aluna';

console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
