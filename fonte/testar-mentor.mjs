/* Testa a aba Mentor sem tocar no Firebase de verdade.
 *
 * Roda contra o arquivo que vai para o ar (worker/api/mentor.js), com um
 * banco de mentira em memória para mentores/{uid}, usuarios/{uid} e a
 * consulta a emails por e-mail.
 *
 *   node testar-mentor.mjs
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

/* ── banco de mentira ────────────────────────────────────────────────── */
let MENTORES = {};   // uid -> { fields }
let USUARIOS = {};   // uid -> { fields }   (usuarios/{uid}.dados é texto JSON)
let EMAILS = {};     // email -> uid        (para a consulta em "emails")
let QUEM = { email: 'mentora@email.com', localId: 'uid-mentora' };

const json = (corpo, status = 200) => new Response(JSON.stringify(corpo),
  { status, headers: { 'Content-Type': 'application/json' } });

globalThis.fetch = async (url, opcoes = {}) => {
  const u = String(url);
  if (u.includes('identitytoolkit.googleapis.com')) {
    return QUEM ? json({ users: [QUEM] }) : json({ error: {} }, 400);
  }
  if (u.includes('oauth2.googleapis.com/token')) return json({ access_token: 'token-falso' });

  if (u.includes(':runQuery')) {
    const corpo = JSON.parse(opcoes.body);
    const email = corpo.structuredQuery.where.fieldFilter.value.stringValue;
    const uid = EMAILS[email];
    return json(uid ? [{ document: { name: 'p/documents/emails/' + uid, fields: {} } }] : [{ readTime: 'agora' }]);
  }

  const m1 = /\/documents\/mentores\/([^/?]+)(?:\?|$)/.exec(u);
  if (m1) {
    const uid = m1[1];
    const metodo = opcoes.method || 'GET';
    if (metodo === 'GET') return MENTORES[uid] ? json(MENTORES[uid]) : json({ error: {} }, 404);
    MENTORES[uid] = JSON.parse(opcoes.body);
    return json({ name: uid });
  }

  const m2 = /\/documents\/usuarios\/([^/?]+)(?:\?|$)/.exec(u);
  if (m2) {
    const uid = m2[1];
    const metodo = opcoes.method || 'GET';
    if (metodo === 'GET') return USUARIOS[uid] ? json(USUARIOS[uid]) : json({ error: {} }, 404);
    USUARIOS[uid] = JSON.parse(opcoes.body);
    return json({ name: uid });
  }

  throw new Error('chamada inesperada: ' + u);
};

const env = { FIREBASE_API_KEY: 'chave', FIREBASE_SERVICE_ACCOUNT: JSON.stringify(CONTA) };
const carregar = async () => (await import('../worker/api/mentor.js?v=' + Math.random())).onRequest;
const pedir = async (corpo, metodo = 'POST') => {
  const fn = await carregar();
  const res = await fn({
    request: new Request('http://local/api/mentor', {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      ...(metodo === 'POST' ? { body: JSON.stringify({ token: 't', ...corpo }) } : {}),
    }),
    env,
  });
  return { status: res.status, corpo: await res.json() };
};

const dadosAluno = (extra) => ({
  dados: {
    stringValue: JSON.stringify({
      profile: { name: 'Aluno Um', examDate: '2027-01-10' },
      marks: {}, routine: [], tasks: [], sessions: [], ...extra,
    }),
  },
});

/* ── quem não é mentor não passa ─────────────────────────────────────── */
let r = await pedir({ acao: 'status' });
if (r.corpo.ok && r.corpo.mentor === false) ok('quem nunca resgatou o cupom não é mentor');
else falha('status sem cupom: ' + JSON.stringify(r));

r = await pedir({ acao: 'adicionar', email: 'aluno@email.com' });
if (r.status === 403) ok('quem não é mentor não adiciona aluno');
else falha('adicionar sem ser mentor: ' + JSON.stringify(r));

/* ── o dono é mentor mesmo sem ter resgatado nada ────────────────────── */
QUEM = { email: 'joseeduardo1616@gmail.com', localId: 'uid-dono' };
r = await pedir({ acao: 'status' });
if (r.corpo.ok && r.corpo.mentor === true) ok('o dono é mentor sem precisar do cupom');
else falha('status do dono: ' + JSON.stringify(r));
QUEM = { email: 'mentora@email.com', localId: 'uid-mentora' };

/* ── vira mentor pelo mesmo caminho que o cupom.js grava ─────────────── */
MENTORES['uid-mentora'] = { fields: { email: { stringValue: 'mentora@email.com' }, desde: { doubleValue: Date.now() }, alunos: { arrayValue: { values: [] } } } };
r = await pedir({ acao: 'status' });
if (r.corpo.ok && r.corpo.mentor === true && r.corpo.alunos.length === 0) ok('mentor cadastrado aparece com a lista vazia');
else falha('status de mentor: ' + JSON.stringify(r));

/* ── adicionar aluno ──────────────────────────────────────────────────── */
r = await pedir({ acao: 'adicionar', email: 'aluno@email.com' });
if (r.status === 404 && /Não achei conta/.test(r.corpo.erro)) ok('e-mail sem conta cadastrada é recusado');
else falha('adicionar sem conta: ' + JSON.stringify(r));

EMAILS['aluno@email.com'] = 'uid-aluno';
r = await pedir({ acao: 'adicionar', email: 'ALUNO@Email.com  '.trim() });
if (r.corpo.ok && r.corpo.alunos.some((a) => a.uid === 'uid-aluno')) ok('adiciona o aluno pelo e-mail, sem ligar para maiúscula');
else falha('adicionar aluno: ' + JSON.stringify(r));

r = await pedir({ acao: 'adicionar', email: 'aluno@email.com' });
if (r.status === 409) ok('não deixa adicionar o mesmo aluno duas vezes');
else falha('aluno duplicado: ' + JSON.stringify(r));

r = await pedir({ acao: 'adicionar', email: 'mentora@email.com' });
if (r.status === 400) ok('mentor não se adiciona como próprio aluno');
else falha('auto-adicionar: ' + JSON.stringify(r));

r = await pedir({ acao: 'adicionar', email: 'nao-e-email' });
if (r.status === 400) ok('e-mail mal formado é recusado');
else falha('e-mail inválido: ' + JSON.stringify(r));

/* ── só alcança quem está na própria lista ───────────────────────────── */
r = await pedir({ acao: 'aluno', uid: 'uid-fora-da-lista' });
if (r.status === 403) ok('não lê dados de quem não é seu aluno');
else falha('aluno fora da lista: ' + JSON.stringify(r));

/* ── aluno sem dados na nuvem ainda ──────────────────────────────────── */
r = await pedir({ acao: 'aluno', uid: 'uid-aluno' });
if (r.corpo.ok && r.corpo.encontrado === false) ok('aluno sem plano/nuvem ainda recebe aviso, não erro');
else falha('aluno sem dados: ' + JSON.stringify(r));

/* ── lê os dados do aluno ─────────────────────────────────────────────── */
USUARIOS['uid-aluno'] = { fields: { ...dadosAluno({ marks: { m1: { aula: true, date: '2026-01-01' } } }) } };
r = await pedir({ acao: 'aluno', uid: 'uid-aluno' });
if (r.corpo.ok && r.corpo.encontrado && r.corpo.aluno.nome === 'Aluno Um') ok('lê nome, prova, currículo, rotina e metas do aluno');
else falha('ler aluno: ' + JSON.stringify(r));
if (r.corpo.aluno.marks.m1.aula === true) ok('o currículo (marks) vem junto');
else falha('marks não veio: ' + JSON.stringify(r.corpo));

/* ── grava rotina ─────────────────────────────────────────────────────── */
r = await pedir({
  acao: 'rotina', uid: 'uid-aluno',
  rotina: [{ day: 1, label: 'Cardio', type: 'Aula', start: '08:00', end: '10:00' }],
});
if (r.corpo.ok) ok('salva a rotina do aluno');
else falha('salvar rotina: ' + JSON.stringify(r));
let salvo = JSON.parse(USUARIOS['uid-aluno'].fields.dados.stringValue);
if (salvo.routine.length === 1 && salvo.routine[0].type === 'Aula' && salvo.routine[0].id) {
  ok('a rotina gravada tem tipo válido e ganhou um id');
} else falha('rotina gravada errada: ' + JSON.stringify(salvo.routine));
if (USUARIOS['uid-aluno'].fields.dispositivo.stringValue === 'mentor') {
  ok('a gravação se identifica como vinda do mentor, não de um aparelho');
} else falha('dispositivo errado: ' + JSON.stringify(USUARIOS['uid-aluno'].fields));

r = await pedir({ acao: 'rotina', uid: 'uid-aluno', rotina: [{ day: 9, type: 'invalido', start: 'x', end: 'y' }] });
salvo = JSON.parse(USUARIOS['uid-aluno'].fields.dados.stringValue);
if (r.corpo.ok && salvo.routine[0].day === 6 && salvo.routine[0].type === 'Estudo' && salvo.routine[0].start === '07:00') {
  ok('valores fora do esperado na rotina caem para um padrão seguro, em vez de quebrar');
} else falha('saneamento da rotina: ' + JSON.stringify(salvo.routine));

/* ── grava metas (tasks) ──────────────────────────────────────────────── */
r = await pedir({ acao: 'tarefas', uid: 'uid-aluno', tarefas: [{ text: 'Revisar pré-eclâmpsia' }, { text: '' }] });
salvo = JSON.parse(USUARIOS['uid-aluno'].fields.dados.stringValue);
if (r.corpo.ok && salvo.tasks.length === 1 && salvo.tasks[0].text === 'Revisar pré-eclâmpsia' && salvo.tasks[0].done === false) {
  ok('salva as metas do aluno e descarta as vazias');
} else falha('salvar metas: ' + JSON.stringify(salvo.tasks));

/* ── marca matéria do currículo ───────────────────────────────────────── */
r = await pedir({ acao: 'marcar', uid: 'uid-aluno', materiaId: 'm2', feito: true });
salvo = JSON.parse(USUARIOS['uid-aluno'].fields.dados.stringValue);
if (r.corpo.ok && salvo.marks.m2.aula === true && salvo.marks.m2.date) ok('marca uma matéria nova como estudada, com data');
else falha('marcar matéria: ' + JSON.stringify(salvo.marks));
if (salvo.marks.m1.date === '2026-01-01') ok('marcar uma matéria não mexe na data de outra já marcada antes');
else falha('mexeu na data de outra matéria: ' + JSON.stringify(salvo.marks));

const dataM2 = salvo.marks.m2.date;
r = await pedir({ acao: 'marcar', uid: 'uid-aluno', materiaId: 'm2', feito: false });
salvo = JSON.parse(USUARIOS['uid-aluno'].fields.dados.stringValue);
if (r.corpo.ok && salvo.marks.m2.aula === false && salvo.marks.m2.date === dataM2) {
  ok('desmarcar não apaga a data em que foi estudada antes');
} else falha('desmarcar matéria: ' + JSON.stringify(salvo.marks));

/* ── remover aluno ────────────────────────────────────────────────────── */
r = await pedir({ acao: 'remover', uid: 'uid-aluno' });
if (r.corpo.ok && r.corpo.alunos.length === 0) ok('remove o aluno da lista');
else falha('remover aluno: ' + JSON.stringify(r));

r = await pedir({ acao: 'aluno', uid: 'uid-aluno' });
if (r.status === 403) ok('depois de removido, o mentor não alcança mais os dados dele');
else falha('acesso após remover: ' + JSON.stringify(r));

/* ── autenticação e método ───────────────────────────────────────────── */
QUEM = null;
r = await pedir({ acao: 'status' });
if (r.status === 401) ok('sem sessão válida, a rota não responde');
else falha('sem sessão: ' + JSON.stringify(r));
QUEM = { email: 'mentora@email.com', localId: 'uid-mentora' };

r = await pedir({}, 'GET');
if (r.status === 405) ok('só aceita POST');
else falha('método: ' + JSON.stringify(r));

delete env.FIREBASE_SERVICE_ACCOUNT;
r = await pedir({ acao: 'status' });
if (r.status === 500 && /FIREBASE_SERVICE_ACCOUNT/.test(r.corpo.erro)) ok('sem conta de serviço, explica o que falta');
else falha('sem conta de serviço: ' + JSON.stringify(r));
env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify(CONTA);

console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
