/* Testa o aviso de compra sem tocar no Firebase nem nas plataformas.
 *
 * Roda contra o arquivo que vai para o ar (worker/api/compra.js). É a rota
 * que libera assinatura paga, então os dois casos que mais importam são
 * "quem não deveria consegue liberar?" e "quem pediu estorno perde o
 * acesso?".
 *
 *   node testar-compra.mjs
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

let CONTA_EXISTE = true;
let GRAVADO = null;
let APAGADO = null;

const json = (corpo, status = 200) => new Response(JSON.stringify(corpo),
  { status, headers: { 'Content-Type': 'application/json' } });

globalThis.fetch = async (url, opcoes = {}) => {
  const u = String(url);
  if (u.includes('oauth2.googleapis.com/token')) return json({ access_token: 'token-falso' });
  if (u.includes(':runQuery')) {
    return json(CONTA_EXISTE
      ? [{ document: { name: 'p/documents/emails/uid-comprador', fields: {} } }]
      : [{ readTime: 'agora' }]);
  }
  const m = /\/documents\/assinaturas\/([^/?]+)/.exec(u);
  if (m) {
    if ((opcoes.method || 'GET') === 'DELETE') { APAGADO = m[1]; return json({}); }
    GRAVADO = JSON.parse(opcoes.body);
    return json({ name: m[1] });
  }
  throw new Error('chamada inesperada: ' + u);
};

const env = { FIREBASE_SERVICE_ACCOUNT: JSON.stringify(CONTA), WEBHOOK_SEGREDO: 'segredo-do-webhook' };
const { onRequest } = await import('../worker/api/compra.js');

const avisar = async (corpo, { segredo = 'segredo-do-webhook', metodo = 'POST' } = {}) => {
  GRAVADO = null; APAGADO = null;
  const endereco = 'https://cadenciamed.com.br/api/compra'
    + (segredo === null ? '' : `?segredo=${encodeURIComponent(segredo)}`);
  const res = await onRequest({
    request: new Request(endereco, {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      ...(metodo === 'POST' ? { body: JSON.stringify(corpo) } : {}),
    }),
    env,
  });
  return { status: res.status, texto: await res.text() };
};

const KIWIFY_PAGO = {
  order_status: 'paid',
  Customer: { email: 'comprador@email.com' },
  Product: { product_name: 'Cadência Med Mensal' },
};
const HOTMART_PAGO = {
  event: 'PURCHASE_APPROVED',
  data: { buyer: { email: 'comprador@email.com' }, product: { name: 'Cadência Med Anual' } },
};

/* ── sem segredo cadastrado, a rota não pode liberar nada ────────────── */
delete env.WEBHOOK_SEGREDO;
let r = await avisar(KIWIFY_PAGO, { segredo: null });
if (r.status === 500 && /WEBHOOK_SEGREDO/.test(r.texto)) ok('sem WEBHOOK_SEGREDO cadastrado, o aviso é recusado e diz o que falta');
else falha('sem segredo cadastrado: ' + JSON.stringify(r));
if (GRAVADO === null) ok('sem WEBHOOK_SEGREDO, nada é gravado');
else falha('LIBEROU ASSINATURA SEM SEGREDO: ' + JSON.stringify(GRAVADO));
env.WEBHOOK_SEGREDO = 'segredo-do-webhook';

/* ── segredo errado ou ausente na chamada ────────────────────────────── */
r = await avisar(KIWIFY_PAGO, { segredo: 'chute' });
if (r.status === 401 && GRAVADO === null) ok('segredo errado é recusado sem gravar');
else falha('segredo errado: ' + JSON.stringify(r));

r = await avisar(KIWIFY_PAGO, { segredo: null });
if (r.status === 401 && GRAVADO === null) ok('chamada sem segredo é recusada sem gravar');
else falha('sem segredo na chamada: ' + JSON.stringify(r));

r = await avisar({}, { metodo: 'GET' });
if (r.status === 405) ok('só aceita POST');
else falha('método: ' + JSON.stringify(r));

/* ── compra aprovada libera ──────────────────────────────────────────── */
r = await avisar(KIWIFY_PAGO);
if (r.status === 200 && GRAVADO) ok('Kiwify: compra aprovada libera a assinatura');
else falha('Kiwify pago: ' + JSON.stringify(r));
if (GRAVADO && GRAVADO.fields.plano.stringValue === 'mensal') ok('Kiwify: produto mensal vira plano mensal');
else falha('Kiwify plano: ' + JSON.stringify(GRAVADO));
if (GRAVADO && GRAVADO.fields.cortesia.booleanValue === false) ok('compra paga não é marcada como cortesia');
else falha('cortesia errada: ' + JSON.stringify(GRAVADO));

r = await avisar(HOTMART_PAGO);
if (r.status === 200 && GRAVADO && GRAVADO.fields.plano.stringValue === 'anual') ok('Hotmart: produto anual vira plano anual');
else falha('Hotmart pago: ' + JSON.stringify(r) + ' ' + JSON.stringify(GRAVADO));
if (GRAVADO && GRAVADO.fields.validoAte.doubleValue > Date.now() + 300 * 86400000) ok('o anual vale por cerca de um ano');
else falha('prazo do anual: ' + JSON.stringify(GRAVADO));

/* ── estorno tira o acesso ───────────────────────────────────────────── */
r = await avisar({ ...KIWIFY_PAGO, order_status: 'refunded' });
if (APAGADO === 'uid-comprador') ok('Kiwify: reembolso remove a assinatura');
else falha('reembolso Kiwify: ' + JSON.stringify(r) + ' apagado=' + APAGADO);
if (GRAVADO === null) ok('reembolso não regrava a assinatura por engano');
else falha('reembolso gravou: ' + JSON.stringify(GRAVADO));

r = await avisar({ event: 'PURCHASE_REFUNDED', data: { buyer: { email: 'comprador@email.com' }, product: {} } });
if (APAGADO === 'uid-comprador') ok('Hotmart: reembolso remove a assinatura');
else falha('reembolso Hotmart: ' + JSON.stringify(r));

r = await avisar({ ...KIWIFY_PAGO, order_status: 'chargeback' });
if (APAGADO === 'uid-comprador') ok('chargeback também remove a assinatura');
else falha('chargeback: ' + JSON.stringify(r));

/* ── eventos que não interessam ──────────────────────────────────────── */
r = await avisar({ ...KIWIFY_PAGO, order_status: 'waiting_payment' });
if (r.status === 200 && GRAVADO === null && APAGADO === null) ok('pagamento pendente não libera nada');
else falha('pendente: ' + JSON.stringify(r) + ' ' + JSON.stringify(GRAVADO));

r = await avisar({ alguma: 'coisa' });
if (r.status === 200 && GRAVADO === null) ok('formato desconhecido é aceito sem gravar, para a plataforma não ficar reenviando');
else falha('formato desconhecido: ' + JSON.stringify(r));

/* ── comprador sem conta no site ─────────────────────────────────────── */
CONTA_EXISTE = false;
r = await avisar(KIWIFY_PAGO);
if (r.status === 200 && GRAVADO === null) ok('compra de quem ainda não criou conta não quebra o webhook');
else falha('sem conta: ' + JSON.stringify(r));
CONTA_EXISTE = true;

/* ── configuração incompleta ─────────────────────────────────────────── */
delete env.FIREBASE_SERVICE_ACCOUNT;
r = await avisar(KIWIFY_PAGO);
if (r.status === 500 && /conta de serviço/.test(r.texto)) ok('sem conta de serviço, explica o que falta');
else falha('sem conta de serviço: ' + JSON.stringify(r));
env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify(CONTA);

console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
