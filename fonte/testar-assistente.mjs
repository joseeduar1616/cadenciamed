/* Testa a função do assistente sem gastar cota de verdade.
 *
 * Roda contra o arquivo que vai para o ar (worker/api/assistente.js).
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
   o dono, um assinante, um estranho e uma sessão inválida. */
let QUEM = { email: 'joseeduardo1616@gmail.com', localId: 'uid-dono' };

/* Até quando vale a assinatura de quem está pedindo. 0 = não assina. */
let PLANO_ATE = 0;

/* Chave privada de teste, gerada na hora. Não é segredo de nada: serve só
   para o assinador RSA ter algo válido para assinar ao pedir o token da
   conta de serviço. */
const { generateKeyPairSync } = await import('node:crypto');
const CONTA = {
  client_email: 'teste@exemplo.iam.gserviceaccount.com',
  private_key: generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ type: 'pkcs8', format: 'pem' }),
};

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
  /* A assinatura é lida com a conta de serviço: é assim que o assistente
     sabe se quem pede tem plano em dia. */
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
  const req = new Request('http://local/api/assistente', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const res = await fn({ request: req, env });
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

/* As variáveis de ambiente do Cloudflare chegam num objeto, não em
   process.env, então o teste monta esse objeto na mão. */
const env = {};
const carregar = async () => (await import('../worker/api/assistente.js?v=' + Math.random())).onRequest;

/* ── 1. sem chave nenhuma ────────────────────────────────────────────── */
delete env.GEMINI_API_KEY;
delete env.ANTHROPIC_API_KEY;
delete env.IA_PROVEDOR;
env.FIREBASE_API_KEY = 'chave-firebase';
let r = await pedir(await carregar(), CONVERSA);
if (r.status === 500 && /GEMINI_API_KEY/.test(r.corpo.erro)) ok('sem chave: explica o que cadastrar');
else falha('sem chave: ' + JSON.stringify(r));

/* ── 2. Gemini responde certo ────────────────────────────────────────── */
env.GEMINI_API_KEY = 'chave-de-teste';
responder = () => ({
  status: 200,
  corpo: { candidates: [{ content: { parts: [{ text: 'Comece por Glomerulopatias.' }] }, finishReason: 'STOP' }] },
});
r = await pedir(await carregar(), CONVERSA);
if (r.status === 200 && r.corpo.texto === 'Comece por Glomerulopatias.') ok('Gemini: resposta chega ao painel');
else falha('Gemini resposta: ' + JSON.stringify(r));

/* formato do pedido que saiu */
const p = ultimoPedido;
if (/gemini-3\.6-flash:generateContent/.test(p.url)) ok('Gemini: modelo e método certos na URL');
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
if (p.corpo.generationConfig.maxOutputTokens >= 3000) ok('Gemini: limite de saída aplicado, com folga para um plano inteiro');
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

/* ── modelo aposentado ───────────────────────────────────────────────
   Aconteceu de verdade: o Google tirou o gemini-2.5-flash de circulação e o
   painel mostrou a recusa crua, em inglês, sem dizer o que fazer. O conserto
   não exige publicar de novo, é cadastrar GEMINI_MODELO — e é isso que a
   mensagem precisa dizer. */
responder = () => ({
  status: 400,
  corpo: {
    error: {
      message: 'This model models/gemini-3.6-flash is no longer available to new users. '
        + 'Please update your code to use models/gemini-4.0-flash for the latest features.',
    },
  },
});
r = await pedir(await carregar(), CONVERSA);
if (/GEMINI_MODELO/.test(r.corpo.erro)) ok('modelo aposentado: diz qual variável cadastrar');
else falha('modelo aposentado: ' + JSON.stringify(r));
if (/gemini-4\.0-flash/.test(r.corpo.erro)) ok('modelo aposentado: aproveita o substituto que o provedor sugeriu');
else falha('não citou o substituto: ' + JSON.stringify(r.corpo.erro));
if (!/Cadastre GEMINI_MODELO com "gemini-3\.6-flash"/.test(r.corpo.erro)) ok('modelo aposentado: não sugere o modelo que acabou de ser recusado');
else falha('sugeriu o próprio modelo recusado: ' + r.corpo.erro);

/* sem substituto citado, ainda assim aponta o caminho */
responder = () => ({ status: 404, corpo: { error: { message: 'Model not found' } } });
r = await pedir(await carregar(), CONVERSA);
if (/GEMINI_MODELO/.test(r.corpo.erro) && /modelo atual/.test(r.corpo.erro)) ok('modelo desconhecido: aponta a variável mesmo sem sugestão do provedor');
else falha('modelo desconhecido: ' + JSON.stringify(r));

/* Resposta que veio, mas parou no teto: chega ao painel marcada, senão
   acaba no meio da frase e parece travamento. */
responder = () => ({
  status: 200,
  corpo: { candidates: [{ content: { parts: [{ text: 'Comece por Glomerulo' }] }, finishReason: 'MAX_TOKENS' }] },
});
r = await pedir(await carregar(), CONVERSA);
if (r.corpo.texto === 'Comece por Glomerulo' && r.corpo.cortado === true) ok('resposta cortada no teto chega marcada como cortada');
else falha('resposta cortada: ' + JSON.stringify(r));

responder = () => ({
  status: 200,
  corpo: { candidates: [{ content: { parts: [{ text: 'Resposta inteira.' }] }, finishReason: 'STOP' }] },
});
r = await pedir(await carregar(), CONVERSA);
if (r.corpo.cortado === false) ok('resposta inteira não é marcada como cortada');
else falha('marcou inteira como cortada: ' + JSON.stringify(r));

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
delete env.GEMINI_API_KEY;
env.ANTHROPIC_API_KEY = 'sk-ant-teste';
responder = () => ({ status: 200, corpo: { content: [{ type: 'text', text: 'Resposta do Claude.' }] } });
r = await pedir(await carregar(), CONVERSA);
if (r.status === 200 && r.corpo.texto === 'Resposta do Claude.') ok('Anthropic: continua funcionando igual');
else falha('Anthropic: ' + JSON.stringify(r));
if (ultimoPedido.headers['x-api-key'] === 'sk-ant-teste') ok('Anthropic: chave vai no cabeçalho x-api-key');
else falha('Anthropic cabeçalho errado');

/* ── 5. as duas chaves: o Gemini ganha, e IA_PROVEDOR manda ──────────── */
env.GEMINI_API_KEY = 'chave-de-teste';
responder = (req) => (req.url.includes('generativelanguage') || req.url.includes('models')
  ? { status: 200, corpo: { candidates: [{ content: { parts: [{ text: 'do gemini' }] } }] } }
  : { status: 200, corpo: { content: [{ type: 'text', text: 'do claude' }] } });
r = await pedir(await carregar(), CONVERSA);
if (r.corpo.texto === 'do gemini') ok('com as duas chaves, o Gemini é o escolhido');
else falha('escolha padrão: ' + JSON.stringify(r));

env.IA_PROVEDOR = 'anthropic';
r = await pedir(await carregar(), CONVERSA);
if (r.corpo.texto === 'do claude') ok('IA_PROVEDOR=anthropic força o Claude');
else falha('IA_PROVEDOR: ' + JSON.stringify(r));
delete env.IA_PROVEDOR;

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
  const res = await fn({ request: new Request('http://local/api/assistente'), env });
  return { status: res.status, corpo: await res.json() };
};
env.GEMINI_API_KEY = 'chave-de-teste';
env.ANTHROPIC_API_KEY = 'sk-ant-teste';
r = await olhar(await carregar());
if (r.corpo.provedor === 'gemini' && r.corpo.modelo === 'gemini-3.6-flash') ok('GET mostra qual IA está ligada');
else falha('GET provedor: ' + JSON.stringify(r.corpo));
if (r.corpo.chaves.GEMINI_API_KEY === true && r.corpo.chaves.ANTHROPIC_API_KEY === true) ok('GET diz quais chaves chegaram na função');
else falha('GET chaves: ' + JSON.stringify(r.corpo.chaves));
if (!JSON.stringify(r.corpo).includes('chave-de-teste') && !JSON.stringify(r.corpo).includes('sk-ant-teste')) ok('GET não vaza o valor de nenhuma chave');
else falha('GET VAZOU CHAVE: ' + JSON.stringify(r.corpo));

delete env.GEMINI_API_KEY;
delete env.ANTHROPIC_API_KEY;
r = await olhar(await carregar());
if (r.corpo.provedor === 'nenhum') ok('GET avisa quando nenhuma chave chegou');
else falha('GET sem chave: ' + JSON.stringify(r.corpo));
env.GEMINI_API_KEY = 'chave-de-teste';

/* ── 8. quem pode usar: o dono e quem tem plano em dia ───────────────── */
responder = () => ({ status: 200, corpo: { candidates: [{ content: { parts: [{ text: 'ok' }] } }] } });

r = await pedir(await carregar(), { ...CONVERSA, token: '' });
if (r.status === 403 && /Entre na sua conta/.test(r.corpo.erro)) ok('sem token: recusado antes de gastar cota');
else falha('sem token: ' + JSON.stringify(r));

/* Sem conta de serviço não há como conferir plano. Aí só o dono passa:
   liberar geral deixaria qualquer pessoa gastando a cota de quem paga. */
QUEM = { email: 'outra.pessoa@email.com', localId: 'uid-estranho' };
delete env.FIREBASE_SERVICE_ACCOUNT;
r = await pedir(await carregar(), CONVERSA);
if (r.status === 403 && !r.corpo.texto) ok('sem conta de serviço, quem não é dono é recusado');
else falha('estranho sem conta de serviço: ' + JSON.stringify(r));
env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify(CONTA);

/* Com conta de serviço, quem manda é a assinatura. */
PLANO_ATE = 0;
r = await pedir(await carregar(), CONVERSA);
if (r.status === 403 && /plano completo/.test(r.corpo.erro)) ok('quem não assina é recusado, e a mensagem diz por quê');
else falha('sem assinatura: ' + JSON.stringify(r));

PLANO_ATE = Date.now() + 30 * 86400000;
r = await pedir(await carregar(), CONVERSA);
if (r.status === 200 && r.corpo.texto) ok('quem assina consegue usar o assistente');
else falha('assinante: ' + JSON.stringify(r));

/* Assinatura vencida não vale, senão o acesso nunca acabaria. */
PLANO_ATE = Date.now() - 86400000;
r = await pedir(await carregar(), CONVERSA);
if (r.status === 403) ok('assinatura vencida perde o assistente');
else falha('assinatura vencida: ' + JSON.stringify(r));
PLANO_ATE = 0;

QUEM = null;
r = await pedir(await carregar(), CONVERSA);
if (r.status === 403) ok('sessão inválida é recusada');
else falha('sessão inválida: ' + JSON.stringify(r));

QUEM = { email: 'joseeduardo1616@gmail.com', localId: 'uid-dono' };
r = await pedir(await carregar(), CONVERSA);
if (r.status === 200 && r.corpo.texto) ok('o administrador consegue usar sem assinar nada');
else falha('dono: ' + JSON.stringify(r));

/* sem a chave do Firebase não dá para saber quem pede: tem de recusar, e
   não liberar geral como acontecia antes */
delete env.FIREBASE_API_KEY;
r = await pedir(await carregar(), CONVERSA);
if (r.status === 500 && /FIREBASE_API_KEY/.test(r.corpo.erro)) ok('sem FIREBASE_API_KEY o assistente fecha, não abre');
else falha('sem FIREBASE_API_KEY: ' + JSON.stringify(r));
env.FIREBASE_API_KEY = 'chave-firebase';

servidor.close();
console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;

/* ── 9. o painel não pode esconder o motivo do erro ──────────────────
   Três casos que antes viravam a mesma frase inútil "Não deu certo.":
   o servidor ausente (hospedagem devolve a página do site com status 200),
   o 404 com explicação, e o 403 do servidor. */
const { lerRespostaDoServidor } = await import('./_leitor.mjs');

const painel = async (status, corpo, tipo = 'application/json') => {
  const r = new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
    { status, headers: { 'Content-Type': tipo } });
  return lerRespostaDoServidor(r, 'O painel de acessos');
};

/* o caso que estava acontecendo de verdade: site em hospedagem só de
   arquivos, /api devolve o index.html com status 200 */
let m = await painel(200, '<!doctype html><html><body>o site</body></html>', 'text/html');
if (/não está publicado neste endereço/.test(m.erro)) ok('página do site no lugar de dados: explica que falta publicar o servidor');
else falha('HTML com 200: ' + JSON.stringify(m));

m = await painel(404, '<html>404</html>', 'text/html');
if (/não está publicado|não foi publicado/.test(m.erro)) ok('404 sem JSON: avisa que o servidor não subiu');
else falha('404 sem JSON: ' + JSON.stringify(m));

m = await painel(404, { erro: 'Não achei conta com esse e-mail. A pessoa precisa criar a conta no site antes.' });
if (/Não achei conta com esse e-mail/.test(m.erro)) ok('404 com JSON: mostra o motivo real, não "não publicado"');
else falha('404 com JSON: ' + JSON.stringify(m));

m = await painel(403, { erro: 'Só a conta do dono pode liberar acessos.' });
if (/conta do dono/.test(m.erro)) ok('403: mostra o recado do servidor');
else falha('403: ' + JSON.stringify(m));

m = await painel(500, { erro: 'Faltam FIREBASE_API_KEY ou FIREBASE_SERVICE_ACCOUNT.' });
if (/FIREBASE_API_KEY/.test(m.erro)) ok('500 com JSON: mostra o que falta configurar');
else falha('500 com JSON: ' + JSON.stringify(m));

m = await painel(200, { lista: [] });
if (m.dados && Array.isArray(m.dados.lista)) ok('200 com JSON: a lista chega ao painel');
else falha('200 com JSON: ' + JSON.stringify(m));

console.log('\n(testes do leitor de resposta)');
console.log(passos.slice(-6).join('\n'));
if (erros.length) process.exitCode = 1;
