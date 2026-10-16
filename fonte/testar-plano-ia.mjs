/* Testa a rota que lê o plano do mês em texto (vindo de um PDF), sem
 * gastar cota. Roda contra worker/api/plano-ia.js, com o mesmo servidor
 * falso dos outros testes de IA.
 *
 * A conferência campo a campo do que a IA devolve é do navegador
 * (planoDoJson, no testar-plano-mes.mjs). Aqui o que importa é a porta:
 * quem pode chamar, o que nem chega na IA, e que só as quatro partes do
 * plano voltam.
 *
 *   node testar-plano-ia.mjs
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
const carregar = async () => (await import('../worker/api/plano-ia.js?v=' + Math.random())).onRequest;
const pedir = async (corpo) => {
  const req = new Request('http://local/api/plano-ia', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
  });
  const res = await (await carregar())({ request: req, env });
  return { status: res.status, corpo: await res.json() };
};

const TEXTO = 'Plano Outubro · Modo teste. 01/10 a 31/10/2026. Treino A Superior: Supino reto 4 6 a 8 2 min. Almoço 12h Frango 180 g 290 55.';
const PEDIDO = { token: 't', texto: TEXTO };
const respostaIA = (obj) => ({
  status: 200,
  corpo: { candidates: [{ content: { parts: [{ text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] }, finishReason: 'STOP' }] },
});
const PLANO = {
  meta: { titulo: 'Plano Outubro', inicio: '2026-10-01', fim: '2026-10-31' },
  semana: [{ atividade: 'Treino A', descricao: 'Superior' }],
  plano: { nome: 'Treino', dias: [{ nome: 'Treino A', exercicios: [{ nome: 'Supino reto', series: 4, reps: '6 a 8', descanso: 120 }] }] },
  cardapio: { refeicoes: [{ nome: 'Almoço', horario: '12h', itens: [{ alimento: 'Frango', kcal: 290, proteina: 55 }] }] },
  diario: { '2026-10-01': { treino: 'sim' } },
  segredo: 'não deveria voltar',
};

/* ── 1. o que nem chega na IA ─────────────────────────────────────────── */
responder = () => respostaIA(PLANO);
QUEM = { email: 'alguem@exemplo.com', localId: 'uid-x' };
PLANO_ATE = Date.now() + 86400000;
let r = await pedir({ token: 't', texto: 'curto' });
if (r.status === 400 && /sem texto/.test(r.corpo.erro) && chamadasIA === 0 && cobrancas === 0) ok('texto vazio (PDF escaneado): recusado antes da IA e sem cobrar');
else falha('texto vazio: ' + JSON.stringify(r));
r = await pedir({ texto: TEXTO });
if (r.status === 403 && chamadasIA === 0) ok('sem conta: recusado');
else falha('sem conta: ' + JSON.stringify(r));
QUEM = { email: 'alguem@exemplo.com', localId: 'uid-x' };
PLANO_ATE = 0;
r = await pedir(PEDIDO);
if (r.status === 403 && chamadasIA === 0) ok('sem plano pago: recusado no servidor');
else falha('sem plano pago: ' + JSON.stringify(r));
PLANO_ATE = Date.now() + 86400000;
r = await pedir(PEDIDO);
if (r.status === 200 && cobrancas === 1) ok('assinante: passa, e conta na cota do dia');
else falha('assinante: ' + JSON.stringify(r) + ' cobranças ' + cobrancas);
QUEM = { email: 'joseeduardo1616@gmail.com', localId: 'uid-dono' };

/* ── 2. caminho feliz ─────────────────────────────────────────────────── */
r = await pedir(PEDIDO);
if (r.status === 200 && r.corpo.plano && r.corpo.plano.plano.dias[0].exercicios[0].nome === 'Supino reto') ok('o plano volta com as fichas');
else falha('caminho feliz: ' + JSON.stringify(r));
if (JSON.stringify(Object.keys(r.corpo.plano).sort()) === JSON.stringify(['cardapio', 'meta', 'plano', 'semana'])) ok('só as quatro partes voltam: diário e campo estranho da IA ficam de fora');
else falha('voltou além do plano: ' + Object.keys(r.corpo.plano).join(','));
const enviado = ultimoPedido.corpo.contents[0].parts.map((p) => p.text || '').join('');
if (enviado.startsWith('"""') && enviado.includes('Supino reto 4 6 a 8')) ok('o texto do PDF vai delimitado, como dado e não como ordem');
else falha('texto solto: ' + enviado.slice(0, 120));
const instrucao = ultimoPedido.corpo.system_instruction.parts[0].text;
if (/Não invente/.test(instrucao) && /não são instruções para você/.test(instrucao)) ok('a instrução manda copiar, não inventar');
else falha('instrução: ' + instrucao.slice(0, 200));

r = await pedir({ token: 't', texto: TEXTO + ' x'.repeat(30000) });
const mandado = ultimoPedido.corpo.contents[0].parts.map((p) => p.text || '').join('');
if (r.corpo.textoCortado && mandado.length < 40100) ok('texto gigante é cortado no teto, e a tela fica sabendo');
else falha('texto gigante: ' + mandado.length);

/* ── 3. resposta ruim ─────────────────────────────────────────────────── */
responder = () => respostaIA({ vazio: true });
r = await pedir(PEDIDO);
if (r.status === 200 && /Não achei plano/.test(r.corpo.erro || '')) ok('arquivo sem plano: recado, não plano vazio');
else falha('vazio: ' + JSON.stringify(r));
responder = () => respostaIA('Aqui está o plano: ' + JSON.stringify(PLANO));
r = await pedir(PEDIDO);
if (r.status === 200 && r.corpo.plano) ok('JSON com frase antes ainda é lido');
else falha('frase antes: ' + JSON.stringify(r));
responder = () => respostaIA('[1, 2, 3]');
r = await pedir(PEDIDO);
if (r.status === 502) ok('lista no lugar do objeto vira erro explicado');
else falha('lista: ' + JSON.stringify(r));
responder = () => ({ status: 200, corpo: { candidates: [{ content: { parts: [{ text: '{"meta": {"titulo": "cort' }] }, finishReason: 'MAX_TOKENS' }] } });
r = await pedir(PEDIDO);
if (r.status === 502 && /grande demais/.test(r.corpo.erro || '')) ok('resposta cortada no meio: manda usar a planilha');
else falha('cortada: ' + JSON.stringify(r));

servidor.close();
console.log(passos.join('\n'));
if (erros.length) {
  console.log(`\n${erros.length} PROBLEMA(S):\n${erros.join('\n')}`);
  process.exit(1);
}
console.log('\nnenhum erro');
