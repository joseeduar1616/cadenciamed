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

/* Redireciona as chamadas da função para o servidor falso, sem tocar no
   código de produção: só o destino do fetch muda. */
const fetchReal = globalThis.fetch;
globalThis.fetch = (url, opcoes) => {
  const u = String(url);
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
delete process.env.FIREBASE_API_KEY;
delete process.env.IA_PROVEDOR;
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

/* ── 7. a assinatura ainda é conferida ───────────────────────────────── */
process.env.FIREBASE_API_KEY = 'x';
r = await pedir(await carregar(), { ...CONVERSA, token: '' });
if (r.status === 402 && /Entre na sua conta/.test(r.corpo.erro)) ok('sem token, o assistente é recusado antes de gastar cota');
else falha('checagem de assinatura: ' + JSON.stringify(r));

servidor.close();
console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
