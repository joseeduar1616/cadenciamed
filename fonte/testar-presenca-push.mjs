/* O "Você está aí?" do Foco pelo servidor.
 *
 * O defeito: a pergunta dos 30 minutos era disparada pela própria página,
 * e o celular congela a página quando a pessoa troca de aplicativo. Então
 * o aviso não saía justamente com ela "mexendo em outra coisa", e o
 * cronômetro parava sem ninguém ter sido perguntado.
 *
 * Agora a página marca a hora no servidor e a batida de minuto em minuto
 * manda o push. Aqui: a regra de quando mandar, a rota de marcar e
 * desmarcar, e a batida — com banco, servidor de push e relógio de
 * mentira.
 *
 *   node testar-presenca-push.mjs
 */
const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

const P = await import('../worker/api/_push.js');

/* ── 1. a regra ──────────────────────────────────────────────────────── */
const T0 = Date.parse('2026-10-06T12:00:00Z');
const MIN = 60000;
if (P.situacaoDoAgendado({ quando: T0 + 5 * MIN }, T0) === 'esperar') ok('cinco minutos antes, a batida deixa para depois');
else falha('mandou cedo demais');
if (P.situacaoDoAgendado({ quando: T0 + 40000 }, T0) === 'enviar') ok('vencendo no próximo minuto, esta batida manda (esperando o instante)');
else falha('não pegou o que vence no próximo minuto');
if (P.situacaoDoAgendado({ quando: T0 - 30000 }, T0) === 'enviar') ok('meio minuto atrasado ainda manda: a pergunta ainda vale');
else falha('descartou um aviso que ainda valia');
if (P.situacaoDoAgendado({ quando: T0 - 61000 }, T0) === 'vencido') ok('depois do minuto da pergunta, não manda: já foi decidido');
else falha('mandou uma pergunta já expirada');
if (P.quandoValido(T0 + 30 * MIN, T0) && !P.quandoValido(T0 + 5 * 60 * MIN, T0) && !P.quandoValido(T0 - 10 * MIN, T0) && !P.quandoValido('x', T0)) {
  ok('só aceita marcar entre agora e daqui a quatro horas');
} else falha('aceitou um horário absurdo');

/* ── o mundo de mentira ──────────────────────────────────────────────── */
const BASE = 'https://firestore.googleapis.com/v1/projects/cadencia-7c1f1/databases/(default)/documents';
const banco = new Map();      // caminho completo do doc → fields
const entregas = [];
let agoraFalso = T0;

const aparelho = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const p256dh = P.paraBase64Url(await crypto.subtle.exportKey('raw', aparelho.publicKey));
const auth = P.paraBase64Url(crypto.getRandomValues(new Uint8Array(16)));
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/aparelho-de-teste';
banco.set(`${BASE}/push/uid-1/aparelhos/a1`, {
  endpoint: { stringValue: ENDPOINT }, p256dh: { stringValue: p256dh }, auth: { stringValue: auth },
});

const { generateKeyPairSync } = await import('node:crypto');
const CONTA = {
  client_email: 'teste@exemplo.iam.gserviceaccount.com',
  private_key: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }),
};
const env = { FIREBASE_API_KEY: 'k', FIREBASE_SERVICE_ACCOUNT: JSON.stringify(CONTA) };

const resp = (corpo, status = 200) => Promise.resolve(new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } }));
const valor = (v) => (v.doubleValue !== undefined ? Number(v.doubleValue) : v.integerValue !== undefined ? Number(v.integerValue) : v.stringValue);
globalThis.fetch = async (url, op = {}) => {
  const u = String(url);
  const metodo = (op.method || 'GET').toUpperCase();
  if (u.includes('identitytoolkit')) return resp({ users: [{ localId: 'uid-1', email: 'aluno@exemplo.com' }] });
  if (u.includes('oauth2.googleapis.com/token')) return resp({ access_token: 't' });
  if (u.startsWith('https://fcm.googleapis.com/')) {
    entregas.push({ url: u, headers: op.headers || {}, em: agoraFalso });
    return new Response('', { status: 201 });
  }
  if (u.endsWith(':runQuery')) {
    const q = JSON.parse(op.body).structuredQuery;
    const col = q.from[0].collectionId;
    const f = q.where && q.where.fieldFilter;
    const docs = [...banco.entries()]
      .filter(([nome]) => nome.startsWith(`${BASE}/${col}/`) && !nome.slice(`${BASE}/${col}/`.length).includes('/'))
      .filter(([, campos]) => !f || (f.op === 'LESS_THAN_OR_EQUAL' && campos[f.field.fieldPath] && valor(campos[f.field.fieldPath]) <= valor(f.value)))
      .map(([nome, fields]) => ({ document: { name: nome.replace('https://firestore.googleapis.com/v1/', ''), fields } }));
    return resp(docs.length ? docs : [{ readTime: 'x' }]);
  }
  if (u.startsWith(BASE) || u.startsWith('https://firestore.googleapis.com/v1/projects/')) {
    const caminho = decodeURIComponent((u.startsWith('https://firestore.googleapis.com/v1/projects/') && !u.startsWith(BASE)
      ? u : u).split('?')[0]);
    const cheio = caminho.startsWith('https://') ? caminho : `https://firestore.googleapis.com/v1/${caminho}`;
    if (metodo === 'PATCH') { banco.set(cheio, JSON.parse(op.body).fields); return resp({}); }
    if (metodo === 'DELETE') { banco.delete(cheio); return resp({}); }
    if (banco.has(cheio)) return resp({ name: cheio, fields: banco.get(cheio) });
    /* listar uma coleção */
    const filhos = [...banco.entries()].filter(([n]) => n.startsWith(cheio + '/') && !n.slice(cheio.length + 1).includes('/'));
    if (filhos.length) return resp({ documents: filhos.map(([n, fields]) => ({ name: n.replace('https://firestore.googleapis.com/v1/', ''), fields })) });
    return resp({}, 404);
  }
  throw new Error('fetch inesperado: ' + u);
};

const { onRequest, enviarAgendados } = await import('../worker/api/push.js');
const pedir = async (corpo) => {
  const res = await onRequest({ request: new Request('http://x/api/push', { method: 'POST', body: JSON.stringify({ token: 'tk', ...corpo }) }), env });
  return { status: res.status, corpo: await res.json() };
};
const agendado = () => banco.get(`${BASE}/avisosAgendados/uid-1_foco`);

/* ── 2. marcar e desmarcar ──────────────────────────────────────────── */
const Dnow = Date.now;
Date.now = () => agoraFalso;
let r = await pedir({ acao: 'agendar', origem: 'foco', quando: T0 + 30 * MIN, corpo: 'O cronômetro do Foco para em 1 minuto.' });
if (r.status === 200 && agendado() && valor(agendado().quando) === T0 + 30 * MIN) ok('a página marca no servidor o instante da pergunta');
else falha('agendar: ' + JSON.stringify(r));
r = await pedir({ acao: 'agendar', origem: 'foco', quando: T0 + 45 * MIN, corpo: 'x' });
if ([...banco.keys()].filter((k) => k.includes('/avisosAgendados/')).length === 1 && valor(agendado().quando) === T0 + 45 * MIN) {
  ok('cada sinal de vida remarca o MESMO aviso, sem empilhar');
} else falha('remarcar criou outro aviso');
r = await pedir({ acao: 'agendar', origem: 'foco', quando: T0 + 10 * 60 * MIN });
if (r.status === 400) ok('horário absurdo é recusado');
else falha('aceitou marcar para daqui a 10 horas');
r = await pedir({ acao: 'agendar', origem: 'outra', quando: T0 + 30 * MIN });
if (r.status === 400) ok('origem desconhecida é recusada');
else falha('aceitou origem inventada');
r = await pedir({ acao: 'cancelar', origem: 'foco' });
if (r.status === 200 && !agendado()) ok('pausar ou parar desmarca o aviso');
else falha('cancelar não apagou');
r = await pedir({ acao: 'agendar', origem: 'foco', quando: T0 + 30 * MIN, token: '' });
if (r.status === 403) ok('sem conta, não marca nada');
else falha('marcou sem conta');

/* ── 3. a batida ────────────────────────────────────────────────────── */
await pedir({ acao: 'agendar', origem: 'foco', quando: T0 + 30 * MIN, corpo: 'O cronômetro do Foco para em 1 minuto.' });
let esperouAte = 0;
const esperar = async (t) => { esperouAte = t; agoraFalso = t; };

agoraFalso = T0 + 20 * MIN;
let b = await enviarAgendados(env, agoraFalso, { esperar });
if (!entregas.length && agendado()) ok('a batida de dez minutos antes não manda nem apaga');
else falha('a batida adiantada mexeu no aviso: ' + JSON.stringify(b));

agoraFalso = T0 + 29 * MIN + 20000;
b = await enviarAgendados(env, agoraFalso, { esperar });
if (entregas.length === 1) ok('a batida do minuto da pergunta manda o push');
else falha('não mandou: ' + JSON.stringify(b));
if (esperouAte === T0 + 30 * MIN && entregas[0] && entregas[0].em === T0 + 30 * MIN) ok('esperando o instante exato dos 30 minutos, e não o começo do minuto');
else falha('mandou fora da hora: ' + (entregas[0] && entregas[0].em - T0));
if (entregas[0] && entregas[0].headers.TTL === '60' && entregas[0].headers.Urgency === 'high') {
  ok('com urgência alta (o Android entrega na hora) e validade de um minuto (não chega depois de expirar)');
} else falha('cabeçalhos: ' + JSON.stringify(entregas[0] && entregas[0].headers));
if (!agendado()) ok('e apaga o aviso, para a próxima batida não mandar de novo');
else falha('o aviso ficou no banco depois de mandado');
b = await enviarAgendados(env, agoraFalso + MIN, { esperar });
if (entregas.length === 1) ok('a batida seguinte não repete');
else falha('mandou duas vezes');

/* Atrasado demais: a pergunta já expirou, e o push só confundiria. */
await pedir({ acao: 'agendar', origem: 'foco', quando: agoraFalso + 30000, corpo: 'x' });
agoraFalso += 30000 + 2 * MIN;
b = await enviarAgendados(env, agoraFalso, { esperar });
if (entregas.length === 1 && !agendado()) ok('aviso perdido por uma batida que falhou é descartado, não chega atrasado');
else falha('mandou aviso vencido');

Date.now = Dnow;

/* ── 4. o service worker trata o aviso como "Você está aí?" ──────────── */
{
  const fs = await import('node:fs');
  const sw = fs.readFileSync(new URL('./sw.js', import.meta.url), 'utf8');
  if (/aviso\.tipo === "presenca"/.test(sw) && /requireInteraction: true/.test(sw) && /Estou aqui/.test(sw)) {
    ok('o service worker mostra o push com o botão "Estou aqui"');
  } else falha('o service worker não trata o push de presença');
  if (/openWindow\(`\/\?presenca=\$\{em\}`\)/.test(sw)) ok('e, sem aba viva, reabre o site levando a hora da resposta');
  else falha('a resposta se perde quando o celular descartou a página');
  const p = fs.readFileSync(new URL('../worker/api/push.js', import.meta.url), 'utf8');
  if (/tipo: "presenca"/.test(p)) ok('o servidor manda o push marcado como presença');
  else falha('o push vai sem a marca de presença');
  const w = fs.readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
  if (/"\* \* \* \* \*"/.test(w)) ok('a batida de minuto em minuto está ligada no wrangler');
  else falha('falta a batida de minuto em minuto no wrangler.jsonc');
}

console.log(passos.join('\n'));
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
