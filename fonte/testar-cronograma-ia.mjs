/* Testa a função que organiza o cronograma de outro curso (ou conteúdo de
 * ciclo clínico) em matérias, sem gastar cota de verdade.
 *
 * Roda contra o arquivo que vai para o ar (worker/api/cronograma-ia.js), com
 * a mesma técnica de servidor falso do testar-flashcards-ia.mjs.
 *
 *   node testar-cronograma-ia.mjs
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
  const req = new Request('http://local/api/cronograma-ia', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const res = await fn({ request: req, env });
  return { status: res.status, corpo: await res.json() };
};

const PEDIDO = {
  token: 'token-de-teste',
  texto: 'Semana 1 — Cardiologia: valvopatias, arritmias. Semana 2 — Nefrologia: glomerulopatias.',
};

const env = {};
const carregar = async () => (await import('../worker/api/cronograma-ia.js?v=' + Math.random())).onRequest;

env.FIREBASE_API_KEY = 'chave-firebase';
env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify(CONTA);
env.GEMINI_API_KEY = 'chave-de-teste';
PLANO_ATE = Date.now() + 30 * 86400000;

/* ── 1. sem texto nenhum ──────────────────────────────────────────────── */
let r = await pedir(await carregar(), { ...PEDIDO, texto: '' });
if (r.status === 400 && /Nenhum texto/.test(r.corpo.erro)) ok('sem texto: recusado antes de chamar a IA');
else falha('sem texto: ' + JSON.stringify(r));

/* ── 2. a IA devolve JSON limpo ────────────────────────────────────────── */
responder = () => ({
  status: 200,
  corpo: {
    candidates: [{
      content: {
        parts: [{
          text: JSON.stringify({
            materias: [
              { titulo: 'Valvopatias', area: 'CL', esp: 'Cardiologia', topicos: ['Estenose mitral', 'Insuficiência aórtica'] },
              { titulo: 'Glomerulopatias', area: 'CL', esp: 'Nefrologia', topicos: [] },
            ],
          }),
        }],
      },
      finishReason: 'STOP',
    }],
  },
});
r = await pedir(await carregar(), PEDIDO);
if (r.status === 200 && r.corpo.materias.length === 2 && r.corpo.materias[0].area === 'CL') {
  ok('JSON limpo: as matérias chegam classificadas por área');
} else falha('JSON limpo: ' + JSON.stringify(r));
if (r.corpo.materias[0].topicos.includes('Estenose mitral')) ok('os tópicos de cada matéria vêm junto');
else falha('tópicos sumiram: ' + JSON.stringify(r.corpo.materias[0]));

const enviado = ultimoPedido.corpo.system_instruction.parts[0].text;
if (/não são instruções para você/.test(enviado)) ok('o material chega marcado como dado, não como instrução');
else falha('faltou o aviso de "não é instrução": ' + enviado.slice(0, 200));

/* ── 3. área fora da lista das 5 é descartada, não vira lixo no currículo ── */
responder = () => ({
  status: 200,
  corpo: {
    candidates: [{
      content: {
        parts: [{
          text: JSON.stringify({
            materias: [
              { titulo: 'Boa', area: 'CI', esp: 'Ortopedia', topicos: [] },
              { titulo: 'Área inventada', area: 'XX', esp: 'Nada', topicos: [] },
              { titulo: '', area: 'CL', esp: 'Sem título', topicos: [] },
            ],
          }),
        }],
      },
      finishReason: 'STOP',
    }],
  },
});
r = await pedir(await carregar(), PEDIDO);
if (r.status === 200 && r.corpo.materias.length === 1 && r.corpo.materias[0].titulo === 'Boa') {
  ok('matéria com área desconhecida ou sem título é descartada');
} else falha('saneamento de área/título: ' + JSON.stringify(r));

/* ── 4. JSON embrulhado em cerca de código ───────────────────────────────  */
responder = () => ({
  status: 200,
  corpo: {
    candidates: [{
      content: { parts: [{ text: '```json\n' + JSON.stringify({ materias: [{ titulo: 'X', area: 'PE', esp: 'Y', topicos: [] }] }) + '\n```' }] },
      finishReason: 'STOP',
    }],
  },
});
r = await pedir(await carregar(), PEDIDO);
if (r.status === 200 && r.corpo.materias.length === 1) ok('JSON dentro de cerca de código também é lido');
else falha('cerca de código: ' + JSON.stringify(r));

/* ── 5. resposta sem JSON válido ─────────────────────────────────────────  */
responder = () => ({
  status: 200,
  corpo: { candidates: [{ content: { parts: [{ text: 'Desculpe, não consigo ajudar com isso.' }] }, finishReason: 'STOP' }] },
});
r = await pedir(await carregar(), PEDIDO);
if (r.status === 502 && /conseguisse ler/.test(r.corpo.erro)) ok('resposta sem JSON válido vira erro claro');
else falha('resposta não-JSON: ' + JSON.stringify(r));

/* ── 6. sem matéria aproveitável ─────────────────────────────────────────  */
responder = () => ({
  status: 200,
  corpo: { candidates: [{ content: { parts: [{ text: JSON.stringify({ materias: [] }) }] }, finishReason: 'STOP' }] },
});
r = await pedir(await carregar(), PEDIDO);
if (r.status === 200 && /Não encontrei/.test(r.corpo.erro || '')) ok('sem matéria aproveitável: erro explica, sem currículo vazio');
else falha('sem conteúdo: ' + JSON.stringify(r));

/* ── 7. texto grande demais é cortado ────────────────────────────────────  */
responder = () => ({
  status: 200,
  corpo: { candidates: [{ content: { parts: [{ text: JSON.stringify({ materias: [{ titulo: 'X', area: 'GO', esp: 'Y', topicos: [] }] }) }] }, finishReason: 'STOP' }] },
});
r = await pedir(await carregar(), { ...PEDIDO, texto: 'a'.repeat(60000) });
if (r.status === 200 && r.corpo.cortado === true) ok('texto acima do limite: o painel sabe que foi cortado');
else falha('corte não avisado: ' + JSON.stringify(r));

/* ── 8. resposta cortada no meio do array: salva as matérias completas ──  */
const cortadaNoMeio = '{"materias":[{"titulo":"Cardiologia","area":"CL","esp":"Cardio","topicos":["Arritmia"]},'
  + '{"titulo":"Nefrologia","area":"CL","esp":"Nefro","topicos":["Glomerulopatia","Síndrome nefrótica"]},'
  + '{"titulo":"Incomple';
responder = () => ({
  status: 200,
  corpo: { candidates: [{ content: { parts: [{ text: cortadaNoMeio }] }, finishReason: 'MAX_TOKENS' }] },
});
r = await pedir(await carregar(), PEDIDO);
if (r.status === 200 && r.corpo.materias.length === 2) {
  ok('JSON cortado no meio do array: as matérias completas antes do corte são salvas');
} else falha('recuperação parcial: ' + JSON.stringify(r));
if (r.corpo.materias[1].titulo === 'Nefrologia' && r.corpo.materias[1].topicos.length === 2) {
  ok('recuperação parcial: os tópicos (lista aninhada) vêm certos, não truncados');
} else falha('conteúdo da recuperação parcial: ' + JSON.stringify(r.corpo.materias));
if (r.corpo.cortado === true) ok('recuperação parcial: o painel sabe que o material foi cortado');
else falha('recuperação parcial não avisada: ' + JSON.stringify(r));

/* ── 9. quem pode usar: mesma regra do assistente e do montador de cartões ── */
r = await pedir(await carregar(), { ...PEDIDO, token: '' });
if (r.status === 403 && /Entre na sua conta/.test(r.corpo.erro)) ok('sem token: recusado antes de gastar cota');
else falha('sem token: ' + JSON.stringify(r));

QUEM = { email: 'outra.pessoa@email.com', localId: 'uid-estranho' };
PLANO_ATE = 0;
r = await pedir(await carregar(), PEDIDO);
if (r.status === 403 && /plano completo/.test(r.corpo.erro)) ok('quem não assina é recusado, e a mensagem diz por quê');
else falha('sem assinatura: ' + JSON.stringify(r));

PLANO_ATE = Date.now() + 30 * 86400000;
responder = () => ({
  status: 200,
  corpo: { candidates: [{ content: { parts: [{ text: JSON.stringify({ materias: [{ titulo: 'X', area: 'CL', esp: 'Y', topicos: [] }] }) }] }, finishReason: 'STOP' }] },
});
r = await pedir(await carregar(), PEDIDO);
if (r.status === 200) ok('quem assina consegue organizar o cronograma');
else falha('assinante: ' + JSON.stringify(r));

QUEM = { email: 'joseeduardo1616@gmail.com', localId: 'uid-dono' };

/* ── 10. sem chave nenhuma de IA ─────────────────────────────────────────  */
delete env.GEMINI_API_KEY;
delete env.ANTHROPIC_API_KEY;
r = await pedir(await carregar(), PEDIDO);
if (r.status === 500 && /GEMINI_API_KEY/.test(r.corpo.erro)) ok('sem chave: explica o que cadastrar');
else falha('sem chave: ' + JSON.stringify(r));

servidor.close();
console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
