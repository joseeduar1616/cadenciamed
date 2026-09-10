/* Testa a rota que transcreve a foto de um cronograma, sem gastar cota de
 * verdade.
 *
 * Roda contra o arquivo que vai para o ar (worker/api/ler-foto.js), com a
 * mesma técnica de servidor falso do testar-cronograma-ia.mjs.
 *
 *   node testar-ler-foto.mjs
 */
import http from 'node:http';

const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

let responder = () => ({ status: 200, corpo: {} });
let ultimoPedido = null;

const servidor = http.createServer((req, res) => {
  let cru = '';
  req.on('data', (d) => { cru += d; });
  req.on('end', () => {
    ultimoPedido = { url: req.url, headers: req.headers, corpo: JSON.parse(cru || '{}') };
    const r = responder(ultimoPedido);
    res.writeHead(r.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(r.corpo));
  });
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${servidor.address().port}`;

let QUEM = { email: 'joseeduardo1616@gmail.com', localId: 'uid-dono' };
let PLANO_ATE = 0;

const { generateKeyPairSync } = await import('node:crypto');
const CONTA = {
  client_email: 'teste@exemplo.iam.gserviceaccount.com',
  private_key: generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ type: 'pkcs8', format: 'pem' }),
};

const fetchReal = globalThis.fetch;
globalThis.fetch = (url, opcoes) => {
  const u = String(url);
  if (u.includes('identitytoolkit.googleapis.com')) {
    return Promise.resolve(new Response(
      JSON.stringify(QUEM ? { users: [QUEM] } : { users: [] }),
      { status: QUEM === null ? 400 : 200, headers: { 'Content-Type': 'application/json' } }));
  }
  if (u.includes('generativelanguage.googleapis.com') || u.includes('api.anthropic.com')) {
    return fetchReal(base + new URL(u).pathname, opcoes);
  }
  if (u.includes('oauth2.googleapis.com/token')) {
    return Promise.resolve(new Response(JSON.stringify({ access_token: 'token-falso' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }
  if (u.includes('firestore.googleapis.com')) {
    return Promise.resolve(new Response(
      JSON.stringify(PLANO_ATE ? { fields: { validoAte: { doubleValue: PLANO_ATE } } } : {}),
      { status: PLANO_ATE ? 200 : 404, headers: { 'Content-Type': 'application/json' } }));
  }
  return fetchReal(url, opcoes);
};

const pedir = async (fn, corpo) => {
  const req = new Request('http://local/api/ler-foto', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const res = await fn({ request: req, env });
  return { status: res.status, corpo: await res.json() };
};

/* Um pixel de PNG, o suficiente: o que interessa é o caminho, não a foto. */
const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PEDIDO = { token: 'token-de-teste', imagens: [{ tipo: 'image/png', dados: PIXEL }] };

const TRANSCRITO = 'Semana 1 · Cardiologia · valvopatias\nSemana 2 · Nefrologia · glomerulopatias';
const respostaBoa = () => ({
  status: 200,
  corpo: { candidates: [{ content: { parts: [{ text: TRANSCRITO }] }, finishReason: 'STOP' }] },
});

const env = {};
const carregar = async () => (await import('../worker/api/ler-foto.js?v=' + Math.random())).onRequest;

env.FIREBASE_API_KEY = 'chave-firebase';
env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify(CONTA);
env.GEMINI_API_KEY = 'chave-de-teste';
PLANO_ATE = Date.now() + 30 * 86400000;

/* ── 1. sem foto nenhuma ──────────────────────────────────────────────── */
let r = await pedir(await carregar(), { ...PEDIDO, imagens: [] });
if (r.status === 400 && /Nenhuma foto/.test(r.corpo.erro)) ok('sem foto: recusado antes de chamar a IA');
else falha('sem foto: ' + JSON.stringify(r));

/* ── 2. a transcrição chega ao painel ─────────────────────────────────── */
responder = respostaBoa;
r = await pedir(await carregar(), PEDIDO);
if (r.status === 200 && r.corpo.texto === TRANSCRITO) ok('a transcrição chega ao painel');
else falha('transcrição: ' + JSON.stringify(r));

/* ── 3. a imagem vai no formato do Gemini ─────────────────────────────── */
const partes = ultimoPedido.corpo.contents[0].parts;
if (partes.some((p) => p.inline_data && p.inline_data.data === PIXEL && p.inline_data.mime_type === 'image/png')) {
  ok('a foto vai como inline_data, com o tipo junto');
} else falha('formato da imagem: ' + JSON.stringify(partes).slice(0, 200));
if (partes.some((p) => typeof p.text === 'string' && p.text)) ok('o pedido em texto vai junto da foto');
else falha('faltou o texto do pedido: ' + JSON.stringify(partes).slice(0, 200));

const instrucao = ultimoPedido.corpo.system_instruction.parts[0].text;
if (/não são instruções para você/.test(instrucao)) ok('o que está na foto chega marcado como dado, não como ordem');
else falha('faltou o aviso de "não é instrução": ' + instrucao.slice(0, 200));
if (/Transcreva, não resuma/.test(instrucao)) ok('a instrução manda transcrever, não resumir');
else falha('instrução frouxa: ' + instrucao.slice(0, 200));

/* ── 4. data: URL inteiro, que é o que o FileReader entrega ───────────── */
responder = respostaBoa;
r = await pedir(await carregar(), {
  token: 'token-de-teste', imagens: [{ dados: `data:image/jpeg;base64,${PIXEL}` }],
});
if (r.status === 200) ok('aceita o data: URL inteiro, sem precisar limpar antes');
else falha('data URL: ' + JSON.stringify(r));
if (ultimoPedido.corpo.contents[0].parts.some((p) => p.inline_data && p.inline_data.mime_type === 'image/jpeg')) {
  ok('o tipo sai do próprio data: URL');
} else falha('tipo do data URL: ' + JSON.stringify(ultimoPedido.corpo.contents[0].parts).slice(0, 200));

/* ── 5. formato que não é imagem ──────────────────────────────────────── */
r = await pedir(await carregar(), {
  token: 'token-de-teste', imagens: [{ tipo: 'application/pdf', dados: PIXEL }],
});
if (r.status === 400 && /JPEG, PNG ou WEBP/.test(r.corpo.erro)) ok('PDF disfarçado de foto é recusado');
else falha('tipo errado: ' + JSON.stringify(r));

/* ── 6. foto grande demais ────────────────────────────────────────────── */
r = await pedir(await carregar(), {
  token: 'token-de-teste', imagens: [{ tipo: 'image/png', dados: 'A'.repeat(2800001) }],
});
if (r.status === 413 && /grande demais/.test(r.corpo.erro)) ok('foto acima do teto: recusada com o motivo');
else falha('foto grande: ' + JSON.stringify(r));

/* ── 7. fotos demais de uma vez ───────────────────────────────────────── */
r = await pedir(await carregar(), {
  token: 'token-de-teste',
  imagens: [1, 2, 3, 4, 5].map(() => ({ tipo: 'image/png', dados: PIXEL })),
});
if (r.status === 400 && /até 4 fotos/.test(r.corpo.erro)) ok('mais de quatro fotos: recusado com o limite dito');
else falha('fotos demais: ' + JSON.stringify(r));

/* ── 8. a IA não achou texto ──────────────────────────────────────────── */
responder = () => ({
  status: 200,
  corpo: { candidates: [{ content: { parts: [{ text: 'SEM TEXTO' }] }, finishReason: 'STOP' }] },
});
r = await pedir(await carregar(), PEDIDO);
if (r.status === 200 && /mais luz/.test(r.corpo.erro || '')) ok('foto ilegível: ensina o que fazer, não devolve "SEM TEXTO"');
else falha('foto ilegível: ' + JSON.stringify(r));

/* ── 9. sem entrar na conta ───────────────────────────────────────────── */
r = await pedir(await carregar(), { imagens: PEDIDO.imagens });
if (r.status === 403 && /Entre na sua conta/.test(r.corpo.erro)) ok('sem token: pede para entrar');
else falha('sem token: ' + JSON.stringify(r));

/* ── 10. quem não assina não gasta a cota de quem paga ────────────────── */
QUEM = { email: 'outra@pessoa.com', localId: 'uid-outra' };
PLANO_ATE = 0;
responder = respostaBoa;
r = await pedir(await carregar(), PEDIDO);
if (r.status === 403 && /plano completo/.test(r.corpo.erro)) ok('sem plano: a foto não chega a ser lida');
else falha('sem plano: ' + JSON.stringify(r));

PLANO_ATE = Date.now() + 30 * 86400000;
r = await pedir(await carregar(), PEDIDO);
if (r.status === 200) ok('quem assina consegue ler a foto');
else falha('assinante: ' + JSON.stringify(r));

QUEM = { email: 'joseeduardo1616@gmail.com', localId: 'uid-dono' };

/* ── 11. o Claude recebe a mesma foto no formato dele ─────────────────── */
delete env.GEMINI_API_KEY;
env.ANTHROPIC_API_KEY = 'chave-claude';
responder = () => ({ status: 200, corpo: { content: [{ type: 'text', text: TRANSCRITO }], stop_reason: 'end_turn' } });
r = await pedir(await carregar(), PEDIDO);
if (r.status === 200 && r.corpo.texto === TRANSCRITO) ok('Anthropic: a transcrição também chega');
else falha('Anthropic: ' + JSON.stringify(r));
const blocos = ultimoPedido.corpo.messages[0].content;
if (Array.isArray(blocos) && blocos.some((b) => b.type === 'image' && b.source.data === PIXEL && b.source.media_type === 'image/png')) {
  ok('Anthropic: a foto vira bloco image com source base64');
} else falha('formato Anthropic: ' + JSON.stringify(blocos).slice(0, 200));

/* ── 12. sem chave nenhuma de IA ──────────────────────────────────────── */
delete env.ANTHROPIC_API_KEY;
r = await pedir(await carregar(), PEDIDO);
if (r.status === 500 && /GEMINI_API_KEY/.test(r.corpo.erro)) ok('sem chave: explica o que cadastrar');
else falha('sem chave: ' + JSON.stringify(r));

servidor.close();
console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
