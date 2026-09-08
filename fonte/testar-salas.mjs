/* Testa as salas de amigos sem tocar no Firebase de verdade.
 *
 * Roda contra o arquivo que vai para o ar (worker/api/salas.js). A
 * identidade e o Firestore são respondidos aqui mesmo, com um banco de
 * mentira em memória, então dá para exercitar senha errada, entrar duas
 * vezes, o dono sair e o ranking.
 *
 *   node testar-salas.mjs
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
let SALAS = {};        // slug  -> { fields }
let PERFIS = {};       // uid   -> { fields }
let QUEM = { email: 'ana@email.com', localId: 'uid-ana' };

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
    const uid = corpo.structuredQuery.where.fieldFilter.value.stringValue;
    const achadas = Object.entries(SALAS)
      .filter(([, doc]) => (doc.fields.membros.arrayValue.values || [])
        .some((v) => v.stringValue === uid))
      .map(([slug, doc]) => ({ document: { name: 'p/documents/salas/' + slug, fields: doc.fields } }));
    return json(achadas.length ? achadas : [{ readTime: 'agora' }]);
  }

  if (u.includes(':batchGet')) {
    const corpo = JSON.parse(opcoes.body);
    return json(corpo.documents.map((caminho) => {
      /* O Firestore recusa qualquer coisa que não seja nome de documento
         começando em "projects/". Aceitar URL aqui deixaria passar um erro
         que só apareceria em produção, com o ranking vazio e sem motivo. */
      if (!/^projects\/[^/]+\/databases\/[^/]+\/documents\/perfis\/[^/]+$/.test(caminho)) {
        throw new Error('batchGet recebeu nome inválido: ' + caminho);
      }
      const uid = caminho.split('/').pop();
      return PERFIS[uid]
        ? { found: { name: caminho, fields: PERFIS[uid] } }
        : { missing: caminho };
    }));
  }

  const m = /\/documents\/salas\/([^/?]+)/.exec(u);
  if (m) {
    const slug = m[1];
    const metodo = opcoes.method || 'GET';
    if (metodo === 'GET') return SALAS[slug] ? json(SALAS[slug]) : json({ error: {} }, 404);
    if (metodo === 'DELETE') { delete SALAS[slug]; return json({}); }
    SALAS[slug] = JSON.parse(opcoes.body);
    return json({ name: slug });
  }
  throw new Error('chamada inesperada: ' + u);
};

const env = { FIREBASE_API_KEY: 'chave', FIREBASE_SERVICE_ACCOUNT: JSON.stringify(CONTA) };
const mod = await import('../worker/api/salas.js');

const pedir = async (corpo, metodo = 'POST') => {
  const res = await mod.onRequest({
    request: new Request('http://local/api/salas', {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      ...(metodo === 'POST' ? { body: JSON.stringify(corpo) } : {}),
    }),
    env,
  });
  return { status: res.status, corpo: await res.json() };
};

const como = (email, uid) => { QUEM = { email, localId: uid }; };
const membros = (slug) => (SALAS[slug].fields.membros.arrayValue.values || []).map((v) => v.stringValue);

/* ── apelido da sala ─────────────────────────────────────────────────── */
if (mod.apelido('Plantão da Madrugada!') === 'plantao-da-madrugada') ok('o nome da sala vira apelido sem acento nem símbolo');
else falha('apelido: ' + mod.apelido('Plantão da Madrugada!'));
if (mod.apelido('  R3 CLÍNICA  ') === mod.apelido('r3-clinica')) ok('maiúscula, acento e espaço levam à mesma sala');
else falha('apelido não junta as variações');

/* ── criar ───────────────────────────────────────────────────────────── */
let r = await pedir({ token: 't', acao: 'criar', nome: 'R3 Clínica', senha: 'segredo1' });
if (r.status === 200 && r.corpo.ok && r.corpo.slug === 'r3-clinica') ok('cria a sala e devolve o apelido');
else falha('criar: ' + JSON.stringify(r));
if (membros('r3-clinica').length === 1 && membros('r3-clinica')[0] === 'uid-ana') ok('quem cria já entra na sala');
else falha('criador fora da sala');
if (!JSON.stringify(SALAS['r3-clinica']).includes('segredo1')) ok('a senha em texto não é gravada no banco');
else falha('a senha foi parar no banco em texto puro');

r = await pedir({ token: 't', acao: 'criar', nome: 'r3-clinica', senha: 'outra123' });
if (r.status === 409) ok('não deixa criar duas salas com o mesmo nome');
else falha('nome repetido: ' + JSON.stringify(r));

r = await pedir({ token: 't', acao: 'criar', nome: 'Nova', senha: 'abc' });
if (r.status === 400 && /4 caracteres/.test(r.corpo.erro)) ok('senha curta é recusada ao criar');
else falha('senha curta: ' + JSON.stringify(r));

r = await pedir({ token: 't', acao: 'criar', nome: '!!', senha: 'segredo1' });
if (r.status === 400) ok('nome sem letra nem número é recusado');
else falha('nome vazio: ' + JSON.stringify(r));

/* ── entrar ──────────────────────────────────────────────────────────── */
como('bia@email.com', 'uid-bia');
r = await pedir({ token: 't', acao: 'entrar', nome: 'R3 Clínica', senha: 'errada!!' });
if (r.status === 403 && !/senha/i.test(r.corpo.erro.replace('Nome ou senha errados.', ''))) ok('senha errada não entra');
else falha('senha errada: ' + JSON.stringify(r));
if (membros('r3-clinica').length === 1) ok('quem errou a senha não é adicionado à sala');
else falha('senha errada mesmo assim entrou');

r = await pedir({ token: 't', acao: 'entrar', nome: 'R3 Clínica', senha: 'segredo1' });
if (r.status === 200 && r.corpo.ok) ok('senha certa entra na sala');
else falha('entrar: ' + JSON.stringify(r));
if (membros('r3-clinica').length === 2) ok('a sala passa a ter duas pessoas');
else falha('membros: ' + JSON.stringify(membros('r3-clinica')));

r = await pedir({ token: 't', acao: 'entrar', nome: 'R3 Clínica', senha: 'segredo1' });
if (membros('r3-clinica').length === 2) ok('entrar de novo não duplica a pessoa');
else falha('duplicou o membro');

r = await pedir({ token: 't', acao: 'entrar', nome: 'sala-que-nao-existe', senha: 'segredo1' });
if (r.status === 404) ok('sala inexistente avisa em vez de criar');
else falha('sala inexistente: ' + JSON.stringify(r));

/* ── ranking ─────────────────────────────────────────────────────────── */
PERFIS['uid-ana'] = {
  nome: { stringValue: 'Ana' }, minutos: { doubleValue: 600 },
  questoes: { doubleValue: 200 }, acertos: { doubleValue: 150 },
  atualizadoEm: { doubleValue: Date.now() },
};
PERFIS['uid-bia'] = {
  nome: { stringValue: 'Bia' }, minutos: { doubleValue: 900 },
  questoes: { doubleValue: 100 }, acertos: { doubleValue: 90 },
  atualizadoEm: { doubleValue: Date.now() },
};
r = await pedir({ token: 't', acao: 'ranking', nome: 'r3-clinica' });
const lista = r.corpo.ranking || [];
if (lista.length === 2 && lista[0].nome === 'Bia') ok('o ranking ordena por horas líquidas');
else falha('ranking: ' + JSON.stringify(r.corpo));
if (lista[0].posicao === 1 && lista[1].posicao === 2) ok('as posições vêm numeradas');
else falha('posições erradas');
if (lista[0].pct === 90 && lista[1].pct === 75) ok('a porcentagem de acerto vem calculada');
else falha('pct: ' + JSON.stringify(lista.map((x) => x.pct)));
if (lista.find((x) => x.nome === 'Bia').souEu) ok('o ranking marca quem está pedindo');
else falha('não marcou souEu');

/* quem não é da sala não vê o ranking */
como('caio@email.com', 'uid-caio');
r = await pedir({ token: 't', acao: 'ranking', nome: 'r3-clinica' });
if (r.status === 403) ok('quem não está na sala não lê o ranking');
else falha('ranking sem ser membro: ' + JSON.stringify(r));

/* perfil que ainda não sincronizou não some do ranking */
SALAS['r3-clinica'].fields.membros.arrayValue.values.push({ stringValue: 'uid-caio' });
r = await pedir({ token: 't', acao: 'ranking', nome: 'r3-clinica' });
const semPerfil = (r.corpo.ranking || []).find((x) => x.uid === 'uid-caio');
if (semPerfil && semPerfil.minutos === 0 && semPerfil.pct === null) ok('quem ainda não sincronizou aparece zerado, não some');
else falha('membro sem perfil: ' + JSON.stringify(semPerfil));

/* ── minhas salas ────────────────────────────────────────────────────── */
como('ana@email.com', 'uid-ana');
r = await pedir({ token: 't', acao: 'minhas' });
if ((r.corpo.salas || []).length === 1 && r.corpo.salas[0].membros === 3) ok('lista as salas de quem pergunta, com o tamanho');
else falha('minhas: ' + JSON.stringify(r.corpo));

como('dani@email.com', 'uid-dani');
r = await pedir({ token: 't', acao: 'minhas' });
if ((r.corpo.salas || []).length === 0) ok('quem não está em sala nenhuma recebe lista vazia');
else falha('minhas de quem não participa: ' + JSON.stringify(r.corpo));

/* ── sair ────────────────────────────────────────────────────────────── */
como('ana@email.com', 'uid-ana');
r = await pedir({ token: 't', acao: 'sair', nome: 'r3-clinica' });
if (r.corpo.ok && membros('r3-clinica').indexOf('uid-ana') < 0) ok('sair tira a pessoa da sala');
else falha('sair: ' + JSON.stringify(r));
if (SALAS['r3-clinica'].fields.dono.stringValue !== 'uid-ana') ok('quando quem criou sai, a sala passa para outra pessoa');
else falha('a sala ficou sem dono de verdade');

como('bia@email.com', 'uid-bia');
await pedir({ token: 't', acao: 'sair', nome: 'r3-clinica' });
como('caio@email.com', 'uid-caio');
r = await pedir({ token: 't', acao: 'sair', nome: 'r3-clinica' });
if (!SALAS['r3-clinica']) ok('a última pessoa a sair encerra a sala');
else falha('sala vazia continuou de pé');

/* ── recusas gerais ──────────────────────────────────────────────────── */
QUEM = null;
r = await pedir({ token: 't', acao: 'minhas' });
if (r.status === 401) ok('sem sessão válida, as salas não respondem');
else falha('sessão inválida: ' + JSON.stringify(r));
como('ana@email.com', 'uid-ana');

r = await pedir({}, 'GET');
if (r.status === 405) ok('só aceita POST');
else falha('método: ' + JSON.stringify(r));

delete env.FIREBASE_SERVICE_ACCOUNT;
r = await pedir({ token: 't', acao: 'minhas' });
if (r.status === 500 && /FIREBASE_SERVICE_ACCOUNT/.test(r.corpo.erro)) ok('sem conta de serviço, explica o que falta');
else falha('sem conta de serviço: ' + JSON.stringify(r));
env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify(CONTA);

console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
