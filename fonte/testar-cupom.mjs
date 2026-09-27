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
let MENTORES = {};               // uid -> { fields }, para o cupom de mentor
let CUPONS_BANCO = {};           // codigo -> { plano, usos, maxUsos }, os do painel

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
  const m = /\/documents\/mentores\/([^/?]+)(?:\?|$)/.exec(u);
  if (m) {
    const uid = m[1];
    if ((opcoes.method || 'GET') === 'GET') return MENTORES[uid] ? json(MENTORES[uid]) : json({ error: {} }, 404);
    MENTORES[uid] = JSON.parse(opcoes.body);
    return json({ name: uid });
  }
  const c = /\/documents\/cupons\/([^/?]+)(?:\?|$)/.exec(u);
  if (c) {
    const cod = decodeURIComponent(c[1]);
    const doc = CUPONS_BANCO[cod];
    if ((opcoes.method || 'GET') === 'GET') {
      if (!doc) return json({ error: {} }, 404);
      return json({ fields: {
        plano: { stringValue: doc.plano },
        usos: { doubleValue: doc.usos || 0 },
        maxUsos: { doubleValue: doc.maxUsos || 0 },
      } });
    }
    if (doc) doc.usos = JSON.parse(opcoes.body).fields.usos.doubleValue;
    return json({ name: cod });
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

/* ── nenhum código vive no arquivo ──────────────────────────────────────
 * Os primeiros cupons ficavam escritos em cupom.js e o repositório era
 * público: qualquer um lia o código e ganhava um ano de acesso. Sem nada
 * no banco e sem CUPONS, nenhum código pode valer. */
{
  const fonteCupom = (await import('node:fs')).readFileSync(new URL('../worker/api/cupom.js', import.meta.url), 'utf8');
  const semComentario = fonteCupom.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  /* cada palavra de cada texto entre aspas vira uma tentativa de resgate */
  const literais = [...new Set([...semComentario.matchAll(/(["'`])((?:\\.|(?!\1).)*)\1/g)]
    .flatMap((m) => m[2].toLowerCase().split(/[^a-z0-9]+/))
    .filter((x) => x.length >= 4))];
  GRAVADO = null; MENTORES = {};
  let vazou = [];
  for (const cod of literais) {
    const r0 = await pedir({ token: 't', codigo: cod });
    if (r0.corpo.ok) vazou.push(cod);
  }
  if (!vazou.length && GRAVADO === null && !Object.keys(MENTORES).length) {
    ok('sem banco e sem CUPONS, nenhum texto escrito em cupom.js funciona como cupom');
  } else falha('código escrito em cupom.js ainda libera acesso: ' + vazou.join(', '));
}

/* ── os cupons da variável CUPONS funcionam, com planos diferentes ───── */
env.CUPONS = 'promosemana:semanal,parceiroano:anual';
const PLANO_ESPERADO = { promosemana: 'semanal', parceiroano: 'anual' };
for (const cod of ['promosemana', 'parceiroano']) {
  GRAVADO = null; PLANO_ATUAL = null;
  const r = await pedir({ token: 't', codigo: cod });
  if (r.status === 200 && r.corpo.ok) ok(`cupom "${cod}" libera o acesso`);
  else falha(`cupom "${cod}": ` + JSON.stringify(r));
  const f = GRAVADO && GRAVADO.fields;
  const esperado = PLANO_ESPERADO[cod];
  if (f && f.plano.stringValue === esperado) ok(`"${cod}" grava plano ${esperado}`);
  else falha(`"${cod}" gravou: ` + JSON.stringify(GRAVADO));
  if (esperado === 'anual') {
    /* o anual vence numa data fixa (fim de 2027), não um ano a partir de
       agora — validadeDoPlano, em _comum.js */
    const FIM_ANUAL = new Date('2028-01-01T00:00:00-03:00').getTime();
    if (f && f.validoAte.doubleValue === FIM_ANUAL) ok(`"${cod}" vale até o fim de 2027`);
    else falha(`"${cod}" prazo errado: ${f && f.validoAte.doubleValue}, esperado ${FIM_ANUAL}`);
  } else {
    /* os demais planos contam os dias a partir de agora — DIAS, em
       _comum.js — então o teste confere a janela, não um valor exato. */
    const dias = 7;
    const esperadoMs = Date.now() + dias * 86400000;
    if (f && Math.abs(f.validoAte.doubleValue - esperadoMs) < 5000) ok(`"${cod}" vale por ${dias} dias`);
    else falha(`"${cod}" prazo errado: ${f && f.validoAte.doubleValue}, esperado perto de ${esperadoMs}`);
  }
  if (f && f.email.stringValue === 'aluna@email.com') ok(`"${cod}" guarda o e-mail de quem resgatou`);
  else falha(`"${cod}" sem e-mail`);
}

/* maiúsculas e espaços não podem atrapalhar quem digita */
GRAVADO = null;
let r = await pedir({ token: 't', codigo: '  PromoSemana  ' });
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
r = await pedir({ token: 't', codigo: 'promosemana' });
if (r.status === 401 && /Entre na sua conta/.test(r.corpo.erro)) ok('sem sessão válida, o cupom não passa');
else falha('sessão inválida: ' + JSON.stringify(r));
QUEM = { email: 'aluna@email.com', localId: 'uid-aluna' };

r = await pedir({ codigo: 'promosemana' });
if (r.status === 401) ok('sem token, o cupom não passa');
else falha('sem token: ' + JSON.stringify(r));

r = await pedir({}, 'GET');
if (r.status === 405) ok('só aceita POST');
else falha('método: ' + JSON.stringify(r));

/* ── quem já tem plano em dia não gasta o cupom ──────────────────────── */
GRAVADO = null;
PLANO_ATUAL = Date.now() + 60 * 86400000;
r = await pedir({ token: 't', codigo: 'promosemana' });
if (r.corpo.ok && r.corpo.jaTinha) ok('quem já tem plano em dia recebe aviso em vez de regravar');
else falha('plano em dia: ' + JSON.stringify(r));
if (GRAVADO === null) ok('plano em dia não é sobrescrito');
else falha('sobrescreveu um plano em dia');

/* plano vencido pode ser renovado pelo cupom */
GRAVADO = null;
PLANO_ATUAL = Date.now() - 86400000;
r = await pedir({ token: 't', codigo: 'promosemana' });
if (r.corpo.ok && !r.corpo.jaTinha && GRAVADO) ok('plano vencido é renovado pelo cupom');
else falha('plano vencido: ' + JSON.stringify(r));
PLANO_ATUAL = null;

/* ── configuração pela variável de ambiente ──────────────────────────── */
env.CUPONS = 'turma2026:mensal,vip:vitalicio';
GRAVADO = null;
r = await pedir({ token: 't', codigo: 'turma2026' });
if (r.corpo.ok && GRAVADO.fields.plano.stringValue === 'mensal') ok('CUPONS troca a lista sem mexer no código');
else falha('CUPONS: ' + JSON.stringify(r));
r = await pedir({ token: 't', codigo: 'promosemana' });
if (r.status === 404) ok('trocar CUPONS derruba os códigos que saíram da lista');
else falha('CUPONS antigo continuou valendo: ' + JSON.stringify(r));
env.CUPONS = 'promosemana:semanal,parceiroano:anual';

/* ── cupons do painel, no banco ──────────────────────────────────────── */
CUPONS_BANCO = { turmaabril: { plano: 'mensal', usos: 0, maxUsos: 2 } };
GRAVADO = null;
r = await pedir({ token: 't', codigo: 'turmaabril' });
if (r.corpo.ok && GRAVADO && GRAVADO.fields.plano.stringValue === 'mensal') ok('cupom criado no painel libera o plano dele');
else falha('cupom do banco: ' + JSON.stringify(r));
if (CUPONS_BANCO.turmaabril.usos === 1) ok('o resgate conta um uso do cupom do painel');
else falha('uso não contado: ' + JSON.stringify(CUPONS_BANCO));
CUPONS_BANCO.turmaabril.usos = 2;
GRAVADO = null;
r = await pedir({ token: 't', codigo: 'turmaabril' });
if (r.status === 410 && GRAVADO === null) ok('cupom do painel com a cota cheia é recusado');
else falha('cota cheia: ' + JSON.stringify(r));
CUPONS_BANCO = {};

/* ── falhas de configuração e de banco ───────────────────────────────── */
delete env.FIREBASE_SERVICE_ACCOUNT;
r = await pedir({ token: 't', codigo: 'promosemana' });
if (r.status === 500 && /FIREBASE_SERVICE_ACCOUNT/.test(r.corpo.erro)) ok('sem conta de serviço, explica o que falta');
else falha('sem conta de serviço: ' + JSON.stringify(r));
env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify(CONTA);

FALHAR_GRAVACAO = true;
r = await pedir({ token: 't', codigo: 'promosemana' });
if (r.status === 500 && !r.corpo.ok) ok('falha ao gravar não vira falso positivo');
else falha('falha de gravação: ' + JSON.stringify(r));
FALHAR_GRAVACAO = false;

/* ── cupom de mentor não é cupom de plano ─────────────────────────────── */
CUPONS_BANCO = { mentoria: { plano: 'mentor', usos: 0, maxUsos: 0 } };
GRAVADO = null; MENTORES = {};
r = await pedir({ token: 't', codigo: 'mentoria' });
if (r.corpo.ok && r.corpo.mentor === true) ok('cupom de mentor criado no painel concede o papel de mentor');
else falha('cupom de mentor: ' + JSON.stringify(r));
if (GRAVADO === null) ok('o cupom de mentor não grava nada em assinaturas, só em mentores');
else falha('o cupom de mentor mexeu na assinatura: ' + JSON.stringify(GRAVADO));
if (CUPONS_BANCO.mentoria.usos === 1) ok('o cupom de mentor também conta uso');
else falha('uso do cupom de mentor: ' + JSON.stringify(CUPONS_BANCO));
if (MENTORES['uid-aluna'] && MENTORES['uid-aluna'].fields.email.stringValue === 'aluna@email.com') {
  ok('o documento do mentor guarda o e-mail de quem resgatou');
} else falha('documento do mentor: ' + JSON.stringify(MENTORES));

/* resgatar de novo não apaga a lista de alunos que a pessoa já tinha */
MENTORES['uid-aluna'].fields.alunos = { arrayValue: { values: [{ mapValue: { fields: { uid: { stringValue: 'x' }, email: { stringValue: 'x@x.com' }, adicionadoEm: { doubleValue: 1 } } } }] } };
r = await pedir({ token: 't', codigo: 'MENTORIA' });
if (r.corpo.ok && r.corpo.mentor === true) ok('resgatar de novo (maiúsculas incluído) não dá erro');
else falha('resgatar mentor de novo: ' + JSON.stringify(r));
if ((MENTORES['uid-aluna'].fields.alunos.arrayValue.values || []).length === 1) {
  ok('resgatar o cupom de novo preserva a lista de alunos já adicionados');
} else falha('resgatar de novo apagou os alunos: ' + JSON.stringify(MENTORES['uid-aluna']));

/* cota cheia também vale para o cupom de mentor */
CUPONS_BANCO = { mentoria: { plano: 'mentor', usos: 3, maxUsos: 3 } };
MENTORES = {};
r = await pedir({ token: 't', codigo: 'mentoria' });
if (r.status === 410 && !Object.keys(MENTORES).length) ok('cupom de mentor com a cota cheia é recusado');
else falha('cota do cupom de mentor: ' + JSON.stringify(r));
CUPONS_BANCO = {};

/* e pela variável de reserva, com o plano "mentor" */
env.CUPONS = 'guiaresidencia:mentor';
GRAVADO = null; MENTORES = {};
r = await pedir({ token: 't', codigo: 'guiaresidencia' });
if (r.corpo.ok && r.corpo.mentor === true && GRAVADO === null) ok('CUPONS aceita o plano mentor, sem virar plano pago');
else falha('CUPONS mentor: ' + JSON.stringify(r) + ' ' + JSON.stringify(GRAVADO));
env.CUPONS = 'promosemana:semanal,parceiroano:anual';

console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
