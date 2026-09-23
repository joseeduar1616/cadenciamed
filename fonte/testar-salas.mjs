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
let RECADOS = {};      // slug  -> { fields }  (salas/{slug}/mensagens/log)
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
    const col = corpo.structuredQuery.from[0].collectionId;
    const uid = corpo.structuredQuery.where.fieldFilter.value.stringValue;
    /* A consulta é por coleção: a sala de treino não pode aparecer na lista
       do estudo nem o contrário. */
    const achadas = Object.entries(SALAS)
      .filter(([chave]) => (col === 'salas' ? chave.indexOf(':') < 0 : chave.startsWith(col + ':')))
      .filter(([, doc]) => (doc.fields.membros.arrayValue.values || [])
        .some((v) => v.stringValue === uid))
      .map(([chave, doc]) => ({
        document: { name: 'p/documents/' + col + '/' + chave.split(':').pop(), fields: doc.fields },
      }));
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

  /* Os recados moram pendurados na sala, num documento só. Vem antes da
     regra da sala porque o caminho começa igual — e se a rota errar o
     endereço, é aqui que o teste percebe, em vez de devolver a sala. */
  const c = /\/documents\/(salas|salasTreino|salasSimulado)\/([^/?]+)\/mensagens\/log$/.exec(u);
  if (c) {
    const slug = chaveDe(c[1], c[2]);
    const metodo = opcoes.method || 'GET';
    if (metodo === 'GET') return RECADOS[slug] ? json(RECADOS[slug]) : json({ error: {} }, 404);
    if (metodo === 'DELETE') { delete RECADOS[slug]; return json({}); }
    RECADOS[slug] = JSON.parse(opcoes.body);
    return json({ name: slug });
  }

  /* O mural de treino e as fotos, pelo mesmo motivo dos recados: o
     caminho começa igual ao da sala e tem de ser testado antes. */
  const si = /\/documents\/(salas|salasTreino|salasSimulado)\/([^/?]+)\/simulados\/lista$/.exec(u);
  if (si) {
    const slug = chaveDe(si[1], si[2]);
    const metodo = opcoes.method || 'GET';
    if (metodo === 'GET') return SIMULADOS[slug] ? json(SIMULADOS[slug]) : json({ error: {} }, 404);
    if (metodo === 'DELETE') { delete SIMULADOS[slug]; return json({}); }
    SIMULADOS[slug] = JSON.parse(opcoes.body);
    return json({ name: slug });
  }

  const mu = /\/documents\/(salas|salasTreino|salasSimulado)\/([^/?]+)\/treinos\/mural$/.exec(u);
  if (mu) {
    const slug = chaveDe(mu[1], mu[2]);
    const metodo = opcoes.method || 'GET';
    if (metodo === 'GET') return MURAIS[slug] ? json(MURAIS[slug]) : json({ error: {} }, 404);
    if (metodo === 'DELETE') { delete MURAIS[slug]; return json({}); }
    MURAIS[slug] = JSON.parse(opcoes.body);
    return json({ name: slug });
  }

  const ft = /\/documents\/(salas|salasTreino|salasSimulado)\/([^/?]+)\/fotos\/([^/?]+)$/.exec(u);
  if (ft) {
    const chave = chaveDe(ft[1], ft[2]) + '/' + ft[3];
    const metodo = opcoes.method || 'GET';
    if (metodo === 'GET') return FOTOS[chave] ? json(FOTOS[chave]) : json({ error: {} }, 404);
    if (metodo === 'DELETE') { delete FOTOS[chave]; return json({}); }
    FOTOS[chave] = JSON.parse(opcoes.body);
    return json({ name: chave });
  }

  const m = /\/documents\/(salas|salasTreino|salasSimulado)\/([^/?]+)(?:\?|$)/.exec(u);
  if (m) {
    const slug = chaveDe(m[1], m[2]);
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
/* As duas famílias de sala moram em coleções separadas no Firestore. Aqui
   elas dividem o mesmo objeto, com a de treino marcada na chave: assim
   tudo que já era testado continua achando a sala pelo slug puro. */
const chaveDe = (col, slug) => (col === 'salas' ? slug : col + ':' + slug);
const SIMULADOS = {};
const MURAIS = {};
const FOTOS = {};
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
/* O recorte é decidido pelo servidor, no fuso de quem usa o app. O teste
   pergunta a ele qual é, em vez de recalcular — recalcular aqui era só uma
   segunda chance de errar do mesmo jeito. */
const SEMANA = mod.recorteAtual('semana').chave;
const MES = mod.recorteAtual('mes').chave;
const DIA = mod.recorteAtual('hoje').chave;

/* Bia estudou mais no acumulado; Ana estudou mais nesta semana. É a troca de
   liderança entre os recortes que prova que o filtro faz alguma coisa. */
PERFIS['uid-ana'] = {
  nome: { stringValue: 'Ana' },
  minutos: { doubleValue: 600 }, questoes: { doubleValue: 200 }, acertos: { doubleValue: 150 },
  semanaChave: { stringValue: SEMANA },
  semanaMinutos: { doubleValue: 300 }, semanaQuestoes: { doubleValue: 80 }, semanaAcertos: { doubleValue: 60 },
  mesChave: { stringValue: MES },
  mesMinutos: { doubleValue: 500 }, mesQuestoes: { doubleValue: 120 }, mesAcertos: { doubleValue: 90 },
  diaChave: { stringValue: DIA },
  diaMinutos: { doubleValue: 20 }, diaQuestoes: { doubleValue: 10 }, diaAcertos: { doubleValue: 8 },
  atualizadoEm: { doubleValue: Date.now() },
};
PERFIS['uid-bia'] = {
  nome: { stringValue: 'Bia' },
  minutos: { doubleValue: 900 }, questoes: { doubleValue: 100 }, acertos: { doubleValue: 90 },
  semanaChave: { stringValue: SEMANA },
  semanaMinutos: { doubleValue: 120 }, semanaQuestoes: { doubleValue: 40 }, semanaAcertos: { doubleValue: 30 },
  mesChave: { stringValue: MES },
  mesMinutos: { doubleValue: 800 }, mesQuestoes: { doubleValue: 90 }, mesAcertos: { doubleValue: 81 },
  /* Bia estudou hoje e Ana quase não: no recorte do dia a ordem vira outra,
     que é o que a aba mostra quando alguém pergunta "quem já começou hoje". */
  diaChave: { stringValue: DIA },
  diaMinutos: { doubleValue: 95 }, diaQuestoes: { doubleValue: 30 }, diaAcertos: { doubleValue: 15 },
  atualizadoEm: { doubleValue: Date.now() },
};

/* sem pedir período, vale a semana: é a corrida que interessa */
r = await pedir({ token: 't', acao: 'ranking', nome: 'r3-clinica' });
let lista = r.corpo.ranking || [];
if (r.corpo.sala.periodo === 'semana') ok('sem pedir período, o ranking é o da semana');
else falha('período padrão: ' + JSON.stringify(r.corpo.sala));
if (lista.length === 2 && lista[0].nome === 'Ana' && lista[0].minutos === 300) ok('na semana lidera quem estudou mais na semana');
else falha('ranking semanal: ' + JSON.stringify(lista));
if (lista[0].posicao === 1 && lista[1].posicao === 2) ok('as posições vêm numeradas');
else falha('posições erradas');
if (lista[0].pct === 75 && lista[1].pct === 75) ok('a porcentagem de acerto é a do recorte, não a geral');
else falha('pct semanal: ' + JSON.stringify(lista.map((x) => x.pct)));
if (lista.find((x) => x.nome === 'Bia').souEu) ok('o ranking marca quem está pedindo');
else falha('não marcou souEu');

/* mês */
r = await pedir({ token: 't', acao: 'ranking', nome: 'r3-clinica', periodo: 'mes' });
lista = r.corpo.ranking || [];
if (r.corpo.sala.periodo === 'mes' && lista[0].nome === 'Bia' && lista[0].minutos === 800) ok('no mês a liderança troca, com os números do mês');
else falha('ranking mensal: ' + JSON.stringify(r.corpo));

/* desde sempre */
r = await pedir({ token: 't', acao: 'ranking', nome: 'r3-clinica', periodo: 'total' });
lista = r.corpo.ranking || [];
if (lista[0].nome === 'Bia' && lista[0].minutos === 900) ok('o total continua sendo o acumulado de sempre');
else falha('ranking total: ' + JSON.stringify(lista));

/* ── o dia ───────────────────────────────────────────────────────────── */
r = await pedir({ token: 't', acao: 'ranking', nome: 'r3-clinica', periodo: 'hoje' });
lista = r.corpo.ranking || [];
if (r.corpo.sala.periodo === 'dia' && r.corpo.sala.rotulo === 'hoje') ok('o recorte do dia existe e vem rotulado');
else falha('recorte do dia: ' + JSON.stringify(r.corpo.sala));
if (lista[0].nome === 'Bia' && lista[0].minutos === 95) ok('no dia lidera quem estudou hoje, com os minutos de hoje');
else falha('ranking do dia: ' + JSON.stringify(lista));

/* o dia acompanha qualquer recorte: na semana, cada linha ainda diz quanto
   a pessoa fez hoje, que é o que muda o que ela faz agora */
r = await pedir({ token: 't', acao: 'ranking', nome: 'r3-clinica', periodo: 'semana' });
lista = r.corpo.ranking || [];
const naSemana = Object.fromEntries(lista.map((x) => [x.nome, x]));
if (naSemana.Bia.hoje.minutos === 95 && naSemana.Ana.hoje.minutos === 20) ok('o número de hoje vai junto mesmo no ranking da semana');
else falha('hoje dentro da semana: ' + JSON.stringify(lista.map((x) => [x.nome, x.hoje])));

/* dia de ontem não passa por dia de hoje */
PERFIS['uid-ana'].diaChave = { stringValue: '2000-01-01' };
r = await pedir({ token: 't', acao: 'ranking', nome: 'r3-clinica', periodo: 'hoje' });
lista = r.corpo.ranking || [];
if ((lista.find((x) => x.nome === 'Ana') || {}).minutos === 0) ok('número de outro dia não conta como de hoje');
else falha('dia velho contou: ' + JSON.stringify(lista));
PERFIS['uid-ana'].diaChave = { stringValue: DIA };

/* período inventado não pode derrubar a rota nem virar outro recorte */
r = await pedir({ token: 't', acao: 'ranking', nome: 'r3-clinica', periodo: 'trimestre' });
if (r.corpo.sala.periodo === 'semana') ok('período desconhecido cai na semana em vez de quebrar');
else falha('período inventado: ' + JSON.stringify(r.corpo.sala));

/* ── números velhos não valem para o recorte de agora ────────────────── */
PERFIS['uid-bia'].semanaChave = { stringValue: '2020-01-06' };
PERFIS['uid-bia'].semanaMinutos = { doubleValue: 5000 };
r = await pedir({ token: 't', acao: 'ranking', nome: 'r3-clinica' });
lista = r.corpo.ranking || [];
const velha = lista.find((x) => x.nome === 'Bia');
if (velha.minutos === 0 && lista[0].nome === 'Ana') ok('quem não abriu o app nesta semana não lidera com número da semana passada');
else falha('semana velha: ' + JSON.stringify(lista));
if (velha.foraDoRecorte) ok('a tela consegue diferenciar "não estudou" de "não abriu o app no período"');
else falha('não marcou foraDoRecorte');
if (lista.find((x) => x.nome === 'Ana').minutos === 300) ok('quem está em dia mantém os números da semana');
else falha('Ana perdeu os números');
PERFIS['uid-bia'].semanaChave = { stringValue: SEMANA };
PERFIS['uid-bia'].semanaMinutos = { doubleValue: 120 };

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

/* ── estudando agora ─────────────────────────────────────────────────── */
como('ana@email.com', 'uid-ana');

/* Bia deu sinal de vida há pouco, com 20 minutos já corridos. */
PERFIS['uid-bia'].presencaEm = { doubleValue: Date.now() - 30000 };
PERFIS['uid-bia'].presencaMin = { doubleValue: 20 };
r = await pedir({ token: 't', acao: 'ranking', nome: 'r3-clinica' });
let bia = (r.corpo.ranking || []).find((x) => x.nome === 'Bia');
if (bia.estudando) ok('quem está com o cronômetro andando aparece como estudando agora');
else falha('presença recente não apareceu: ' + JSON.stringify(bia));
if (bia.agoraMin >= 20 && bia.agoraMin <= 21) ok('o tempo em andamento acompanha o relógio desde o último sinal');
else falha('minutos ao vivo: ' + bia.agoraMin);
if (bia.minutos === 120) ok('o tempo em andamento não entra no ranking, que conta sessão lançada');
else falha('o tempo em andamento vazou para o ranking: ' + bia.minutos);
if (!(r.corpo.ranking || []).find((x) => x.nome === 'Ana').estudando) ok('quem não deu sinal não aparece estudando');
else falha('Ana apareceu estudando sem ter dado sinal');

/* Sinal velho é de quem fechou a aba sem avisar. */
PERFIS['uid-bia'].presencaEm = { doubleValue: Date.now() - 600000 };
r = await pedir({ token: 't', acao: 'ranking', nome: 'r3-clinica' });
bia = (r.corpo.ranking || []).find((x) => x.nome === 'Bia');
if (!bia.estudando && bia.agoraMin === 0) ok('sinal antigo vence sozinho, para quem fechou a aba sem avisar');
else falha('sinal velho continuou valendo: ' + JSON.stringify(bia));

/* Quem escolheu não mostrar o desempenho também não é marcado na sala. */
PERFIS['uid-bia'].presencaEm = { doubleValue: Date.now() - 30000 };
PERFIS['uid-bia'].oculto = { booleanValue: true };
r = await pedir({ token: 't', acao: 'ranking', nome: 'r3-clinica' });
bia = (r.corpo.ranking || []).find((x) => x.nome === 'Bia');
if (!bia.estudando) ok('quem não mostra o desempenho também não aparece estudando');
else falha('privacidade furada pela presença: ' + JSON.stringify(bia));
delete PERFIS['uid-bia'].oculto;
delete PERFIS['uid-bia'].presencaEm;
delete PERFIS['uid-bia'].presencaMin;

/* ── recados ─────────────────────────────────────────────────────────── */
r = await pedir({ token: 't', acao: 'recados', nome: 'r3-clinica' });
if (r.status === 200 && (r.corpo.recados || []).length === 0) ok('sala sem conversa devolve lista vazia, não erro');
else falha('recados de sala nova: ' + JSON.stringify(r));

r = await pedir({ token: 't', acao: 'dizer', nome: 'r3-clinica', texto: '  bora às 19h  ' });
if (r.corpo.ok && r.corpo.recados.length === 1 && r.corpo.recados[0].texto === 'bora às 19h') ok('a mensagem é gravada sem o espaço sobrando');
else falha('dizer: ' + JSON.stringify(r));
if (r.corpo.recados[0].nome === 'Ana') ok('a assinatura vem do perfil de quem manda');
else falha('nome na mensagem: ' + JSON.stringify(r.corpo.recados[0]));

/* Assinar como outra pessoa é o que o servidor precisa impedir: o nome do
   pedido é ignorado, vale o do perfil. */
r = await pedir({ token: 't', acao: 'dizer', nome: 'r3-clinica', texto: 'sou a Bia', nomeAutor: 'Bia', autor: 'Bia' });
if (r.corpo.recados[1].nome === 'Ana') ok('não dá para assinar a mensagem como outra pessoa');
else falha('assinatura forjada: ' + JSON.stringify(r.corpo.recados[1]));

r = await pedir({ token: 't', acao: 'dizer', nome: 'r3-clinica', texto: '   ' });
if (r.status === 400) ok('mensagem só de espaço é recusada');
else falha('mensagem vazia: ' + JSON.stringify(r));

r = await pedir({ token: 't', acao: 'dizer', nome: 'r3-clinica', texto: 'x'.repeat(900) });
if (r.corpo.recados[r.corpo.recados.length - 1].texto.length === 400) ok('mensagem comprida é cortada no limite');
else falha('corte: ' + r.corpo.recados[r.corpo.recados.length - 1].texto.length);

/* A sala guarda as últimas, e não a conversa inteira: senão o documento
   cresceria para sempre. */
for (let i = 0; i < 82; i++) {
  r = await pedir({ token: 't', acao: 'dizer', nome: 'r3-clinica', texto: 'msg ' + i });
}
if (r.corpo.recados.length === 80) ok('a sala guarda só as 80 últimas mensagens');
else falha('quantidade guardada: ' + r.corpo.recados.length);
if (r.corpo.recados[79].texto === 'msg 81') ok('a última mensagem é a mais recente');
else falha('ordem das mensagens: ' + r.corpo.recados[79].texto);

como('dani@email.com', 'uid-dani');
r = await pedir({ token: 't', acao: 'recados', nome: 'r3-clinica' });
if (r.status === 403) ok('quem não está na sala não lê a conversa');
else falha('recados sem ser membro: ' + JSON.stringify(r));
r = await pedir({ token: 't', acao: 'dizer', nome: 'r3-clinica', texto: 'oi' });
if (r.status === 403) ok('quem não está na sala não escreve nela');
else falha('dizer sem ser membro: ' + JSON.stringify(r));

/* ── estudar juntos: foco combinado e Jam ────────────────────────────── */
como('ana@email.com', 'uid-ana');

r = await pedir({ token: 't', acao: 'focar', nome: 'r3-clinica', minutos: 50 });
if (r.corpo.ok && r.corpo.foco && r.corpo.foco.minutos === 50) ok('dá para combinar um foco com a sala');
else falha('focar: ' + JSON.stringify(r));

r = await pedir({ token: 't', acao: 'ranking', nome: 'r3-clinica' });
if (r.corpo.foco && r.corpo.foco.restaSeg > 0) ok('o foco combinado chega junto com o ranking, com o tempo que falta');
else falha('foco no ranking: ' + JSON.stringify(r.corpo.foco));
/* O nome de quem combinou vem do perfil guardado, nunca do pedido: senão
   qualquer pessoa da sala assinaria como outra. */
r = await pedir({ token: 't', acao: 'focar', nome: 'r3-clinica', minutos: 25, por: 'Fulano Inventado' });
if (r.corpo.foco.por !== 'Fulano Inventado') ok('quem combinou o foco é dito pelo perfil, não pelo pedido');
else falha('aceitou o nome que veio no pedido: ' + r.corpo.foco.por);

/* Vai de 5 minutos a 12 horas: quem quer marcar um domingo inteiro de
   estudo consegue, e acima disso o relógio ficaria na sala para sempre. */
for (const m of [1, 4, 721, 99999]) {
  r = await pedir({ token: 't', acao: 'focar', nome: 'r3-clinica', minutos: m });
  if (r.status !== 400) { falha('aceitou foco de ' + m + ' minutos'); break; }
}
if (r.status === 400) ok('foco curto demais ou longo demais é recusado');

r = await pedir({ token: 't', acao: 'focar', nome: 'r3-clinica', minutos: 300 });
if (r.corpo.ok && r.corpo.foco && r.corpo.foco.minutos === 300) ok('cinco horas de foco combinado são aceitas');
else falha('recusou cinco horas: ' + JSON.stringify(r));

r = await pedir({ token: 't', acao: 'focar', nome: 'r3-clinica', minutos: 0 });
if (r.corpo.ok && r.corpo.foco === null) ok('dá para encerrar o foco para a sala inteira');
else falha('encerrar foco: ' + JSON.stringify(r));

/* Foco vencido é o mesmo que foco nenhum: ninguém precisa desligar, e
   fechar a aba não avisa ninguém. */
await pedir({ token: 't', acao: 'focar', nome: 'r3-clinica', minutos: 5 });
SALAS['r3-clinica'].fields.focoInicio = { doubleValue: Date.now() - 10 * 60000 };
r = await pedir({ token: 't', acao: 'ranking', nome: 'r3-clinica' });
if (r.corpo.foco === null) ok('foco que já venceu some sozinho, sem ninguém desligar');
else falha('foco vencido continuou de pé: ' + JSON.stringify(r.corpo.foco));

r = await pedir({ token: 't', acao: 'jam', nome: 'r3-clinica', url: 'https://open.spotify.com/playlist/abc' });
if (r.corpo.ok && r.corpo.jam && /open.spotify.com/.test(r.corpo.jam.url)) ok('dá para combinar o link da Jam do Spotify');
else falha('jam: ' + JSON.stringify(r));

/* O campo não pode virar um jeito de mandar qualquer link para a sala
   inteira de uma vez. */
for (const u of ['https://exemplo.com/virus', 'http://open.spotify.com/x', 'javascript:alert(1)',
  'https://open.spotify.com.mal.com/x', 'não é link']) {
  r = await pedir({ token: 't', acao: 'jam', nome: 'r3-clinica', url: u });
  if (r.status !== 400) { falha('aceitou como Jam do Spotify: ' + u); break; }
}
if (r.status === 400) ok('só link do próprio Spotify entra como Jam');

r = await pedir({ token: 't', acao: 'ranking', nome: 'r3-clinica' });
if (r.corpo.jam && r.corpo.jam.url) ok('o link recusado não derrubou o que já estava combinado');
else falha('a Jam sumiu depois de um link recusado: ' + JSON.stringify(r.corpo.jam));

r = await pedir({ token: 't', acao: 'jam', nome: 'r3-clinica', url: '' });
if (r.corpo.ok && r.corpo.jam === null) ok('dá para tirar a Jam da sala');
else falha('tirar jam: ' + JSON.stringify(r));

/* Nem foco nem Jam podem ter derrubado o resto da sala: o PATCH do
   Firestore troca o documento inteiro, e campo que não for regravado some. */
r = await pedir({ token: 't', acao: 'ranking', nome: 'r3-clinica' });
if ((r.corpo.ranking || []).length === 3) ok('mexer no foco e na Jam não apaga os membros da sala');
else falha('a sala perdeu membros: ' + JSON.stringify(r.corpo.ranking));

como('dani@email.com', 'uid-dani');
r = await pedir({ token: 't', acao: 'focar', nome: 'r3-clinica', minutos: 25 });
if (r.status === 403) ok('quem não está na sala não combina foco nela');
else falha('focar sem ser membro: ' + JSON.stringify(r));
r = await pedir({ token: 't', acao: 'jam', nome: 'r3-clinica', url: 'https://open.spotify.com/x' });
if (r.status === 403) ok('quem não está na sala não posta Jam nela');
else falha('jam sem ser membro: ' + JSON.stringify(r));

/* ── simulados: só vê quem mostra ────────────────────────────────────
   A regra inteira da aba vive no servidor, e é isso que estes testes
   cobram. Se ela morasse na tela, esconder o número não esconderia nada:
   ele já teria chegado ao navegador, e bastaria abrir a aba de rede. */
como('ana@email.com', 'uid-ana');

let rs = await pedir({ token: 't', acao: 'sim-criar', nome: 'r3-clinica', titulo: 'Simulado USP', total: 100 });
if (rs.corpo.ok && rs.corpo.id) ok('dá para criar um simulado na sala');
else falha('criar simulado: ' + JSON.stringify(rs));
const idSim = rs.corpo.id;

for (const [t, q] of [['', 100], ['Sem questões', 0], ['Demais', 900]]) {
  rs = await pedir({ token: 't', acao: 'sim-criar', nome: 'r3-clinica', titulo: t, total: q });
  if (rs.status !== 400) { falha(`aceitou simulado "${t}" com ${q} questões`); break; }
}
if (rs.status === 400) ok('simulado sem nome ou com número impossível de questões é recusado');

/* Ana ainda não lançou: não pode ver nada de ninguém. */
rs = await pedir({ token: 't', acao: 'sim-listar', nome: 'r3-clinica' });
let sim = (rs.corpo.simulados || [])[0];
if (sim && sim.liberado === false && sim.linhas.length === 0) ok('quem não lançou não recebe resultado de ninguém');
else falha('veio resultado sem ter lançado: ' + JSON.stringify(sim));

como('bia@email.com', 'uid-bia');
rs = await pedir({ token: 't', acao: 'sim-lancar', nome: 'r3-clinica', id: idSim, acertos: 82 });
if (rs.corpo.ok) ok('dá para lançar o próprio acerto');
else falha('lançar: ' + JSON.stringify(rs));

/* Bia lançou, mas é a única: vê só a si mesma, o que é o correto. */
if (rs.corpo.simulado.liberado && rs.corpo.simulado.linhas.length === 1) ok('quem lançou vê o placar, mesmo sozinho');
else falha('placar de quem lançou: ' + JSON.stringify(rs.corpo.simulado));

/* Ana continua sem ver, mesmo agora que existe resultado para ver. */
como('ana@email.com', 'uid-ana');
rs = await pedir({ token: 't', acao: 'sim-listar', nome: 'r3-clinica' });
sim = (rs.corpo.simulados || [])[0];
if (sim.liberado === false && sim.linhas.length === 0) ok('existir resultado de outro não libera quem não lançou');
else falha('vazou o resultado da Bia: ' + JSON.stringify(sim));
/* Mas dá para saber que tem gente lá: é o que convida a lançar. */
if (sim.quantos === 1) ok('quem não lançou vê quantos já lançaram, sem os números');
else falha('a contagem de quem lançou saiu ' + sim.quantos);
/* E o número da Bia não pode estar escondido em canto nenhum da resposta.
 *
 * A checagem percorre os valores em vez de procurar "82" no JSON inteiro:
 * a resposta carrega carimbos de tempo de treze dígitos, e dois dígitos
 * quaisquer aparecem dentro deles por acaso o tempo todo. Do jeito antigo
 * este teste ficava vermelho de vez em quando sem nada estar errado — e
 * teste que fica vermelho à toa ensina a ignorar vermelho. */
const carregaValor = (x, alvo) => {
  if (x === alvo || x === String(alvo)) return true;
  if (Array.isArray(x)) return x.some((y) => carregaValor(y, alvo));
  if (x && typeof x === 'object') return Object.values(x).some((y) => carregaValor(y, alvo));
  return false;
};
if (!carregaValor(rs.corpo, 82)) ok('o acerto do outro não viaja escondido na resposta');
else falha('o número do outro veio na resposta, só não desenhado');

rs = await pedir({ token: 't', acao: 'sim-lancar', nome: 'r3-clinica', id: idSim, acertos: 91 });
if (rs.corpo.simulado.liberado && rs.corpo.simulado.linhas.length === 2) ok('lançar o próprio abre o placar dos outros');
else falha('depois de lançar: ' + JSON.stringify(rs.corpo.simulado));
if (rs.corpo.simulado.linhas[0].acertos === 91) ok('o placar vem em ordem de acerto');
else falha('ordem do placar: ' + JSON.stringify(rs.corpo.simulado.linhas));

/* Acerto fora do possível é do tipo que passa despercebido e estraga o
   placar de todo mundo. */
for (const n of [-1, 101, 9999]) {
  rs = await pedir({ token: 't', acao: 'sim-lancar', nome: 'r3-clinica', id: idSim, acertos: n });
  if (rs.status !== 400) { falha('aceitou ' + n + ' acertos em 100 questões'); break; }
}
if (rs.status === 400) ok('acerto maior que o total, ou negativo, é recusado');

/* Apagar um simulado apaga o resultado de todo mundo: só quem criou a
   sala pode. */
como('bia@email.com', 'uid-bia');
rs = await pedir({ token: 't', acao: 'sim-apagar', nome: 'r3-clinica', id: idSim });
if (rs.status === 403) ok('quem não criou a sala não apaga simulado dos outros');
else falha('apagar sem ser dono: ' + JSON.stringify(rs));

como('dani@email.com', 'uid-dani');
rs = await pedir({ token: 't', acao: 'sim-listar', nome: 'r3-clinica' });
if (rs.status === 403) ok('quem não está na sala não vê os simulados dela');
else falha('simulados sem ser membro: ' + JSON.stringify(rs));

como('ana@email.com', 'uid-ana');
rs = await pedir({ token: 't', acao: 'sim-apagar', nome: 'r3-clinica', id: idSim });
if (rs.corpo.ok) ok('quem criou a sala apaga o simulado');
else falha('apagar sendo dono: ' + JSON.stringify(rs));

/* ── sala de treino é outro mundo ────────────────────────────────────
   Quem estuda com você não é necessariamente quem treina com você. As
   duas famílias vivem em coleções separadas, e o teste cobra isso pelos
   dois lados: o nome pode se repetir, e uma lista nunca traz a outra. */
como('ana@email.com', 'uid-ana');

let rt = await pedir({ token: 't', acao: 'criar', tipo: 'treino', nome: 'r3 clinica', senha: 'segredo1' });
if (rt.corpo.ok) ok('dá para criar uma sala de treino com o mesmo nome de uma de estudo');
else falha('criar sala de treino: ' + JSON.stringify(rt));

rt = await pedir({ token: 't', acao: 'minhas' });
const soEstudo = (rt.corpo.salas || []).length;
rt = await pedir({ token: 't', acao: 'minhas', tipo: 'treino' });
const soTreino = (rt.corpo.salas || []).length;
if (soEstudo === 1 && soTreino === 1) ok('cada lista traz só as salas da sua família');
else falha(`as listas se misturaram: estudo ${soEstudo}, treino ${soTreino}`);

/* Postar no mural de treino não pode encostar na sala de estudo de mesmo
   nome, e o recado do estudo não pode aparecer na sala de treino. */
rt = await pedir({
  token: 't', acao: 'treino-postar', tipo: 'treino', nome: 'r3-clinica',
  treino: 'Pernas', minutos: 40, series: 12, volume: 5000,
});
if (rt.corpo.ok) ok('dá para postar treino na sala de treino');
else falha('postar na sala de treino: ' + JSON.stringify(rt));

rt = await pedir({ token: 't', acao: 'treino-mural', nome: 'r3-clinica' });
const noEstudo = (rt.corpo.mural || []).length;
rt = await pedir({ token: 't', acao: 'treino-mural', tipo: 'treino', nome: 'r3-clinica' });
const noTreino = (rt.corpo.mural || []).length;
if (noTreino === 1 && noEstudo === 0) ok('o mural da academia não aparece na sala de estudo de mesmo nome');
else falha(`os murais se misturaram: estudo ${noEstudo}, treino ${noTreino}`);

/* E quem entrou só no estudo não é membro do treino. */
como('bia@email.com', 'uid-bia');
rt = await pedir({ token: 't', acao: 'treino-mural', tipo: 'treino', nome: 'r3-clinica' });
if (rt.status === 403) ok('estar na sala de estudo não dá acesso à sala de treino de mesmo nome');
else falha('vazou entre as famílias: ' + JSON.stringify(rt));
como('ana@email.com', 'uid-ana');

/* ── competição de treino ───────────────────────────────────────────── */
como('ana@email.com', 'uid-ana');

r = await pedir({
  token: 't', acao: 'treino-postar', nome: 'r3-clinica',
  treino: 'Costas e bíceps', minutos: 54, series: 18, volume: 9200,
  texto: 'puxada pesada hoje', foto: 'Zm90bw==',
});
if (r.corpo.ok && r.corpo.treino.id) ok('dá para postar um treino na sala');
else falha('postar treino: ' + JSON.stringify(r));
const idPostado = r.corpo.treino.id;
if (r.corpo.treino.nome !== 'Fulano') ok('quem postou é dito pelo perfil, não pelo pedido');

r = await pedir({ token: 't', acao: 'treino-mural', nome: 'r3-clinica' });
if ((r.corpo.mural || []).length === 1 && r.corpo.mural[0].series === 18) ok('o treino postado aparece no mural');
else falha('mural: ' + JSON.stringify(r.corpo.mural));

/* A lista é o que abre primeiro, num celular no 4G da academia: ela não
   pode trazer as fotos junto. */
if (r.corpo.mural[0].foto === undefined && r.corpo.mural[0].temFoto === true) {
  ok('o mural diz que tem foto, mas não desce a foto junto');
} else falha('o mural veio com a foto dentro: ' + Object.keys(r.corpo.mural[0]).join(', '));

r = await pedir({ token: 't', acao: 'treino-foto', nome: 'r3-clinica', id: idPostado });
if (r.corpo.foto === 'Zm90bw==') ok('a foto desce sozinha, quando alguém abre');
else falha('foto: ' + JSON.stringify(r.corpo));

r = await pedir({ token: 't', acao: 'treino-mural', nome: 'r3-clinica' });
const eu = (r.corpo.placar || []).find((x) => x.souEu);
if (eu && eu.treinos === 1 && eu.series === 18) ok('o placar conta o treino de quem postou');
else falha('placar: ' + JSON.stringify(r.corpo.placar));
if ((r.corpo.placar || []).every((x) => x.treinos || x.posicao === null)) {
  ok('quem não postou nada fica sem posição, em vez de aparecer em último');
} else falha('posição de quem não postou: ' + JSON.stringify(r.corpo.placar));

/* Número absurdo no pedido não pode virar liderança no placar. */
r = await pedir({
  token: 't', acao: 'treino-postar', nome: 'r3-clinica',
  treino: 'Impossível', minutos: 99999, series: 9999, volume: 99999999,
});
if (r.corpo.treino.minutos <= 600 && r.corpo.treino.series <= 400) ok('tempo e séries absurdos são cortados no possível');
else falha('aceitou número absurdo: ' + JSON.stringify(r.corpo.treino));

/* A foto tem teto: o documento do Firestore não passa de 1 MB, e sem isto
   o mural inteiro deixaria de carregar por causa de um post. */
r = await pedir({
  token: 't', acao: 'treino-postar', nome: 'r3-clinica',
  treino: 'Gigante', foto: 'x'.repeat(800000),
});
if (r.status === 400) ok('foto grande demais é recusada antes de gravar');
else falha('foto gigante: ' + JSON.stringify(r).slice(0, 200));

/* Só quem postou apaga. */
como('bia@email.com', 'uid-bia');
r = await pedir({ token: 't', acao: 'treino-apagar', nome: 'r3-clinica', id: idPostado });
if (r.status === 403) ok('ninguém apaga o treino de outra pessoa');
else falha('apagar de outro: ' + JSON.stringify(r));

como('ana@email.com', 'uid-ana');
r = await pedir({ token: 't', acao: 'treino-apagar', nome: 'r3-clinica', id: idPostado });
if (r.corpo.ok) ok('quem postou apaga o próprio treino');
else falha('apagar o próprio: ' + JSON.stringify(r));
r = await pedir({ token: 't', acao: 'treino-foto', nome: 'r3-clinica', id: idPostado });
if (!r.corpo.foto) ok('apagar o treino leva a foto junto');
else falha('a foto ficou órfã depois de apagar o treino');

como('dani@email.com', 'uid-dani');
r = await pedir({ token: 't', acao: 'treino-mural', nome: 'r3-clinica' });
if (r.status === 403) ok('quem não está na sala não vê o mural de treino');
else falha('mural sem ser membro: ' + JSON.stringify(r));
r = await pedir({ token: 't', acao: 'treino-postar', nome: 'r3-clinica', treino: 'x' });
if (r.status === 403) ok('quem não está na sala não posta treino nela');
else falha('postar sem ser membro: ' + JSON.stringify(r));

/* ── e a sala de simulado é a terceira família ───────────────────────
   Quem faz os mesmos simulados que você costuma ser quem faz o mesmo
   cursinho, e não necessariamente quem estuda ou treina com você. */
como('ana@email.com', 'uid-ana');

let rf = await pedir({ token: 't', acao: 'criar', tipo: 'simulado', nome: 'r3 clinica', senha: 'segredo1' });
if (rf.corpo.ok) ok('a sala de simulado pode ter o mesmo nome das outras duas');
else falha('criar sala de simulado: ' + JSON.stringify(rf));

const quantas = async (tipo) => {
  const r = await pedir({ token: 't', acao: 'minhas', ...(tipo ? { tipo } : {}) });
  return (r.corpo.salas || []).length;
};
if (await quantas() === 1 && await quantas('treino') === 1 && await quantas('simulado') === 1) {
  ok('as três listas de sala não se misturam');
} else falha('as listas se misturaram entre as três famílias');

/* O simulado criado na sala de simulado não aparece na sala de estudo. */
rf = await pedir({ token: 't', acao: 'sim-criar', tipo: 'simulado', nome: 'r3-clinica', titulo: 'Prova SUS', total: 50 });
if (rf.corpo.ok) ok('dá para criar simulado na sala de simulado');
else falha('criar simulado na família certa: ' + JSON.stringify(rf));

rf = await pedir({ token: 't', acao: 'sim-listar', nome: 'r3-clinica' });
const noEstudoSim = (rf.corpo.simulados || []).length;
rf = await pedir({ token: 't', acao: 'sim-listar', tipo: 'simulado', nome: 'r3-clinica' });
const naFamiliaSim = (rf.corpo.simulados || []).length;
if (naFamiliaSim === 1 && noEstudoSim === 0) ok('o simulado fica na sala de simulado, e não vaza para a de estudo');
else falha(`vazou entre famílias: estudo ${noEstudoSim}, simulado ${naFamiliaSim}`);

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
/* No Firestore o que está pendurado num documento sobrevive a ele: sem
   apagar aqui, a conversa antiga apareceria para a próxima sala de mesmo
   nome, criada por outras pessoas. */
if (!RECADOS['r3-clinica']) ok('encerrar a sala apaga a conversa junto');
else falha('a conversa sobreviveu à sala');

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
