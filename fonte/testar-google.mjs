/* Testa a rota que liga a conta do Google de vez, sem falar com o Google
 * de verdade.
 *
 * O que ela precisa garantir: o token de atualização nunca volta para a
 * página, quem não está na conta não chega a lugar nenhum, e uma autorização
 * revogada não fica sendo tentada para sempre.
 *
 *   node testar-google.mjs
 */
import http from 'node:http';

const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

let QUEM = { email: 'quem@exemplo.com', localId: 'uid-1' };
let respostaOAuth = () => ({ status: 200, corpo: { access_token: 'acesso-1', refresh_token: 'atualiza-1', expires_in: 3600 } });
let ultimoOAuth = null;

/* Firestore de mentira: um objeto, com o que foi gravado. */
const BANCO = {};
let revogou = null;

const { generateKeyPairSync } = await import('node:crypto');
const CONTA = {
  client_email: 'teste@exemplo.iam.gserviceaccount.com',
  private_key: generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ type: 'pkcs8', format: 'pem' }),
};

const fetchReal = globalThis.fetch;
globalThis.fetch = async (url, opcoes) => {
  const u = String(url);
  const o = opcoes || {};
  if (u.includes('identitytoolkit.googleapis.com')) {
    return new Response(JSON.stringify(QUEM ? { users: [QUEM] } : { users: [] }),
      { status: QUEM === null ? 400 : 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (u.includes('oauth2.googleapis.com/token')) {
    /* o pedido do próprio Worker por um token de conta de serviço usa
       assertion; o nosso usa client_id */
    const corpo = String(o.body || '');
    if (corpo.includes('assertion=')) {
      return new Response(JSON.stringify({ access_token: 'servico' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    ultimoOAuth = Object.fromEntries(new URLSearchParams(corpo));
    const r = respostaOAuth();
    return new Response(JSON.stringify(r.corpo), { status: r.status, headers: { 'Content-Type': 'application/json' } });
  }
  if (u.includes('oauth2.googleapis.com/revoke')) {
    revogou = Object.fromEntries(new URLSearchParams(String(o.body || '')));
    return new Response('', { status: 200 });
  }
  if (u.includes('firestore.googleapis.com')) {
    const caminho = u.split('/documents/')[1] || '';
    if (o.method === 'PATCH') { BANCO[caminho] = JSON.parse(o.body).fields; return new Response('{}', { status: 200 }); }
    if (o.method === 'DELETE') { delete BANCO[caminho]; return new Response('{}', { status: 200 }); }
    const doc = BANCO[caminho];
    return new Response(JSON.stringify(doc ? { fields: doc } : {}), { status: doc ? 200 : 404 });
  }
  return fetchReal(url, opcoes);
};

const env = {
  FIREBASE_API_KEY: 'chave-firebase',
  FIREBASE_SERVICE_ACCOUNT: JSON.stringify(CONTA),
  GOOGLE_CLIENT_ID: 'id-do-cliente',
  GOOGLE_CLIENT_SECRET: 'segredo-do-cliente',
};

const carregar = async () => (await import('../worker/api/google.js?v=' + Math.random())).onRequest;
const pedir = async (corpo, ambiente) => {
  const req = new Request('http://local/api/google', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
  });
  const res = await (await carregar())({ request: req, env: ambiente || env });
  return { status: res.status, corpo: await res.json() };
};

/* ── 1. antes de ligar ────────────────────────────────────────────────── */
let r = await pedir({ token: 't', acao: 'estado' });
if (r.corpo.ligado === false && r.corpo.disponivel === true) ok('estado: diz que dá para ligar e que ainda não está');
else falha('estado inicial: ' + JSON.stringify(r));

r = await pedir({ token: 't', acao: 'token' });
if (r.corpo.ligado === false && /Ligue sua conta/.test(r.corpo.erro || '')) ok('pedir token sem ligar: manda ligar antes');
else falha('token sem ligar: ' + JSON.stringify(r));

/* ── 2. ligar ─────────────────────────────────────────────────────────── */
r = await pedir({ token: 't', acao: 'ligar', codigo: 'cod-123' });
if (r.corpo.ok && r.corpo.ligado) ok('ligar: o código vira ligação permanente');
else falha('ligar: ' + JSON.stringify(r));
if (ultimoOAuth.grant_type === 'authorization_code' && ultimoOAuth.code === 'cod-123') ok('a troca usa o código que veio da janela');
else falha('troca errada: ' + JSON.stringify(ultimoOAuth));
if (ultimoOAuth.redirect_uri === 'postmessage') ok('o retorno é "postmessage", como o fluxo de janela exige');
else falha('retorno errado: ' + ultimoOAuth.redirect_uri);
if (ultimoOAuth.client_secret === 'segredo-do-cliente') ok('o segredo vai no servidor, não na página');
else falha('sem segredo na troca');

const gravado = JSON.stringify(BANCO['google/uid-1'] || {});
if (/atualiza-1/.test(gravado)) ok('o token de atualização fica guardado no servidor');
else falha('não guardou o token: ' + gravado);
if (!/atualiza-1/.test(JSON.stringify(r.corpo))) ok('o token de atualização NÃO volta para a página');
else falha('o token de atualização vazou na resposta');

/* ── 3. token novo, sem janela ────────────────────────────────────────── */
respostaOAuth = () => ({ status: 200, corpo: { access_token: 'acesso-2', expires_in: 3600 } });
r = await pedir({ token: 't', acao: 'token' });
if (r.corpo.acesso === 'acesso-2' && r.corpo.ligado) ok('token: vem um acesso novo sem abrir janela nenhuma');
else falha('token: ' + JSON.stringify(r));
if (ultimoOAuth.grant_type === 'refresh_token' && ultimoOAuth.refresh_token === 'atualiza-1') ok('a renovação usa o token guardado');
else falha('renovação errada: ' + JSON.stringify(ultimoOAuth));
if (Number(r.corpo.expiraEm) > Date.now()) ok('a resposta diz até quando o acesso vale');
else falha('sem validade: ' + JSON.stringify(r.corpo));

r = await pedir({ token: 't', acao: 'estado' });
if (r.corpo.ligado === true) ok('estado: agora diz que está ligado');
else falha('estado depois de ligar: ' + JSON.stringify(r));

/* ── 4. autorização já concedida antes, sem token de atualização ──────── */
delete BANCO['google/uid-1'];
respostaOAuth = () => ({ status: 200, corpo: { access_token: 'so-acesso', expires_in: 3600 } });
r = await pedir({ token: 't', acao: 'ligar', codigo: 'cod-456' });
if (r.corpo.semAtualizacao && /permissions/.test(r.corpo.erro || '')) ok('sem token de atualização: avisa em vez de fingir que ligou');
else falha('sem refresh_token: ' + JSON.stringify(r));
if (!BANCO['google/uid-1']) ok('e não grava ligação pela metade');
else falha('gravou sem token de atualização');

/* ── 5. autorização revogada pela pessoa ──────────────────────────────── */
respostaOAuth = () => ({ status: 200, corpo: { access_token: 'a', refresh_token: 'atualiza-2', expires_in: 3600 } });
await pedir({ token: 't', acao: 'ligar', codigo: 'cod-789' });
respostaOAuth = () => ({ status: 400, corpo: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } });
r = await pedir({ token: 't', acao: 'token' });
if (r.corpo.ligado === false && /não vale mais/.test(r.corpo.erro || '')) ok('autorização revogada: explica e marca como desligada');
else falha('revogada: ' + JSON.stringify(r));
if (!BANCO['google/uid-1']) ok('e o token morto é apagado, para não ficar tentando para sempre');
else falha('token revogado continuou guardado');

/* ── 6. desligar ──────────────────────────────────────────────────────── */
respostaOAuth = () => ({ status: 200, corpo: { access_token: 'a', refresh_token: 'atualiza-3', expires_in: 3600 } });
await pedir({ token: 't', acao: 'ligar', codigo: 'cod-000' });
r = await pedir({ token: 't', acao: 'desligar' });
if (r.corpo.ok && r.corpo.ligado === false) ok('desligar responde que desligou');
else falha('desligar: ' + JSON.stringify(r));
if (!BANCO['google/uid-1']) ok('desligar apaga a ligação guardada');
else falha('desligar não apagou');
if (revogou && revogou.token === 'atualiza-3') ok('desligar avisa o Google, revogando a autorização');
else falha('não revogou: ' + JSON.stringify(revogou));

/* ── 7. sem conta e com sessão vencida ────────────────────────────────── */
r = await pedir({ acao: 'estado' });
if (r.status === 403) ok('sem token da conta: recusado');
else falha('sem token: ' + JSON.stringify(r));

QUEM = null;
r = await pedir({ token: 'velho', acao: 'token' });
if (r.status === 403 && /sessão expirou/.test(r.corpo.erro)) ok('sessão vencida: manda entrar de novo');
else falha('sessão vencida: ' + JSON.stringify(r));
QUEM = { email: 'quem@exemplo.com', localId: 'uid-1' };

/* ── 8. site sem o segredo cadastrado ─────────────────────────────────── */
const semSegredo = { ...env };
delete semSegredo.GOOGLE_CLIENT_SECRET;
r = await pedir({ token: 't', acao: 'estado' }, semSegredo);
if (r.corpo.disponivel === false) ok('sem o segredo: a página sabe que não dá, e segue pelo caminho antigo');
else falha('sem segredo: ' + JSON.stringify(r));
r = await pedir({ token: 't', acao: 'ligar', codigo: 'x' }, semSegredo);
if (/GOOGLE_CLIENT_SECRET/.test(r.corpo.erro || '')) ok('e explica qual variável falta');
else falha('sem segredo, ligar: ' + JSON.stringify(r));

/* ── 9. método e ação ─────────────────────────────────────────────────── */
const res = await (await carregar())({ request: new Request('http://local/api/google', { method: 'GET' }), env });
if (res.status === 405) ok('GET não é aceito');
else falha('GET respondeu ' + res.status);

r = await pedir({ token: 't', acao: 'inventada' });
if (r.status === 400) ok('ação desconhecida é recusada');
else falha('ação inventada: ' + JSON.stringify(r));

console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
