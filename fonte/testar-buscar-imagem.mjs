/* Testa a ponte que traz para dentro da anotação uma imagem que o navegador
 * não consegue ler por causa do CORS.
 *
 *   node testar-buscar-imagem.mjs
 */
import http from 'node:http';

const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

/* Um PNG de 1x1, que é imagem de verdade o suficiente. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

let responder = () => ({ status: 200, tipo: 'image/png', corpo: PIXEL });
let ultimoPedido = null;

const servidor = http.createServer((req, res) => {
  ultimoPedido = { url: req.url, headers: req.headers };
  const r = responder(ultimoPedido);
  res.writeHead(r.status, r.tipo ? { 'Content-Type': r.tipo } : {});
  res.end(r.corpo || '');
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const porta = servidor.address().port;

let QUEM = { email: 'joseeduardo1616@gmail.com', localId: 'uid-dono' };

const fetchReal = globalThis.fetch;
globalThis.fetch = (url, opcoes) => {
  const u = String(url);
  if (u.includes('identitytoolkit.googleapis.com')) {
    return Promise.resolve(new Response(
      JSON.stringify(QUEM ? { users: [QUEM] } : { users: [] }),
      { status: QUEM === null ? 400 : 200, headers: { 'Content-Type': 'application/json' } }));
  }
  /* O nome de fantasia vira o servidor local: é o jeito de testar bloqueio
     de nome sem depender de rede. */
  if (u.startsWith('https://imagens.exemplo/')) {
    return fetchReal(u.replace('https://imagens.exemplo', `http://127.0.0.1:${porta}`), opcoes);
  }
  return fetchReal(url, opcoes);
};

const env = { FIREBASE_API_KEY: 'chave-firebase' };
const carregar = async () => (await import('../worker/api/buscar-imagem.js?v=' + Math.random())).onRequest;

const pedir = async (corpo) => {
  const req = new Request('http://local/api/buscar-imagem', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
  });
  const res = await (await carregar())({ request: req, env });
  return { status: res.status, corpo: await res.json() };
};

const URL_BOA = 'https://imagens.exemplo/figura.png';

/* ── 1. o caminho feliz ───────────────────────────────────────────────── */
let r = await pedir({ token: 't', url: URL_BOA });
if (r.status === 200 && /^data:image\/png;base64,/.test(r.corpo.dados || '')) {
  ok('a imagem volta em base64, pronta para guardar na anotação');
} else falha('caminho feliz: ' + JSON.stringify(r).slice(0, 200));
if (Buffer.from(String(r.corpo.dados).split(',')[1], 'base64').equals(PIXEL)) ok('os bytes chegam inteiros');
else falha('bytes diferentes do original');

/* ── 2. sem entrar na conta ───────────────────────────────────────────── */
r = await pedir({ url: URL_BOA });
if (r.status === 403 && /Entre na sua conta/.test(r.corpo.erro)) ok('sem token: recusado, não é proxy aberto');
else falha('sem token: ' + JSON.stringify(r));

QUEM = null;
r = await pedir({ token: 'inventado', url: URL_BOA });
if (r.status === 403) ok('token que não confere: recusado');
else falha('token inválido: ' + JSON.stringify(r));
QUEM = { email: 'joseeduardo1616@gmail.com', localId: 'uid-dono' };

/* ── 3. endereços que não devem ser buscados ──────────────────────────── */
for (const [alvo, oQue] of [
  ['file:///etc/passwd', 'arquivo local'],
  ['http://localhost:8080/x.png', 'localhost'],
  ['http://127.0.0.1:9/x.png', 'endereço de volta'],
  ['http://169.254.169.254/latest/meta-data/', 'serviço de metadados'],
  ['http://10.0.0.5/x.png', 'rede interna'],
  ['nada disso', 'texto que não é endereço'],
]) {
  r = await pedir({ token: 't', url: alvo });
  if (r.status === 400 && /inválido/i.test(r.corpo.erro)) ok(`${oQue} é recusado`);
  else falha(`${oQue} passou: ` + JSON.stringify(r));
}

/* ── 4. o que volta precisa ser imagem ────────────────────────────────── */
responder = () => ({ status: 200, tipo: 'text/html', corpo: '<html>não sou imagem</html>' });
r = await pedir({ token: 't', url: URL_BOA });
if (/não devolveu uma imagem/.test(r.corpo.erro || '')) ok('página HTML disfarçada de imagem é recusada');
else falha('HTML passou: ' + JSON.stringify(r));

/* ── 5. endereço vencido, que é o caso do Notion ──────────────────────── */
responder = () => ({ status: 403, tipo: 'text/plain', corpo: 'expired' });
r = await pedir({ token: 't', url: URL_BOA });
if (/expirou/.test(r.corpo.erro || '')) ok('endereço vencido é explicado, não vira erro cru');
else falha('403 de origem: ' + JSON.stringify(r));

/* ── 6. imagem grande demais ──────────────────────────────────────────── */
responder = () => ({ status: 200, tipo: 'image/png', corpo: Buffer.alloc(9 * 1024 * 1024, 1) });
r = await pedir({ token: 't', url: URL_BOA });
if (/grande demais/.test(r.corpo.erro || '')) ok('imagem acima do teto é recusada');
else falha('imagem grande passou: ' + JSON.stringify(r));

/* ── 7. método errado ─────────────────────────────────────────────────── */
const res = await (await carregar())({
  request: new Request('http://local/api/buscar-imagem', { method: 'GET' }), env,
});
if (res.status === 405) ok('GET não é aceito');
else falha('GET respondeu ' + res.status);

servidor.close();
console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
