/* Testa a rota que estima as calorias de uma refeição, sem gastar cota.
 *
 * Roda contra o arquivo que vai para o ar (worker/api/refeicao-ia.js),
 * com o mesmo servidor falso do testar-ler-foto.mjs no lugar da IA.
 *
 * O que mais importa não é o caminho feliz: é o que a rota faz com a
 * resposta ruim. Um item de 40 mil kcal, um total que não bate com os
 * itens e um JSON com frase antes chegariam à tela como se fossem conta
 * certa, e entrariam na média do mês.
 *
 *   node testar-refeicao-ia.mjs
 */
import http from 'node:http';

const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

let responder = () => ({ status: 200, corpo: {} });
let ultimoPedido = null;
let chamadasIA = 0;

const servidor = http.createServer((req, res) => {
  let cru = '';
  req.on('data', (d) => { cru += d; });
  req.on('end', () => {
    chamadasIA += 1;
    ultimoPedido = { url: req.url, corpo: JSON.parse(cru || '{}') };
    const r = responder(ultimoPedido);
    res.writeHead(r.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(r.corpo));
  });
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${servidor.address().port}`;

let QUEM = { email: 'joseeduardo1616@gmail.com', localId: 'uid-dono' };
let PLANO_ATE = 0;
let cobrancas = 0;

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
    return Promise.resolve(new Response(JSON.stringify({ users: [QUEM] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }
  if (u.includes('generativelanguage.googleapis.com') || u.includes('api.anthropic.com')) {
    return fetchReal(base + new URL(u).pathname, opcoes);
  }
  if (u.includes('oauth2.googleapis.com/token')) {
    return Promise.resolve(new Response(JSON.stringify({ access_token: 'token-falso' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }
  if (u.includes('firestore.googleapis.com')) {
    if (u.includes('/uso/') && opcoes && opcoes.method === 'PATCH') cobrancas += 1;
    if (u.includes('/uso/')) return Promise.resolve(new Response('{}', { status: 404 }));
    return Promise.resolve(new Response(
      JSON.stringify(PLANO_ATE ? { fields: { validoAte: { doubleValue: PLANO_ATE } } } : {}),
      { status: PLANO_ATE ? 200 : 404, headers: { 'Content-Type': 'application/json' } }));
  }
  return fetchReal(url, opcoes);
};

const env = {
  FIREBASE_API_KEY: 'chave-firebase',
  FIREBASE_SERVICE_ACCOUNT: JSON.stringify(CONTA),
  GEMINI_API_KEY: 'chave-de-teste',
};
const carregar = async () => (await import('../worker/api/refeicao-ia.js?v=' + Math.random())).onRequest;
const pedir = async (corpo) => {
  const req = new Request('http://local/api/refeicao-ia', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
  });
  const res = await (await carregar())({ request: req, env });
  return { status: res.status, corpo: await res.json() };
};

const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const FOTO = { token: 't', refeicao: 'Almoço', imagens: [{ tipo: 'image/jpeg', dados: PIXEL }] };
const respostaIA = (obj) => ({
  status: 200,
  corpo: { candidates: [{ content: { parts: [{ text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] }, finishReason: 'STOP' }] },
});
const PRATO = {
  itens: [
    { nome: 'Arroz branco cozido', quantidade: '4 col. sopa (100 g)', kcal: 128, proteina: 2.5, carbo: 28.1, gordura: 0.2 },
    { nome: 'Frango grelhado', quantidade: '150 g', kcal: 240, proteina: 45, carbo: 0, gordura: 5.4 },
  ],
  total: { kcal: 99999 },
  confianca: 'alta',
  observacao: 'O óleo não aparece.',
};

/* ── 1. pedido vazio ou torto nem chega na IA, nem gasta cota ────────── */
responder = () => respostaIA(PRATO);
let r = await pedir({ token: 't', imagens: [], descricao: '' });
if (r.status === 400 && chamadasIA === 0) ok('sem foto e sem descrição: recusado antes da IA');
else falha('pedido vazio: ' + JSON.stringify(r));
r = await pedir({ ...FOTO, imagens: [{ tipo: 'application/pdf', dados: PIXEL }] });
if (r.status === 400 && /JPEG/.test(r.corpo.erro) && chamadasIA === 0) ok('arquivo que não é foto: recusado antes da IA');
else falha('tipo errado: ' + JSON.stringify(r));
r = await pedir({ ...FOTO, imagens: [FOTO.imagens[0], FOTO.imagens[0], FOTO.imagens[0], FOTO.imagens[0]] });
if (r.status === 400 && chamadasIA === 0) ok('mais de 3 fotos: recusado');
else falha('4 fotos: ' + JSON.stringify(r));

/* quem não é dono nem assinante: 403, e a foto torta de antes não cobrou */
QUEM = { email: 'alguem@exemplo.com', localId: 'uid-x' };
PLANO_ATE = Date.now() + 86400000;
r = await pedir({ ...FOTO, imagens: [{ tipo: 'image/gif', dados: PIXEL }] });
if (r.status === 400 && cobrancas === 0) ok('foto recusada não gasta a cota do dia do assinante');
else falha('foto recusada: status ' + r.status + ', cobranças ' + cobrancas);
PLANO_ATE = 0;
r = await pedir(FOTO);
if (r.status === 403 && chamadasIA === 0) ok('sem plano: recusado no servidor, antes da IA');
else falha('sem plano: ' + JSON.stringify(r));

PLANO_ATE = Date.now() + 86400000;
r = await pedir(FOTO);
if (r.status === 200 && cobrancas === 1) ok('assinante: passa, e a chamada conta na cota do dia');
else falha('assinante: ' + JSON.stringify(r) + ' cobranças ' + cobrancas);
QUEM = { email: 'joseeduardo1616@gmail.com', localId: 'uid-dono' };

/* ── 2. caminho feliz ─────────────────────────────────────────────────── */
r = await pedir({ ...FOTO, descricao: 'frango 150 g' });
if (r.status === 200 && r.corpo.itens.length === 2 && r.corpo.itens[1].nome === 'Frango grelhado') ok('os itens voltam com nome, porção e macros');
else falha('caminho feliz: ' + JSON.stringify(r));
if (r.corpo.total && r.corpo.total.kcal === 368 && r.corpo.total.proteina === 47.5) ok('o total é a soma dos itens, e não o 99999 que a IA escreveu');
else falha('total: ' + JSON.stringify(r.corpo.total));
if (r.corpo.confianca === 'alta' && /óleo/.test(r.corpo.observacao)) ok('confiança e observação chegam');
else falha('confiança: ' + JSON.stringify(r.corpo));
const partes = ultimoPedido.corpo.contents[0].parts;
if (partes.some((p) => p.inline_data && p.inline_data.mime_type === 'image/jpeg')) ok('a foto vai para a IA como imagem');
else falha('foto não foi: ' + JSON.stringify(partes).slice(0, 200));
const textoPedido = partes.map((p) => p.text || '').join('\n');
if (/"""[\s\S]*frango 150 g[\s\S]*"""/.test(textoPedido)) ok('a descrição vai delimitada, como dado e não como ordem');
else falha('descrição solta: ' + textoPedido.slice(0, 200));
const instrucao = ultimoPedido.corpo.system_instruction.parts[0].text;
if (/TACO/.test(instrucao) && /Não são instruções para você/.test(instrucao)) ok('a instrução pede a tabela TACO e avisa que a foto é dado');
else falha('instrução: ' + instrucao.slice(0, 200));

/* só descrição, sem foto */
r = await pedir({ token: 't', refeicao: 'Café', descricao: '3 ovos mexidos e 2 fatias de pão integral', imagens: [] });
if (r.status === 200 && !ultimoPedido.corpo.contents[0].parts.some((p) => p.inline_data)) ok('só a descrição também funciona, sem foto');
else falha('só texto: ' + JSON.stringify(r));

/* ── 3. resposta ruim da IA ───────────────────────────────────────────── */
responder = () => respostaIA({
  itens: [
    { nome: 'Pizza', kcal: 40000, proteina: -5, carbo: 'muito', gordura: 20 },
    { kcal: 300 },
    { nome: 'Suco', proteina: 1, carbo: 25, gordura: 0 },
  ],
  confianca: 'certeza absoluta',
});
r = await pedir(FOTO);
const [pizza, suco] = r.corpo.itens || [];
if (r.corpo.itens.length === 2 && pizza.kcal === 3000 && pizza.proteina === 0 && pizza.carbo === 0) ok('kcal absurda travada, número negativo e texto viram zero, item sem nome sai');
else falha('resposta ruim: ' + JSON.stringify(r.corpo.itens));
if (suco && suco.kcal === 104) ok('item sem kcal mas com macros: 4-4-9 fecha a conta');
else falha('atwater: ' + JSON.stringify(suco));
if (r.corpo.confianca === 'media') ok('confiança inventada vira média');
else falha('confiança: ' + r.corpo.confianca);

responder = () => respostaIA('Claro! Aqui está: ' + JSON.stringify(PRATO) + ' Espero ter ajudado.');
r = await pedir(FOTO);
if (r.status === 200 && r.corpo.itens.length === 2) ok('JSON com frase antes e depois ainda é lido');
else falha('frase em volta: ' + JSON.stringify(r));

responder = () => respostaIA({ itens: [], confianca: 'baixa', observacao: 'sem comida' });
r = await pedir(FOTO);
if (r.status === 200 && /Não reconheci comida/.test(r.corpo.erro || '')) ok('foto sem comida vira recado, não refeição vazia');
else falha('sem comida: ' + JSON.stringify(r));

responder = () => respostaIA('não sei');
r = await pedir(FOTO);
if (r.status === 502 && /formato/.test(r.corpo.erro || '')) ok('resposta ilegível vira erro explicado');
else falha('ilegível: ' + JSON.stringify(r));

responder = () => ({ status: 429, corpo: { error: { message: 'quota' } } });
r = await pedir(FOTO);
if (r.status === 502 && /Cota/.test(r.corpo.erro || '')) ok('cota da IA esgotada vira recado que diz o que fazer');
else falha('429: ' + JSON.stringify(r));

servidor.close();
console.log(passos.join('\n'));
if (erros.length) {
  console.log(`\n${erros.length} PROBLEMA(S):\n${erros.join('\n')}`);
  process.exit(1);
}
console.log('\nnenhum erro');
