/* Testa a função do assistente sem gastar cota de verdade.
 *
 * Sobe um servidor falso no lugar da API do Google e da Anthropic, e confere
 * o formato do pedido que sai daqui e o que a função devolve em cada erro.
 *
 *   node testar-assistente.mjs
 */
import http from 'node:http';

const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

/* ── servidor falso ──────────────────────────────────────────────────── */
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

/* Quem a função acha que está pedindo. O teste troca isto para exercitar
   o dono, um estranho e uma sessão inválida. */
let QUEM = { email: 'joseeduardo1616@gmail.com', localId: 'uid-dono' };

/* Redireciona as chamadas da função para o servidor falso, sem tocar no
   código de produção: só o destino do fetch muda. A conferência de
   identidade é respondida aqui mesmo, para o teste não depender do Google. */
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
  return fetchReal(url, opcoes);
};

const pedir = async (fn, corpo) => {
  const req = new Request('http://local/.netlify/functions/assistente', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const res = await fn(req);
  return { status: res.status, corpo: await res.json() };
};

const CONVERSA = {
  token: 'token-de-teste',
  contexto: 'Aulas feitas: 12 de 90.',
  instrucoes: 'Você é o assistente do Cadência Med.',
  mensagens: [
    { role: 'user', content: 'O que eu deveria estudar hoje?' },
    { role: 'assistant', content: 'Comece pelas revisões atrasadas.' },
    { role: 'user', content: 'Quais?' },
  ],
};

const carregar = async () => (await import('./netlify/functions/assistente.mjs?v=' + Math.random())).default;

/* ── 1. sem chave nenhuma ────────────────────────────────────────────── */
delete process.env.GEMINI_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.IA_PROVEDOR;
process.env.FIREBASE_API_KEY = 'chave-firebase';
let r = await pedir(await carregar(), CONVERSA);
if (r.status === 500 && /GEMINI_API_KEY/.test(r.corpo.erro)) ok('sem chave: explica o que cadastrar');
else falha('sem chave: ' + JSON.stringify(r));

/* ── 2. Gemini responde certo ────────────────────────────────────────── */
process.env.GEMINI_API_KEY = 'chave-de-teste';
responder = () => ({
  status: 200,
  corpo: { candidates: [{ content: { parts: [{ text: 'Comece por Glomerulopatias.' }] }, finishReason: 'STOP' }] },
});
r = await pedir(await carregar(), CONVERSA);
if (r.status === 200 && r.corpo.texto === 'Comece por Glomerulopatias.') ok('Gemini: resposta chega ao painel');
else falha('Gemini resposta: ' + JSON.stringify(r));

/* formato do pedido que saiu */
const p = ultimoPedido;
if (/gemini-2\.5-flash:generateContent/.test(p.url)) ok('Gemini: modelo e método certos na URL');
else falha('Gemini URL: ' + p.url);
if (p.headers['x-goog-api-key'] === 'chave-de-teste') ok('Gemini: chave vai no cabeçalho x-goog-api-key');
else falha('Gemini cabeçalho: ' + JSON.stringify(p.headers['x-goog-api-key']));
if (p.corpo.system_instruction.parts[0].text.includes('DADOS ATUAIS DO PAINEL')) ok('Gemini: contexto do painel vai em system_instruction');
else falha('Gemini system_instruction ausente');
const papeis = p.corpo.contents.map((c) => c.role).join(',');
if (papeis === 'user,model,user') ok('Gemini: "assistant" virou "model" no histórico');
else falha('Gemini papéis: ' + papeis);
if (p.corpo.contents[0].parts[0].text === 'O que eu deveria estudar hoje?') ok('Gemini: texto das mensagens preservado');
else falha('Gemini texto: ' + JSON.stringify(p.corpo.contents[0]));
if (p.corpo.generationConfig.maxOutputTokens === 1400) ok('Gemini: limite de saída aplicado');
else falha('Gemini maxOutputTokens: ' + JSON.stringify(p.corpo.generationConfig));

/* ── 3. erros do Gemini ──────────────────────────────────────────────── */
const casos = [
  [403, { error: { message: 'API key not valid' } }, /chave do Gemini foi recusada/i, 'chave inválida'],
  [429, { error: { message: 'Quota exceeded' } }, /Cota esgotada|pedidos demais/i, 'cota estourada'],
  [503, { error: { message: 'overloaded' } }, /sobrecarregado/i, 'serviço sobrecarregado'],
];
for (const [status, corpo, esperado, nome] of casos) {
  responder = () => ({ status, corpo });
  r = await pedir(await carregar(), CONVERSA);
  if (r.status === 502 && esperado.test(r.corpo.erro)) ok(`Gemini ${status}: ${nome} explicado`);
  else falha(`Gemini ${status}: ` + JSON.stringify(r));
}

/* resposta 200 mas sem texto, que é o jeito do Gemini avisar bloqueio */
responder = () => ({ status: 200, corpo: { promptFeedback: { blockReason: 'SAFETY' }, candidates: [] } });
r = await pedir(await carregar(), CONVERSA);
if (/bloqueou o pedido \(SAFETY\)/.test(r.corpo.erro)) ok('Gemini: bloqueio por conteúdo é explicado');
else falha('Gemini bloqueio: ' + JSON.stringify(r));

responder = () => ({ status: 200, corpo: { candidates: [{ content: { parts: [] }, finishReason: 'MAX_TOKENS' }] } });
r = await pedir(await carregar(), CONVERSA);
if (/longa demais/.test(r.corpo.erro)) ok('Gemini: resposta cortada é explicada');
else falha('Gemini MAX_TOKENS: ' + JSON.stringify(r));

/* ── 4. Anthropic continua funcionando ───────────────────────────────── */
delete process.env.GEMINI_API_KEY;
process.env.ANTHROPIC_API_KEY = 'sk-ant-teste';
responder = () => ({ status: 200, corpo: { content: [{ type: 'text', text: 'Resposta do Claude.' }] } });
r = await pedir(await carregar(), CONVERSA);
if (r.status === 200 && r.corpo.texto === 'Resposta do Claude.') ok('Anthropic: continua funcionando igual');
else falha('Anthropic: ' + JSON.stringify(r));
if (ultimoPedido.headers['x-api-key'] === 'sk-ant-teste') ok('Anthropic: chave vai no cabeçalho x-api-key');
else falha('Anthropic cabeçalho errado');

/* ── 5. as duas chaves: o Gemini ganha, e IA_PROVEDOR manda ──────────── */
process.env.GEMINI_API_KEY = 'chave-de-teste';
responder = (req) => (req.url.includes('generativelanguage') || req.url.includes('models')
  ? { status: 200, corpo: { candidates: [{ content: { parts: [{ text: 'do gemini' }] } }] } }
  : { status: 200, corpo: { content: [{ type: 'text', text: 'do claude' }] } });
r = await pedir(await carregar(), CONVERSA);
if (r.corpo.texto === 'do gemini') ok('com as duas chaves, o Gemini é o escolhido');
else falha('escolha padrão: ' + JSON.stringify(r));

process.env.IA_PROVEDOR = 'anthropic';
r = await pedir(await carregar(), CONVERSA);
if (r.corpo.texto === 'do claude') ok('IA_PROVEDOR=anthropic força o Claude');
else falha('IA_PROVEDOR: ' + JSON.stringify(r));
delete process.env.IA_PROVEDOR;

/* ── 6. histórico que começa pela IA é corrigido ─────────────────────── */
responder = () => ({ status: 200, corpo: { candidates: [{ content: { parts: [{ text: 'ok' }] } }] } });
await pedir(await carregar(), {
  ...CONVERSA,
  mensagens: [{ role: 'assistant', content: 'oi' }, { role: 'user', content: 'e aí?' }],
});
if (ultimoPedido.corpo.contents[0].role === 'user') ok('histórico que abre com a IA é corrigido');
else falha('histórico não corrigido: ' + JSON.stringify(ultimoPedido.corpo.contents));

/* ── 7. a conferência pelo navegador (GET) ───────────────────────────── */
const olhar = async (fn) => {
  const res = await fn(new Request('http://local/.netlify/functions/assistente'));
  return { status: res.status, corpo: await res.json() };
};
process.env.GEMINI_API_KEY = 'chave-de-teste';
process.env.ANTHROPIC_API_KEY = 'sk-ant-teste';
r = await olhar(await carregar());
if (r.corpo.provedor === 'gemini' && r.corpo.modelo === 'gemini-2.5-flash') ok('GET mostra qual IA está ligada');
else falha('GET provedor: ' + JSON.stringify(r.corpo));
if (r.corpo.chaves.GEMINI_API_KEY === true && r.corpo.chaves.ANTHROPIC_API_KEY === true) ok('GET diz quais chaves chegaram na função');
else falha('GET chaves: ' + JSON.stringify(r.corpo.chaves));
if (!JSON.stringify(r.corpo).includes('chave-de-teste') && !JSON.stringify(r.corpo).includes('sk-ant-teste')) ok('GET não vaza o valor de nenhuma chave');
else falha('GET VAZOU CHAVE: ' + JSON.stringify(r.corpo));

delete process.env.GEMINI_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
r = await olhar(await carregar());
if (r.corpo.provedor === 'nenhum') ok('GET avisa quando nenhuma chave chegou');
else falha('GET sem chave: ' + JSON.stringify(r.corpo));
process.env.GEMINI_API_KEY = 'chave-de-teste';

/* ── 8. o assistente é só do administrador ───────────────────────────── */
responder = () => ({ status: 200, corpo: { candidates: [{ content: { parts: [{ text: 'ok' }] } }] } });

r = await pedir(await carregar(), { ...CONVERSA, token: '' });
if (r.status === 403 && /Entre na sua conta/.test(r.corpo.erro)) ok('sem token: recusado antes de gastar cota');
else falha('sem token: ' + JSON.stringify(r));

QUEM = { email: 'outra.pessoa@email.com', localId: 'uid-estranho' };
r = await pedir(await carregar(), CONVERSA);
if (r.status === 403 && /apenas para o administrador/.test(r.corpo.erro)) ok('quem não é o administrador é recusado');
else falha('estranho: ' + JSON.stringify(r));

QUEM = null;
r = await pedir(await carregar(), CONVERSA);
if (r.status === 403) ok('sessão inválida é recusada');
else falha('sessão inválida: ' + JSON.stringify(r));

QUEM = { email: 'joseeduardo1616@gmail.com', localId: 'uid-dono' };
r = await pedir(await carregar(), CONVERSA);
if (r.status === 200 && r.corpo.texto) ok('o administrador consegue usar');
else falha('dono: ' + JSON.stringify(r));

/* sem a chave do Firebase não dá para saber quem pede: tem de recusar, e
   não liberar geral como acontecia antes */
delete process.env.FIREBASE_API_KEY;
r = await pedir(await carregar(), CONVERSA);
if (r.status === 500 && /FIREBASE_API_KEY/.test(r.corpo.erro)) ok('sem FIREBASE_API_KEY o assistente fecha, não abre');
else falha('sem FIREBASE_API_KEY: ' + JSON.stringify(r));
process.env.FIREBASE_API_KEY = 'chave-firebase';

servidor.close();
console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;

/* ── 9. o painel de acessos não pode esconder o recado do servidor ────
   A função responde 404 tanto quando não existe (aí quem responde é o
   Netlify, sem JSON) quanto quando não achou conta com aquele e-mail (aí
   vem JSON com o motivo). Confundir os dois escondia a explicação. */
const painel = async (status, corpo) => {
  /* reproduz o que o parte11.jsx faz com a resposta */
  const r = new Response(corpo === null ? '<html>404</html>' : JSON.stringify(corpo),
    { status, headers: { 'Content-Type': corpo === null ? 'text/html' : 'application/json' } });
  const j = await r.json().catch(() => null);
  if (r.status === 404 && !j) return 'A função de acessos ainda não foi publicada neste site.';
  if (!r.ok || !j) return (j && j.erro) || 'Não deu certo.';
  return j;
};

let m = await painel(404, null);
if (m === 'A função de acessos ainda não foi publicada neste site.') ok('404 sem JSON: avisa que a função não subiu');
else falha('404 sem JSON: ' + m);

m = await painel(404, { erro: 'Não achei conta com esse e-mail. A pessoa precisa criar a conta no site antes.' });
if (/Não achei conta com esse e-mail/.test(m)) ok('404 com JSON: mostra o motivo real, não "função não publicada"');
else falha('404 com JSON: ' + m);

m = await painel(403, { erro: 'Só a conta do dono pode liberar acessos.' });
if (/conta do dono/.test(m)) ok('403: mostra o recado do servidor');
else falha('403: ' + m);

m = await painel(200, { lista: [] });
if (m && Array.isArray(m.lista)) ok('200: a lista chega ao painel');
else falha('200: ' + JSON.stringify(m));

console.log('\n(reexecutando o resumo com os testes do painel)');
console.log(passos.slice(-4).join('\n'));
if (erros.length) process.exitCode = 1;
