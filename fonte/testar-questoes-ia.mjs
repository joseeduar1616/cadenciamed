/* Testa a rota que escreve as questões do duelo, sem gastar cota.
 *
 * Roda contra o arquivo que vai para o ar (worker/api/questoes-ia.js), com
 * a mesma técnica de servidor falso do testar-cronograma-ia.mjs.
 *
 * O que mais importa aqui não é o caminho feliz: é o que a rota faz com
 * resposta ruim da IA. Descanso de dez minutos, vinte séries num
 * exercício e grupo muscular inventado chegariam na tela como se fossem
 * prescrição, e o cronômetro contaria os dez minutos sem reclamar.
 *
 *   node testar-questoes-ia.mjs
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
  const req = new Request('http://local/api/questoes-ia', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const res = await fn({ request: req, env });
  return { status: res.status, corpo: await res.json() };
};

const PEDIDO = {
  token: 'token-de-teste',
  quantas: 3,
  texto: 'A síndrome nefrítica tem hematúria, hipertensão e edema. '.repeat(4),
};

const env = {};
const carregar = async () => (await import('../worker/api/questoes-ia.js?v=' + Math.random())).onRequest;

env.FIREBASE_API_KEY = 'chave-firebase';
env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify(CONTA);
env.GEMINI_API_KEY = 'chave-de-teste';
PLANO_ATE = Date.now() + 30 * 86400000;


/* Resposta da IA embrulhada como o Gemini embrulha. */

const TREINO_BOM = {
  nome: 'Puxar, empurrar, pernas',
  aviso: '',
  dias: [
    {
      nome: 'Costas e bíceps',
      exercicios: [
        { nome: 'Barra fixa', grupo: 'Costas', series: 4, reps: '6-10', descanso: 120, observacao: 'Escápula primeiro' },
        { nome: 'Rosca direta', grupo: 'Bíceps', series: 3, reps: '10-12', descanso: 60, observacao: '' },
      ],
    },
  ],
};


const respostaIA = (obj) => ({
  status: 200,
  corpo: {
    candidates: [{
      content: { parts: [{ text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] },
      finishReason: 'STOP',
    }],
  },
});

const BOAS = {
  tema: 'Nefrologia',
  questoes: [
    { enunciado: 'Qual a tríade?', alternativas: ['a', 'b', 'c', 'd'], certa: 1, porque: 'porque sim' },
    { enunciado: 'E o tratamento?', alternativas: ['x', 'y', 'z', 'w'], certa: 3, porque: 'porque não' },
  ],
};

/* ── 1. material curto demais nem chega na IA ─────────────────────────── */
let chamouIA = false;
responder = () => { chamouIA = true; return respostaIA(BOAS); };
let r = await pedir(await carregar(), { ...PEDIDO, texto: 'oi' });
if (r.status === 400 && !chamouIA) ok('material curto demais: recusado antes de gastar a IA');
else falha('material curto: ' + JSON.stringify(r));

/* ── 2. caminho feliz ─────────────────────────────────────────────────── */
r = await pedir(await carregar(), PEDIDO);
if (r.status === 200 && r.corpo.questoes.length === 2) ok('as questões voltam prontas');
else falha('caminho feliz: ' + JSON.stringify(r));
if (r.corpo.tema === 'Nefrologia') ok('o tema vem junto, para dar nome ao duelo');
else falha('tema: ' + r.corpo.tema);

/* O material é texto que veio de fora, e vai delimitado com o aviso de que
   não são ordens. */
const mandado = String(ultimoPedido.corpo.contents?.[0]?.parts?.[0]?.text || '');
if (/"""/.test(mandado)) ok('o material vai delimitado, como dado e não como instrução');
else falha('o material foi enviado solto');

/* ── 3. questão que não dá para disputar é descartada ─────────────────── */
responder = () => respostaIA({
  tema: 'Ruim',
  questoes: [
    { enunciado: 'Só uma opção', alternativas: ['a'], certa: 0 },
    { enunciado: 'Gabarito fora', alternativas: ['a', 'b'], certa: 7 },
    { enunciado: 'Repetida', alternativas: ['igual', 'igual', 'b'], certa: 0 },
    { enunciado: 'Sem enunciado?', alternativas: ['a', 'b'], certa: 1 },
  ],
});
r = await pedir(await carregar(), PEDIDO);
const boas = r.corpo.questoes || [];
if (boas.length === 1 && boas[0].enunciado === 'Sem enunciado?') {
  ok('questão sem opção, com gabarito fora da lista ou com alternativa repetida é descartada');
} else falha('a limpeza deixou passar: ' + JSON.stringify(boas.map((q) => q.enunciado)));

/* ── 4. nenhuma aproveitável vira recado, não lista vazia ─────────────── */
responder = () => respostaIA({ tema: '', questoes: [{ enunciado: 'x', alternativas: ['a'], certa: 0 }] });
r = await pedir(await carregar(), PEDIDO);
if (/Não consegui tirar questões/.test(r.corpo.erro || '')) ok('material que não rende questão vira recado explicado');
else falha('sem questões: ' + JSON.stringify(r.corpo));

/* ── 5. resposta ilegível ─────────────────────────────────────────────── */
responder = () => respostaIA('desculpa, não consigo');
r = await pedir(await carregar(), PEDIDO);
if (r.status === 502 && /formato/.test(r.corpo.erro || '')) ok('resposta ilegível vira erro explicado');
else falha('ilegível: ' + JSON.stringify(r));

/* ── 6. teto de questões ──────────────────────────────────────────────── */
responder = () => respostaIA({
  tema: 'Muitas',
  questoes: Array.from({ length: 80 }, (_, i) => ({
    enunciado: 'Q' + i, alternativas: ['a', 'b', 'c', 'd'], certa: 0,
  })),
});
r = await pedir(await carregar(), { ...PEDIDO, quantas: 999 });
if ((r.corpo.questoes || []).length <= 30) ok('oitenta questões viram no máximo trinta');
else falha('passou ' + r.corpo.questoes.length + ' questões');

/* ── 7. sem conta, sem questões ───────────────────────────────────────── */
responder = () => respostaIA(BOAS);
r = await pedir(await carregar(), { ...PEDIDO, token: '' });
if (r.status === 403) ok('sem entrar na conta, a rota recusa');
else falha('sem token: ' + JSON.stringify(r));

servidor.close();
console.log(passos.join('\n'));
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
