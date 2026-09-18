/* Testa a rota que monta o plano de treino, sem gastar cota de verdade.
 *
 * Roda contra o arquivo que vai para o ar (worker/api/treino-ia.js), com
 * a mesma técnica de servidor falso do testar-cronograma-ia.mjs.
 *
 * O que mais importa aqui não é o caminho feliz: é o que a rota faz com
 * resposta ruim da IA. Descanso de dez minutos, vinte séries num
 * exercício e grupo muscular inventado chegariam na tela como se fossem
 * prescrição, e o cronômetro contaria os dez minutos sem reclamar.
 *
 *   node testar-treino-ia.mjs
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
  const req = new Request('http://local/api/treino-ia', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  const res = await fn({ request: req, env });
  return { status: res.status, corpo: await res.json() };
};

const PEDIDO = {
  token: 'token-de-teste',
  perfil: {
    objetivo: 'ganhar massa nas costas',
    dias: 3,
    nivel: 'iniciante',
    minutos: '60',
    equipamento: 'academia completa',
    limitacoes: '',
  },
};

const env = {};
const carregar = async () => (await import('../worker/api/treino-ia.js?v=' + Math.random())).onRequest;

env.FIREBASE_API_KEY = 'chave-firebase';
env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify(CONTA);
env.GEMINI_API_KEY = 'chave-de-teste';
PLANO_ATE = Date.now() + 30 * 86400000;


/* Resposta da IA embrulhada como o Gemini embrulha. */
const respostaIA = (obj) => ({
  status: 200,
  corpo: {
    candidates: [{
      content: { parts: [{ text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] },
      finishReason: 'STOP',
    }],
  },
});

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

/* ── 1. sem objetivo, ou sem dias, nem chega na IA ────────────────────── */
let chamouIA = false;
responder = () => { chamouIA = true; return respostaIA(TREINO_BOM); };

let r = await pedir(await carregar(), { ...PEDIDO, perfil: { ...PEDIDO.perfil, objetivo: '' } });
if (r.status === 400 && !chamouIA) ok('sem objetivo: recusado antes de gastar a IA');
else falha('sem objetivo: ' + JSON.stringify(r));

chamouIA = false;
r = await pedir(await carregar(), { ...PEDIDO, perfil: { ...PEDIDO.perfil, dias: 0 } });
if (r.status === 400 && !chamouIA) ok('sem dias de treino: recusado antes de gastar a IA');
else falha('sem dias: ' + JSON.stringify(r));

/* ── 2. caminho feliz ─────────────────────────────────────────────────── */
r = await pedir(await carregar(), PEDIDO);
if (r.status === 200 && r.corpo.dias && r.corpo.dias.length === 1) ok('o treino volta com os dias montados');
else falha('caminho feliz: ' + JSON.stringify(r));
if (r.corpo.dias[0].exercicios[0].nome === 'Barra fixa') ok('o exercício chega com nome, série e descanso');
else falha('o exercício voltou errado: ' + JSON.stringify(r.corpo.dias[0]));

/* O formulário é texto que a pessoa escreveu, e vai dentro de aspas
   triplas com o aviso de que não são ordens. */
if (/"""/.test(String(ultimoPedido.corpo.contents?.[0]?.parts?.[0]?.text || ''))) {
  ok('o que a pessoa escreveu vai delimitado, como dado e não como instrução');
} else falha('o formulário foi enviado solto: ' + JSON.stringify(ultimoPedido.corpo).slice(0, 300));

/* ── 3. número absurdo da IA não chega na tela ────────────────────────── */
responder = () => respostaIA({
  nome: 'Treino',
  dias: [{
    nome: 'A',
    exercicios: [
      { nome: 'Supino', grupo: 'Peito', series: 40, reps: '8', descanso: 3600, observacao: '' },
      { nome: 'Remada', grupo: 'Peito e um pouco de costas', series: 3, reps: '10', descanso: 60 },
    ],
  }],
});
r = await pedir(await carregar(), PEDIDO);
const ex = r.corpo.dias[0].exercicios;
if (ex[0].series >= 1 && ex[0].series <= 10) ok('quarenta séries viram um número que existe');
else falha('passou ' + ex[0].series + ' séries adiante');
if (ex[0].descanso >= 15 && ex[0].descanso <= 600) ok('uma hora de descanso vira um descanso de verdade');
else falha('passou ' + ex[0].descanso + ' segundos de descanso adiante');
if (ex[1].grupo === '') ok('grupo muscular que não existe entra vazio, sem sujar a conta de volume');
else falha('aceitou o grupo inventado: ' + ex[1].grupo);

/* ── 4. respeita o teto de dias ───────────────────────────────────────── */
responder = () => respostaIA({
  nome: 'Demais',
  dias: Array.from({ length: 12 }, (_, i) => ({
    nome: 'Dia ' + i,
    exercicios: [{ nome: 'Agachamento', grupo: 'Perna', series: 3, reps: '10', descanso: 90 }],
  })),
});
r = await pedir(await carregar(), PEDIDO);
if (r.corpo.dias.length <= 7) ok('doze dias por semana viram no máximo sete');
else falha('deixou passar ' + r.corpo.dias.length + ' dias');

/* ── 5. dia sem exercício nenhum é descartado ─────────────────────────── */
responder = () => respostaIA({
  nome: 'Meio vazio',
  dias: [
    { nome: 'Vazio', exercicios: [] },
    { nome: 'Cheio', exercicios: [{ nome: 'Leg press', grupo: 'Perna', series: 3, reps: '12', descanso: 90 }] },
  ],
});
r = await pedir(await carregar(), PEDIDO);
if (r.corpo.dias.length === 1 && r.corpo.dias[0].nome === 'Cheio') ok('dia sem exercício não vira card vazio na tela');
else falha('o dia vazio passou: ' + JSON.stringify(r.corpo.dias));

/* ── 6. resposta ilegível vira erro explicado ─────────────────────────── */
responder = () => respostaIA('desculpa, não consigo montar isso');
r = await pedir(await carregar(), PEDIDO);
if (r.status === 502 && /formato/.test(r.corpo.erro || '')) ok('resposta ilegível da IA vira erro explicado');
else falha('resposta ilegível: ' + JSON.stringify(r));

/* ── 7. sem conta, sem treino ─────────────────────────────────────────── */
responder = () => respostaIA(TREINO_BOM);
r = await pedir(await carregar(), { ...PEDIDO, token: '' });
if (r.status === 403) ok('sem entrar na conta, a rota recusa');
else falha('sem token: ' + JSON.stringify(r));

QUEM = null;
r = await pedir(await carregar(), PEDIDO);
if (r.status === 403) ok('token que o Firebase não reconhece é recusado');
else falha('token inválido: ' + JSON.stringify(r));
QUEM = { email: 'joseeduardo1616@gmail.com', localId: 'uid-dono' };

/* Montar treino é só do dono. Nem quem paga o plano completo entra aqui:
   prescrever exercício para quem a gente não conhece é outro assunto, com
   outro risco. Quem garante isso é o servidor — esconder a aba na tela é
   conveniência, e o console do navegador passa por cima dela. */
QUEM = { email: 'assinante@email.com', localId: 'uid-assinante' };
r = await pedir(await carregar(), PEDIDO);
if (r.status === 403 && /administrador/.test(r.corpo.erro || '')) ok('nem quem assina monta treino: a rota é só do dono');
else falha('assinante montou treino: ' + JSON.stringify(r));
if (!r.corpo.dias) ok('e a recusa não vem com um treino junto');
else falha('a recusa veio com treino no corpo');
QUEM = { email: 'joseeduardo1616@gmail.com', localId: 'uid-dono' };

/* ── 8. sem chave de IA, o recado diz o que falta ─────────────────────── */
delete env.GEMINI_API_KEY;
r = await pedir(await carregar(), PEDIDO);
if (r.status === 500 && /GEMINI_API_KEY/.test(r.corpo.erro || '')) ok('sem chave de IA, o erro diz qual variável falta');
else falha('sem chave: ' + JSON.stringify(r));
env.GEMINI_API_KEY = 'chave-de-teste';

servidor.close();
console.log(passos.join('\n'));
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
