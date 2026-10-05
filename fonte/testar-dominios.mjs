/* A lista de endereços liberados para o login do Google (worker/api/dominios.js).
 *
 * Acrescenta só o que falta, sem tirar o que já estava; na segunda vez não
 * grava nada; pede o token com o escopo da configuração (e não o do
 * banco); e a falha do Google aparece como erro, em vez de "tudo certo".
 *
 *   node testar-dominios.mjs
 */
const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

const { generateKeyPairSync } = await import('node:crypto');
const CONTA = {
  client_email: 'teste@exemplo.iam.gserviceaccount.com',
  private_key: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }),
};
let LISTA = ['localhost', 'cadencia-7c1f1.firebaseapp.com', 'cadencia-7c1f1.web.app'];
let gravacoes = [];
let escopos = [];
let FALHAR = 0;
const resp = (c, s = 200) => new Response(JSON.stringify(c), { status: s, headers: { 'Content-Type': 'application/json' } });
globalThis.fetch = async (url, op = {}) => {
  const u = String(url);
  if (u.includes('oauth2.googleapis.com/token')) {
    const jwt = new URLSearchParams(op.body).get('assertion');
    escopos.push(JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).scope);
    return resp({ access_token: 't' });
  }
  if (u.includes('identitytoolkit.googleapis.com/admin/v2/projects/cadencia-7c1f1/config')) {
    if (FALHAR) return resp({ error: { message: 'The caller does not have permission' } }, FALHAR);
    if ((op.method || 'GET') === 'GET') return resp({ authorizedDomains: LISTA });
    if (op.method === 'PATCH' && u.includes('updateMask=authorizedDomains')) {
      const corpo = JSON.parse(op.body);
      gravacoes.push(corpo.authorizedDomains);
      LISTA = corpo.authorizedDomains;
      return resp({ authorizedDomains: LISTA });
    }
  }
  throw new Error('chamada inesperada: ' + u);
};
const env = { FIREBASE_SERVICE_ACCOUNT: JSON.stringify(CONTA) };
const D = await import('../worker/api/dominios.js');
const pedir = async () => {
  const r = await D.onRequest({ request: new Request('http://x/api/liberar-dominios', { method: 'POST' }), env });
  return { status: r.status, corpo: await r.json() };
};

let r = await pedir();
if (r.status === 200 && JSON.stringify(r.corpo.adicionados) === JSON.stringify(D.DOMINIOS_DO_SITE)) ok('acrescenta os três endereços do site que faltavam');
else falha('primeira vez: ' + JSON.stringify(r));
if (gravacoes.length === 1 && ['localhost', 'cadencia-7c1f1.firebaseapp.com', 'cadencia-7c1f1.web.app'].every((d) => gravacoes[0].includes(d))) ok('sem tirar nenhum dos que já estavam');
else falha('gravação: ' + JSON.stringify(gravacoes));
if (escopos.length && escopos.every((e) => e === 'https://www.googleapis.com/auth/cloud-platform')) ok('o token pede o escopo da configuração do projeto');
else falha('escopos: ' + JSON.stringify(escopos));

gravacoes = [];
r = await pedir();
if (r.status === 200 && !r.corpo.adicionados.length && !gravacoes.length) ok('na segunda vez, já está tudo lá: não grava nada');
else falha('segunda vez: ' + JSON.stringify(r) + ' ' + gravacoes.length);

FALHAR = 403;
r = await pedir();
if (r.status === 502 && !r.corpo.ok && /permission/.test(r.corpo.detalhe || '')) ok('sem permissão, responde erro com o motivo do Google (e não "tudo certo")');
else falha('sem permissão: ' + JSON.stringify(r));
FALHAR = 0;

r = await D.onRequest({ request: new Request('http://x/api/liberar-dominios', { method: 'GET' }), env });
if (r.status === 405) ok('só aceita POST');
else falha('GET: ' + r.status);

{
  const fs = await import('node:fs');
  const idx = fs.readFileSync(new URL('../worker/index.js', import.meta.url), 'utf8');
  if (/"\/api\/liberar-dominios": dominios/.test(idx) && /garantirDominios\(env\)/.test(idx)) ok('a rota está registrada e roda também na batida de hora em hora');
  else falha('falta registrar a rota ou a batida no worker/index.js');
}

console.log(passos.join('\n'));
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
