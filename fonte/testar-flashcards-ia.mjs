/* Testa a função que monta flashcards a partir de um PDF ou Word, sem
 * gastar cota de verdade.
 *
 * Roda contra o arquivo que vai para o ar (worker/api/flashcards-ia.js).
 * Sobe um servidor falso no lugar da API do Google e da Anthropic — a
 * mesma técnica de testar-assistente.mjs — e confere o texto que sai
 * daqui, o JSON que a IA devolve e como cada formato de resposta vira
 * cartões (ou um erro claro).
 *
 *   node testar-flashcards-ia.mjs
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
  const req = new Request('http://local/api/flashcards-ia', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const res = await fn({ request: req, env });
  return { status: res.status, corpo: await res.json() };
};

const PEDIDO = {
  token: 'token-de-teste',
  texto: 'Tríade da síndrome nefrítica: hematúria, hipertensão e edema. [[img:pagina-3.jpg]]',
  baralho: 'Nefrologia',
};

const env = {};
const carregar = async () => (await import('../worker/api/flashcards-ia.js?v=' + Math.random())).onRequest;

env.FIREBASE_API_KEY = 'chave-firebase';
env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify(CONTA);
env.GEMINI_API_KEY = 'chave-de-teste';
PLANO_ATE = Date.now() + 30 * 86400000;

/* ── 1. sem texto nenhum ──────────────────────────────────────────────── */
let r = await pedir(await carregar(), { ...PEDIDO, texto: '' });
if (r.status === 400 && /Nenhum texto/.test(r.corpo.erro)) ok('sem texto: recusado antes de chamar a IA');
else falha('sem texto: ' + JSON.stringify(r));

/* ── 2. a IA devolve JSON limpo ──────────────────────────────────────── */
responder = () => ({
  status: 200,
  corpo: {
    candidates: [{
      content: {
        parts: [{
          text: JSON.stringify({
            baralho: 'Nefrologia',
            cartoes: [
              { frente: 'Tríade da síndrome nefrítica', verso: 'Hematúria, hipertensão e edema [[img:pagina-3.jpg]]' },
              { frente: 'Outra pergunta', verso: 'Outra resposta' },
            ],
          }),
        }],
      },
      finishReason: 'STOP',
    }],
  },
});
r = await pedir(await carregar(), PEDIDO);
if (r.status === 200 && r.corpo.baralho === 'Nefrologia' && r.corpo.cartoes.length === 2) {
  ok('JSON limpo: os cartões chegam ao painel');
} else falha('JSON limpo: ' + JSON.stringify(r));
if (r.corpo.cartoes[0].verso.includes('[[img:pagina-3.jpg]]')) ok('o marcador de imagem sobrevive no verso do cartão');
else falha('marcador sumiu: ' + JSON.stringify(r.corpo.cartoes[0]));

/* o material enviado veio delimitado e a instrução deixou claro que é dado,
   não ordem — o mesmo cuidado do cronograma anexado no assistente */
const enviado = ultimoPedido.corpo.system_instruction.parts[0].text;
if (/não são instruções para você/.test(enviado)) ok('o material chega marcado como dado, não como instrução');
else falha('faltou o aviso de "não é instrução": ' + enviado.slice(0, 200));

/* ── 3. a IA embrulha o JSON em cerca de código ──────────────────────── */
responder = () => ({
  status: 200,
  corpo: {
    candidates: [{
      content: {
        parts: [{
          text: '```json\n' + JSON.stringify({ baralho: 'Cardio', cartoes: [{ frente: 'a', verso: 'b' }] }) + '\n```',
        }],
      },
      finishReason: 'STOP',
    }],
  },
});
r = await pedir(await carregar(), PEDIDO);
if (r.status === 200 && r.corpo.cartoes.length === 1) ok('JSON dentro de cerca de código também é lido');
else falha('cerca de código: ' + JSON.stringify(r));

/* ── 4. a IA devolve algo que não é JSON ─────────────────────────────── */
responder = () => ({
  status: 200,
  corpo: { candidates: [{ content: { parts: [{ text: 'Desculpe, não consigo ajudar com isso.' }] }, finishReason: 'STOP' }] },
});
r = await pedir(await carregar(), PEDIDO);
if (r.status === 502 && /conseguisse ler/.test(r.corpo.erro)) ok('resposta sem JSON válido vira erro claro, não painel quebrado');
else falha('resposta não-JSON: ' + JSON.stringify(r));

/* ── 5. a IA decide que não há conteúdo aproveitável ─────────────────── */
responder = () => ({
  status: 200,
  corpo: { candidates: [{ content: { parts: [{ text: JSON.stringify({ baralho: '', cartoes: [] }) }] }, finishReason: 'STOP' }] },
});
r = await pedir(await carregar(), PEDIDO);
if (r.status === 200 && Array.isArray(r.corpo.cartoes) === false && /Não encontrei/.test(r.corpo.erro || '')) {
  ok('sem cartão aproveitável: erro explica, em vez de baralho vazio');
} else falha('sem conteúdo: ' + JSON.stringify(r));

/* ── 6. texto grande demais é cortado, e o aviso chega ao painel ─────── */
responder = () => ({
  status: 200,
  corpo: { candidates: [{ content: { parts: [{ text: JSON.stringify({ baralho: 'X', cartoes: [{ frente: 'a', verso: 'b' }] }) }] }, finishReason: 'STOP' }] },
});
r = await pedir(await carregar(), { ...PEDIDO, texto: 'a'.repeat(60000) });
if (r.status === 200 && r.corpo.cortado === true) ok('texto acima do limite: o painel sabe que foi cortado');
else falha('corte não avisado: ' + JSON.stringify(r));
const textoEnviado = ultimoPedido.corpo.contents[0].parts[0].text;
if (textoEnviado.length < 60000) ok('o texto que sai daqui já vem cortado no limite, antes de chegar à IA');
else falha('texto não foi cortado antes de enviar: ' + textoEnviado.length);

/* ── 6b. "cobrir tudo": teto maior e instrução extra ─────────────────── */
responder = () => ({
  status: 200,
  corpo: { candidates: [{ content: { parts: [{ text: JSON.stringify({ baralho: 'X', cartoes: [{ frente: 'a', verso: 'b' }] }) }] }, finishReason: 'STOP' }] },
});
r = await pedir(await carregar(), { ...PEDIDO, cobrirTudo: true });
if (r.status === 200) ok('cobrirTudo: pedido aceito normalmente');
else falha('cobrirTudo aceito: ' + JSON.stringify(r));
if (ultimoPedido.corpo.generationConfig.maxOutputTokens >= 12000) {
  ok('cobrirTudo: teto de saída sobe para caber muito mais cartão');
} else falha('cobrirTudo maxOutputTokens: ' + JSON.stringify(ultimoPedido.corpo.generationConfig));
if (/TODOS os cartões possíveis/.test(ultimoPedido.corpo.system_instruction.parts[0].text)) {
  ok('cobrirTudo: instrução extra de cobertura completa entra no pedido');
} else falha('cobrirTudo instrução ausente');

/* sem marcar, nem o teto maior nem a instrução extra entram */
r = await pedir(await carregar(), PEDIDO);
if (ultimoPedido.corpo.generationConfig.maxOutputTokens < 12000) ok('sem cobrirTudo: teto de saída continua o padrão');
else falha('teto subiu sem pedir: ' + JSON.stringify(ultimoPedido.corpo.generationConfig));
if (!/TODOS os cartões possíveis/.test(ultimoPedido.corpo.system_instruction.parts[0].text)) {
  ok('sem cobrirTudo: instrução de cobertura completa fica de fora');
} else falha('instrução de cobrirTudo vazou sem ser pedida');

/* ── 6c. resposta cortada no meio do array: salva os cartões completos ── */
const doisCompletos = '{"baralho":"Cardio","cartoes":[{"frente":"Pergunta 1","verso":"Resposta 1"},'
  + '{"frente":"Pergunta 2","verso":"Resposta 2"},{"frente":"Pergunta 3 incomple';
responder = () => ({
  status: 200,
  corpo: { candidates: [{ content: { parts: [{ text: doisCompletos }] }, finishReason: 'MAX_TOKENS' }] },
});
r = await pedir(await carregar(), { ...PEDIDO, cobrirTudo: true });
if (r.status === 200 && r.corpo.cartoes.length === 2) {
  ok('JSON cortado no meio do array: os cartões completos antes do corte são salvos');
} else falha('recuperação parcial: ' + JSON.stringify(r));
if (r.corpo.cartoes[1].frente === 'Pergunta 2' && r.corpo.cartoes[1].verso === 'Resposta 2') {
  ok('recuperação parcial: o conteúdo dos cartões salvos vem certo, não truncado');
} else falha('conteúdo da recuperação parcial: ' + JSON.stringify(r.corpo.cartoes));
if (r.corpo.cortado === true) ok('recuperação parcial: o painel sabe que o material foi cortado');
else falha('recuperação parcial não avisada: ' + JSON.stringify(r));

/* ── 6d. a área do material ──────────────────────────────────────────
   A IA classifica o documento numa das cinco grandes áreas e o app usa
   isso para jogar o baralho na pasta certa. Sigla inventada não pode
   passar: viraria uma pasta que o app não sabe desenhar. */
const respostaComArea = (area) => () => ({
  status: 200,
  corpo: {
    candidates: [{
      content: { parts: [{ text: JSON.stringify({ baralho: 'Asma', area, cartoes: [{ frente: 'a', verso: 'b' }] }) }] },
      finishReason: 'STOP',
    }],
  },
});

for (const area of ['CL', 'CI', 'GO', 'PE', 'PR']) {
  responder = respostaComArea(area);
  r = await pedir(await carregar(), PEDIDO);
  if (r.status === 200 && r.corpo.area === area) ok(`a área ${area} chega ao painel`);
  else falha(`a área ${area} não voltou: ` + JSON.stringify(r.corpo));
}

responder = respostaComArea('cl');
r = await pedir(await carregar(), PEDIDO);
if (r.corpo.area === 'CL') ok('sigla em caixa baixa é aceita, em maiúsculas');
else falha('sigla em caixa baixa: ' + JSON.stringify(r.corpo));

for (const ruim of ['', 'XX', 'CLINICA', 'clinica médica', 42, null]) {
  responder = respostaComArea(ruim);
  r = await pedir(await carregar(), PEDIDO);
  if (r.corpo.area === '') ok(`área inválida (${JSON.stringify(ruim)}) volta vazia, sem inventar pasta`);
  else falha(`área inválida (${JSON.stringify(ruim)}) passou como "${r.corpo.area}"`);
}

/* a área é pedida antes dos cartões justamente para sobreviver ao corte */
const cortadoComArea = '{"baralho":"Cardio","area":"CL","cartoes":[{"frente":"P1","verso":"R1"},{"frente":"P2 incomple';
responder = () => ({
  status: 200,
  corpo: { candidates: [{ content: { parts: [{ text: cortadoComArea }] }, finishReason: 'MAX_TOKENS' }] },
});
r = await pedir(await carregar(), { ...PEDIDO, cobrirTudo: true });
if (r.corpo.cartoes.length === 1 && r.corpo.area === 'CL') {
  ok('resposta cortada: a área é resgatada junto com os cartões inteiros');
} else falha('área na recuperação parcial: ' + JSON.stringify(r.corpo));

/* e a instrução tem de explicar as cinco siglas, senão a IA chuta */
responder = respostaComArea('CL');
r = await pedir(await carregar(), PEDIDO);
const instrucao = ultimoPedido.corpo.system_instruction.parts[0].text;
if (['CL', 'CI', 'GO', 'PE', 'PR'].every((s) => instrucao.includes(s)) && /"area"/.test(instrucao)) {
  ok('a instrução ensina as cinco siglas e pede o campo "area"');
} else falha('a instrução não explica a área: ' + instrucao.slice(0, 300));

/* ── 7. quem pode usar: mesma regra do assistente ────────────────────── */
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
  corpo: { candidates: [{ content: { parts: [{ text: JSON.stringify({ baralho: 'X', cartoes: [{ frente: 'a', verso: 'b' }] }) }] }, finishReason: 'STOP' }] },
});
r = await pedir(await carregar(), PEDIDO);
if (r.status === 200) ok('quem assina consegue montar flashcards');
else falha('assinante: ' + JSON.stringify(r));

QUEM = { email: 'joseeduardo1616@gmail.com', localId: 'uid-dono' };

/* ── 8. sem chave nenhuma de IA ───────────────────────────────────────── */
delete env.GEMINI_API_KEY;
delete env.ANTHROPIC_API_KEY;
r = await pedir(await carregar(), PEDIDO);
if (r.status === 500 && /GEMINI_API_KEY/.test(r.corpo.erro)) ok('sem chave: explica o que cadastrar');
else falha('sem chave: ' + JSON.stringify(r));

servidor.close();
console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
