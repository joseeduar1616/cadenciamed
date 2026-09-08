/* Testa a rota do Notion sem tocar no Notion nem no Firebase de verdade.
 *
 * Roda contra o arquivo que vai para o ar (worker/api/notion.js). A
 * identidade, o Firestore e a API do Notion são respondidos aqui mesmo,
 * então dá para exercitar a troca do código pelo token, a leitura do
 * MEDPlanner e — o que mais importa — que o token do Notion de alguém
 * nunca sai numa resposta.
 *
 *   node testar-notion.mjs
 */
const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

const { generateKeyPairSync } = await import('node:crypto');
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const CONTA = {
  client_email: 'teste@exemplo.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
};

/* ── mundo de mentira ────────────────────────────────────────────────── */
let CONEXOES = {};                    // uid -> { fields }
let QUEM = { email: 'ana@email.com', localId: 'uid-ana' };
let CHAMADAS = [];                    // o que foi pedido ao Notion
let PAGINAS = [];                     // o que o banco do Notion devolve
let BANCOS = [];                      // o que a busca devolve
let TOKEN_OAUTH = { access_token: 'secret_notion_da_ana', workspace_name: 'Ana' };
let ERRO_NOTION = null;               // { status, body } para forçar falha

const json = (corpo, status = 200) => new Response(JSON.stringify(corpo),
  { status, headers: { 'Content-Type': 'application/json' } });

globalThis.fetch = async (url, opcoes = {}) => {
  const u = String(url);
  if (u.includes('identitytoolkit.googleapis.com')) {
    return QUEM ? json({ users: [QUEM] }) : json({ error: {} }, 400);
  }
  if (u.includes('oauth2.googleapis.com/token')) return json({ access_token: 'token-falso' });

  const m = /\/documents\/notion\/([^/?]+)/.exec(u);
  if (m) {
    const uid = m[1];
    const metodo = opcoes.method || 'GET';
    if (metodo === 'GET') return CONEXOES[uid] ? json(CONEXOES[uid]) : json({ error: {} }, 404);
    if (metodo === 'DELETE') { delete CONEXOES[uid]; return json({}); }
    CONEXOES[uid] = JSON.parse(opcoes.body);
    return json({ name: uid });
  }

  if (u.startsWith('https://api.notion.com/')) {
    CHAMADAS.push({ url: u, opcoes });
    if (ERRO_NOTION) return json(ERRO_NOTION.body || {}, ERRO_NOTION.status);
    if (u.endsWith('/oauth/token')) return json(TOKEN_OAUTH);
    if (u.endsWith('/search')) return json({ results: BANCOS });
    if (/\/databases\/[^/]+\/query$/.test(u)) return json({ results: PAGINAS, has_more: false });
    return json({ object: 'error', message: 'rota não prevista no teste' }, 400);
  }
  throw new Error('chamada inesperada: ' + u);
};

const env = {
  FIREBASE_API_KEY: 'chave',
  FIREBASE_SERVICE_ACCOUNT: JSON.stringify(CONTA),
  NOTION_CLIENT_ID: 'id-publico',
  NOTION_CLIENT_SECRET: 'segredo-da-integracao',
  NOTION_REDIRECT: 'https://cadenciamed.com.br/notion',
};
const mod = await import('../worker/api/notion.js');

const pedir = async (corpo, metodo = 'POST') => {
  const res = await mod.onRequest({
    request: new Request('http://local/api/notion', {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      ...(metodo === 'POST' ? { body: JSON.stringify(corpo) } : {}),
    }),
    env,
  });
  const bruto = await res.text();
  return { status: res.status, bruto, corpo: JSON.parse(bruto) };
};

/* Uma linha do MEDPlanner, no formato que o Notion devolve. */
const linhaFalsa = (ajustes = {}) => ({
  id: ajustes.id || 'pagina-1',
  properties: {
    'SEMANA': { type: 'title', title: [{ plain_text: ajustes.semana || 'SEMANA 10' }] },
    'ÁREA': { type: 'multi_select', multi_select: [{ name: 'CLÍNICA' }] },
    'AULA PRINCIPAL': { type: 'rich_text', rich_text: [{ plain_text: ajustes.tema || 'Gota; Febre Reumática' }] },
    'AULAS BÔNUS': { type: 'rich_text', rich_text: [{ plain_text: 'Artrite Séptica' }] },
    'DATA': { type: 'date', date: ajustes.data === null ? null : { start: ajustes.data || '2026-03-30' } },
    'AULA': { type: 'checkbox', checkbox: ajustes.aula !== false },
    'APOSTILAS': { type: 'checkbox', checkbox: false },
    'QTS PRÉ': { type: 'checkbox', checkbox: true },
    'QTS PÓS': { type: 'checkbox', checkbox: true },
    'SMARTCARDS': { type: 'checkbox', checkbox: false },
    'TREINO AVANÇADO': { type: 'checkbox', checkbox: false },
    '1 SEMANA': { type: 'checkbox', checkbox: true },
    '1 MÊS': { type: 'checkbox', checkbox: ajustes.mes === true },
    '2 MESES': { type: 'checkbox', checkbox: false },
    '4 MESES': { type: 'checkbox', checkbox: false },
    '6 MESES': { type: 'checkbox', checkbox: false },
    'DESEMPENHO': { type: 'status', status: { name: ajustes.perf || '≥ 80%' } },
    'PRÓXIMA TAREFA': { type: 'status', status: { name: 'Revisão 1 semana' } },
    'Número': { type: 'number', number: 10 },
  },
});

/* ── leitura de uma linha ────────────────────────────────────────────── */
let l = mod.lerLinha(linhaFalsa());
if (l.semana === 'SEMANA 10' && l.tema === 'Gota; Febre Reumática') ok('a semana e o tema saem da linha do planner');
else falha('linha: ' + JSON.stringify(l));
if (l.data === '2026-03-30' && l.aula && l.qtsPos && !l.cards) ok('a data e as caixas viram os campos do app');
else falha('caixas: ' + JSON.stringify(l));
if (l.perf === 1) ok('o desempenho vira o mesmo número que o app já usa');
else falha('desempenho: ' + l.perf);
if (JSON.stringify(l.revisoes) === '[7]') ok('a revisão marcada vira o degrau em dias da escada');
else falha('revisões: ' + JSON.stringify(l.revisoes));
if (JSON.stringify(l.areas) === '["CLÍNICA"]') ok('a área vem junto, para conferir o encaixe da aula');
else falha('áreas: ' + JSON.stringify(l.areas));

l = mod.lerLinha(linhaFalsa({ mes: true, perf: '≤ 60%' }));
if (JSON.stringify(l.revisoes) === '[7,30]') ok('duas revisões marcadas viram dois degraus, em ordem');
else falha('duas revisões: ' + JSON.stringify(l.revisoes));
if (l.perf === 3) ok('o desempenho baixo também é reconhecido');
else falha('desempenho baixo: ' + l.perf);

/* Cada cópia do planner é editada à mão, e a coluna acaba sem acento. */
const semAcento = linhaFalsa();
semAcento.properties['1 mes'] = semAcento.properties['1 MÊS'];
semAcento.properties['1 mes'].checkbox = true;
delete semAcento.properties['1 MÊS'];
if (JSON.stringify(mod.lerLinha(semAcento).revisoes) === '[7,30]') ok('coluna sem acento e em minúscula é reconhecida do mesmo jeito');
else falha('coluna sem acento não foi reconhecida');

/* Coluna que o planner de alguém tem a mais não pode virar lixo no meio. */
const comExtra = linhaFalsa();
comExtra.properties['MINHA COLUNA'] = { type: 'people', people: [{ name: 'Ana' }] };
const lida = mod.lerLinha(comExtra);
if (!JSON.stringify(lida).includes('object Object') && !JSON.stringify(lida).includes('Ana')) ok('coluna desconhecida é ignorada em vez de virar lixo na linha');
else falha('coluna extra vazou: ' + JSON.stringify(lida));

/* ── estado ──────────────────────────────────────────────────────────── */
let r = await pedir({ token: 't', acao: 'estado' });
if (r.corpo.configurado && !r.corpo.ligado) ok('com as variáveis cadastradas, diz que o site está pronto e a conta ainda não');
else falha('estado: ' + JSON.stringify(r.corpo));

/* ── início ──────────────────────────────────────────────────────────── */
r = await pedir({ token: 't', acao: 'inicio' });
if (/api\.notion\.com\/v1\/oauth\/authorize/.test(r.corpo.endereco)
  && r.corpo.endereco.includes('client_id=id-publico')) ok('o endereço de autorização é montado no servidor');
else falha('início: ' + JSON.stringify(r.corpo));
if (!r.bruto.includes('segredo-da-integracao')) ok('o segredo da integração não sai na resposta');
else falha('o segredo da integração vazou para a página');

/* O endereço de volta é escolhido pelo servidor: aceitar o que a página
   mandasse deixaria alguém receber o código de autorização em outro site. */
r = await pedir({ token: 't', acao: 'inicio', redirect: 'https://site-do-golpe/pegar' });
if (!r.corpo.endereco.includes('site-do-golpe')) ok('não dá para escolher pela página para onde o Notion devolve o código');
else falha('endereço de volta veio do pedido: ' + r.corpo.endereco);

/* ── conectar ────────────────────────────────────────────────────────── */
CHAMADAS = [];
r = await pedir({ token: 't', acao: 'conectar', codigo: 'cod-123' });
if (r.corpo.ok && r.corpo.oficina === 'Ana') ok('o código vira conexão, com o nome do espaço do Notion');
else falha('conectar: ' + JSON.stringify(r.corpo));
if (!r.bruto.includes('secret_notion_da_ana')) ok('o token do Notion não volta para a página');
else falha('O TOKEN DO NOTION VAZOU NA RESPOSTA');
if (CONEXOES['uid-ana'].fields.acesso.stringValue === 'secret_notion_da_ana') ok('o token fica guardado do lado do servidor');
else falha('o token não foi guardado');
const troca = CHAMADAS.find((c) => c.url.endsWith('/oauth/token'));
if (troca && /^Basic /.test(troca.opcoes.headers.Authorization)) ok('a troca vai assinada com o segredo, como o Notion exige');
else falha('a troca do código foi sem a assinatura');

r = await pedir({ token: 't', acao: 'conectar', codigo: '' });
if (r.status === 400) ok('conectar sem código é recusado');
else falha('código vazio: ' + JSON.stringify(r));

r = await pedir({ token: 't', acao: 'estado' });
if (r.corpo.ligado && r.corpo.oficina === 'Ana') ok('depois de conectar, o estado mostra a conta ligada');
else falha('estado depois de conectar: ' + JSON.stringify(r.corpo));
if (!r.bruto.includes('secret_notion_da_ana')) ok('nem o estado devolve o token');
else falha('O TOKEN DO NOTION VAZOU NO ESTADO');

/* ── bancos ──────────────────────────────────────────────────────────── */
BANCOS = [{ id: 'banco-1', title: [{ plain_text: 'MEDCURSO' }] }];
r = await pedir({ token: 't', acao: 'bancos' });
if (r.corpo.bancos.length === 1 && r.corpo.bancos[0].nome === 'MEDCURSO') ok('lista os cronogramas compartilhados com o site');
else falha('bancos: ' + JSON.stringify(r.corpo));

/* ── cronograma ──────────────────────────────────────────────────────── */
PAGINAS = [linhaFalsa({ id: 'p1' }), linhaFalsa({ id: 'p2', semana: 'SEMANA 11', tema: 'Tireoide' })];
r = await pedir({ token: 't', acao: 'cronograma', banco: 'banco-1' });
if (r.corpo.linhas.length === 2 && r.corpo.linhas[1].tema === 'Tireoide') ok('o cronograma volta linha por linha, já traduzido');
else falha('cronograma: ' + JSON.stringify(r.corpo).slice(0, 300));
if (CONEXOES['uid-ana'].fields.banco.stringValue === 'banco-1') ok('a escolha do cronograma fica guardada para a próxima vez');
else falha('a escolha não foi guardada');

r = await pedir({ token: 't', acao: 'cronograma' });
if (r.corpo.ok && r.corpo.linhas.length === 2) ok('a importação seguinte não precisa escolher o cronograma de novo');
else falha('cronograma sem banco: ' + JSON.stringify(r.corpo).slice(0, 200));

/* Quem lê o Notion é sempre o token de quem pediu, e não o de outra pessoa. */
CONEXOES['uid-bia'] = {
  fields: {
    acesso: { stringValue: 'secret_notion_da_bia' },
    oficina: { stringValue: 'Bia' }, banco: { stringValue: 'banco-da-bia' },
  },
};
CHAMADAS = [];
r = await pedir({ token: 't', acao: 'cronograma' });
const usados = CHAMADAS.map((c) => c.opcoes.headers.Authorization).join(' ');
if (usados.includes('secret_notion_da_ana') && !usados.includes('secret_notion_da_bia')) ok('cada pessoa lê o Notion com o próprio token');
else falha('token trocado entre contas: ' + usados);

/* ── o Notion reclamando ─────────────────────────────────────────────── */
ERRO_NOTION = { status: 404, body: { object: 'error', message: 'Could not find database' } };
r = await pedir({ token: 't', acao: 'cronograma' });
if (r.status === 502 && /compartilhado/.test(r.corpo.erro)) ok('cronograma não compartilhado vira instrução, não erro cru');
else falha('404 do Notion: ' + JSON.stringify(r));

ERRO_NOTION = { status: 401, body: {} };
r = await pedir({ token: 't', acao: 'cronograma' });
if (/Conecte de novo/.test(r.corpo.erro)) ok('token vencido pede para conectar de novo');
else falha('401 do Notion: ' + JSON.stringify(r.corpo));
ERRO_NOTION = null;

/* ── desligar ────────────────────────────────────────────────────────── */
r = await pedir({ token: 't', acao: 'desligar' });
if (r.corpo.ok && !CONEXOES['uid-ana']) ok('desligar apaga o token guardado');
else falha('desligar: ' + JSON.stringify(r.corpo));

r = await pedir({ token: 't', acao: 'cronograma' });
if (r.status === 400 && /Ligue sua conta/.test(r.corpo.erro)) ok('sem conexão, pede para ligar antes de importar');
else falha('cronograma sem conexão: ' + JSON.stringify(r));

/* ── recusas gerais ──────────────────────────────────────────────────── */
QUEM = null;
r = await pedir({ token: 't', acao: 'estado' });
if (r.status === 401) ok('sem sessão válida, a rota não responde');
else falha('sessão inválida: ' + JSON.stringify(r));
QUEM = { email: 'ana@email.com', localId: 'uid-ana' };

r = await pedir({}, 'GET');
if (r.status === 405) ok('só aceita POST');
else falha('método: ' + JSON.stringify(r));

/* Enquanto o dono não cadastrar a integração, a tela precisa saber disso
   em vez de mandar a pessoa para uma página de erro do Notion. */
delete env.NOTION_CLIENT_ID;
r = await pedir({ token: 't', acao: 'estado' });
if (!r.corpo.configurado) ok('sem a integração cadastrada, o estado avisa que o site ainda não está pronto');
else falha('estado sem integração: ' + JSON.stringify(r.corpo));
r = await pedir({ token: 't', acao: 'inicio' });
if (r.status === 503 && /NOTION_CLIENT_ID/.test(r.corpo.erro)) ok('e diz exatamente qual variável falta');
else falha('início sem integração: ' + JSON.stringify(r));
env.NOTION_CLIENT_ID = 'id-publico';

console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
