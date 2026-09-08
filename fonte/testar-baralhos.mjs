/* Testa os baralhos publicados sem tocar no Firebase.
 *
 * Roda contra o arquivo que vai para o ar (worker/api/baralhos.js). O que
 * mais importa aqui é quem pode o quê: publicar é só do dono, e o conteúdo
 * é do plano, então quem não assina não pode nem listar nem baixar.
 *
 *   node testar-baralhos.mjs
 */
const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

const { generateKeyPairSync } = await import('node:crypto');
const CONTA = {
  client_email: 'teste@exemplo.iam.gserviceaccount.com',
  private_key: generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ type: 'pkcs8', format: 'pem' }),
};

let QUEM = { email: 'joseeduardo1616@gmail.com', localId: 'uid-dono' };
let PLANO_ATE = 0;
let PUBLICOS = {};        // slug -> { fields }
let APAGADO = null;

const json = (corpo, status = 200) => new Response(JSON.stringify(corpo),
  { status, headers: { 'Content-Type': 'application/json' } });

globalThis.fetch = async (url, opcoes = {}) => {
  /* O fetch de verdade normaliza o ".." do endereço antes de sair. Sem
     fazer o mesmo aqui, o teste de fuga passaria mesmo com a trava
     removida: o banco de mentira leria "publicos/x" e nunca veria o
     "usuarios/alguem" que a chamada realmente atingiria. */
  const u = new URL(String(url)).href;
  if (u.includes('identitytoolkit.googleapis.com')) {
    return QUEM ? json({ users: [QUEM] }) : json({ error: {} }, 400);
  }
  if (u.includes('oauth2.googleapis.com/token')) return json({ access_token: 'token-falso' });
  if (u.includes('/documents/assinaturas/')) {
    return PLANO_ATE
      ? json({ fields: { validoAte: { doubleValue: PLANO_ATE } } })
      : json({}, 404);
  }
  const um = /\/documents\/publicos\/([^/?]+)/.exec(u);
  if (um) {
    const slug = um[1];
    const metodo = opcoes.method || 'GET';
    if (metodo === 'GET') return PUBLICOS[slug] ? json(PUBLICOS[slug]) : json({}, 404);
    if (metodo === 'DELETE') {
      if (!PUBLICOS[slug]) return json({}, 404);
      APAGADO = slug; delete PUBLICOS[slug]; return json({});
    }
    PUBLICOS[slug] = JSON.parse(opcoes.body);
    return json({ name: slug });
  }
  if (u.includes('/documents/publicos')) {
    return json({
      documents: Object.entries(PUBLICOS).map(([slug, doc]) => ({
        name: 'p/documents/publicos/' + slug, fields: doc.fields,
      })),
    });
  }
  throw new Error('chamada inesperada: ' + u);
};

const env = { FIREBASE_API_KEY: 'chave', FIREBASE_SERVICE_ACCOUNT: JSON.stringify(CONTA) };
const mod = await import('../worker/api/baralhos.js');

const pedir = async (corpo, metodo = 'POST') => {
  APAGADO = null;
  const res = await mod.onRequest({
    request: new Request('http://local/api/baralhos', {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      ...(metodo === 'POST' ? { body: JSON.stringify(corpo) } : {}),
    }),
    env,
  });
  return { status: res.status, corpo: await res.json() };
};

const como = (email, uid) => { QUEM = { email, localId: uid }; };
const CARTOES = [
  { frente: 'Tríade da síndrome nefrítica', verso: 'Hematúria, hipertensão e edema', subjectId: 'nefro-1' },
  { frente: 'Valva mais acometida na cardite reumática', verso: 'Mitral' },
];

/* ── o que sobrevive à publicação ────────────────────────────────────── */
const limpos = mod.limparParaPublicar([
  ...CARTOES,
  { frente: 'só frente', verso: '' },
  { frente: 'com imagem [[img:foto.png]]', verso: 'resposta [[img:outra.png]]' },
  null,
]);
if (limpos.length === 3) ok('cartão sem verso fica de fora da publicação');
else falha('limpeza: ' + JSON.stringify(limpos));
if (!JSON.stringify(limpos).includes('[[img:')) ok('as imagens não viajam: elas moram no aparelho de quem criou');
else falha('a referência de imagem foi junto');
if (!JSON.stringify(limpos).includes('facilidade') && !JSON.stringify(limpos).includes('prox')) {
  ok('o agendamento de quem publicou não vai junto');
} else falha('vazou o agendamento do dono');

/* ── publicar ────────────────────────────────────────────────────────── */
let r = await pedir({ token: 't', acao: 'publicar', pasta: 'Nefrologia', baralho: 'Glomerulopatias', cartoes: CARTOES });
if (r.status === 200 && r.corpo.ok) ok('o dono publica um baralho');
else falha('publicar: ' + JSON.stringify(r));
const slug = r.corpo.slug;
if (slug === 'nefrologia--glomerulopatias') ok('o apelido junta pasta e baralho, sem acento');
else falha('apelido: ' + slug);
if (PUBLICOS[slug].fields.total.doubleValue === 2) ok('o total publicado é contado');
else falha('total: ' + JSON.stringify(PUBLICOS[slug].fields.total));

r = await pedir({ token: 't', acao: 'publicar', pasta: 'X', baralho: 'Vazio', cartoes: [{ frente: 'a', verso: '' }] });
if (r.status === 400) ok('baralho sem cartão válido não é publicado');
else falha('baralho vazio: ' + JSON.stringify(r));

/* ── quem não é dono não publica nem tira do ar ──────────────────────── */
como('aluna@email.com', 'uid-aluna');
PLANO_ATE = Date.now() + 30 * 86400000;
r = await pedir({ token: 't', acao: 'publicar', pasta: 'P', baralho: 'B', cartoes: CARTOES });
if (r.status === 403 && /dono/.test(r.corpo.erro)) ok('assinante não consegue publicar');
else falha('assinante publicando: ' + JSON.stringify(r));

r = await pedir({ token: 't', acao: 'despublicar', slug });
if (r.status === 403 && PUBLICOS[slug]) ok('assinante não consegue tirar do ar');
else falha('assinante despublicando: ' + JSON.stringify(r));

/* ── assinante lista e baixa ─────────────────────────────────────────── */
r = await pedir({ token: 't', acao: 'listar' });
if ((r.corpo.baralhos || []).length === 1 && r.corpo.baralhos[0].nome === 'Glomerulopatias') ok('assinante vê a lista do que está publicado');
else falha('listar: ' + JSON.stringify(r.corpo));

r = await pedir({ token: 't', acao: 'baixar', slug });
if (r.corpo.ok && (r.corpo.cartoes || []).length === 2) ok('assinante baixa os cartões');
else falha('baixar: ' + JSON.stringify(r.corpo));
if (r.corpo.pasta === 'Nefrologia' && r.corpo.nome === 'Glomerulopatias') ok('a pasta e o nome do baralho vêm junto');
else falha('nome/pasta: ' + JSON.stringify(r.corpo));

/* ── quem não assina não vê nem baixa ────────────────────────────────── */
PLANO_ATE = 0;
r = await pedir({ token: 't', acao: 'listar' });
if ((r.corpo.baralhos || []).length === 0 && r.corpo.precisaPlano) ok('quem não assina recebe lista vazia, com o motivo');
else falha('listar sem plano: ' + JSON.stringify(r.corpo));

r = await pedir({ token: 't', acao: 'baixar', slug });
if (r.status === 403 && !r.corpo.cartoes) ok('quem não assina não baixa o conteúdo');
else falha('baixar sem plano: ' + JSON.stringify(r));

/* assinatura vencida não vale */
PLANO_ATE = Date.now() - 86400000;
r = await pedir({ token: 't', acao: 'baixar', slug });
if (r.status === 403) ok('assinatura vencida perde os baralhos prontos');
else falha('assinatura vencida: ' + JSON.stringify(r));
PLANO_ATE = 0;

/* ── o dono não precisa assinar para ver o próprio conteúdo ──────────── */
como('joseeduardo1616@gmail.com', 'uid-dono');
r = await pedir({ token: 't', acao: 'listar' });
if ((r.corpo.baralhos || []).length === 1) ok('o dono vê a lista sem assinar nada');
else falha('dono listando: ' + JSON.stringify(r.corpo));

/* ── despublicar ─────────────────────────────────────────────────────── */
r = await pedir({ token: 't', acao: 'despublicar', slug });
if (r.corpo.ok && APAGADO === slug && !PUBLICOS[slug]) ok('o dono tira o baralho do ar');
else falha('despublicar: ' + JSON.stringify(r));

r = await pedir({ token: 't', acao: 'baixar', slug });
if (r.status === 404) ok('baralho tirado do ar não é mais baixado');
else falha('baixar depois de tirar: ' + JSON.stringify(r));

/* ── o apelido não pode escapar da coleção ───────────────────────────
   O apelido entra no endereço do Firestore, e endereço com ".." é
   normalizado antes de sair: "publicos/x/../../usuarios/alguem" vira
   "usuarios/alguem". Como baixar é aberto a qualquer assinante, sem esta
   conferência bastaria saber o uid de alguém para ler os dados de estudo
   dessa pessoa. O banco de mentira estoura se receber um endereço fora de
   publicos/, então o teste falha alto se a trava sair. */
como('aluna@email.com', 'uid-aluna');
PLANO_ATE = Date.now() + 30 * 86400000;
for (const veneno of [
  'x/../../usuarios/uid-da-vitima',
  '../assinaturas/uid-da-vitima',
  'x/../../../databases',
  'MAIÚSCULA',
  'com espaço',
]) {
  r = await pedir({ token: 't', acao: 'baixar', slug: veneno });
  if (r.status === 400 && !r.corpo.cartoes) ok(`baixar recusa apelido fora do formato: ${veneno.slice(0, 24)}`);
  else falha(`baixar aceitou "${veneno}": ` + JSON.stringify(r));
}
PLANO_ATE = 0;

como('joseeduardo1616@gmail.com', 'uid-dono');
r = await pedir({ token: 't', acao: 'despublicar', slug: 'x/../../usuarios/uid-da-vitima' });
if (r.status === 400) ok('despublicar recusa apelido fora do formato');
else falha('despublicar aceitou apelido com "..": ' + JSON.stringify(r));

/* o apelido que o próprio código gera continua passando */
if (mod.apelidoValido(mod.apelidoBaralho('Nefrologia', 'Glomerulopatias'))) ok('o apelido gerado pelo código passa na conferência');
else falha('a conferência recusa o apelido que o código gera');

/* ── recusas gerais ──────────────────────────────────────────────────── */
QUEM = null;
r = await pedir({ token: 't', acao: 'listar' });
if (r.status === 401) ok('sem sessão válida, a rota não responde');
else falha('sessão inválida: ' + JSON.stringify(r));
como('joseeduardo1616@gmail.com', 'uid-dono');

r = await pedir({}, 'GET');
if (r.status === 405) ok('só aceita POST');
else falha('método: ' + JSON.stringify(r));

delete env.FIREBASE_SERVICE_ACCOUNT;
r = await pedir({ token: 't', acao: 'listar' });
if (r.status === 500 && /FIREBASE_SERVICE_ACCOUNT/.test(r.corpo.erro)) ok('sem conta de serviço, explica o que falta');
else falha('sem conta de serviço: ' + JSON.stringify(r));
env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify(CONTA);

console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
