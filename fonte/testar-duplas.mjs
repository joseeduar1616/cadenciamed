/* Testa as duplas e o duelo sem tocar no Firebase de verdade.
 *
 * Roda contra worker/api/duplas.js, com identidade e Firestore
 * respondidos aqui mesmo, em memória.
 *
 * O que mais importa neste arquivo não é o caminho feliz: é o gabarito
 * não vazar. Num duelo ao vivo, a resposta certa chegando ao navegador
 * antes da hora acaba com a graça e ninguém percebe de fora — basta abrir
 * a aba de rede.
 *
 *   node testar-duplas.mjs
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

let QUEM = { email: 'ana@email.com', localId: 'uid-ana' };
const como = (email, uid) => { QUEM = { email, localId: uid }; };

const DOCS = {};                       // "colecao/id" → { fields }
const EMAILS = {                       // e-mail → uid, como a coleção "emails"
  'ana@email.com': 'uid-ana',
  'bia@email.com': 'uid-bia',
  'caio@email.com': 'uid-caio',
};
const PERFIS = {
  'uid-ana': { nome: { stringValue: 'Ana' } },
  'uid-bia': { nome: { stringValue: 'Bia' } },
  'uid-caio': { nome: { stringValue: 'Caio' } },
};

const json = (corpo, status = 200) => new Response(JSON.stringify(corpo),
  { status, headers: { 'Content-Type': 'application/json' } });

const fetchReal = globalThis.fetch;
globalThis.fetch = async (url, opcoes = {}) => {
  const u = String(url);
  if (u.includes('identitytoolkit.googleapis.com')) {
    return json(QUEM ? { users: [QUEM] } : { users: [] }, QUEM ? 200 : 400);
  }
  if (u.includes('oauth2.googleapis.com/token')) return json({ access_token: 'token-falso' });

  if (u.includes(':runQuery')) {
    const corpo = JSON.parse(opcoes.body);
    const col = corpo.structuredQuery.from[0].collectionId;
    const f = corpo.structuredQuery.where.fieldFilter;
    if (col === 'emails') {
      const uid = EMAILS[f.value.stringValue];
      return json(uid ? [{ document: { name: 'p/documents/emails/' + uid, fields: {} } }] : [{ readTime: 'a' }]);
    }
    if (col === 'duplas') {
      const achadas = Object.entries(DOCS)
        .filter(([k]) => k.startsWith('duplas/'))
        .filter(([, doc]) => (doc.fields.gente.arrayValue.values || [])
          .some((v) => v.stringValue === f.value.stringValue))
        .map(([k, doc]) => ({ document: { name: 'p/documents/' + k, fields: doc.fields } }));
      return json(achadas.length ? achadas : [{ readTime: 'a' }]);
    }
    return json([{ readTime: 'a' }]);
  }

  if (u.includes(':batchGet')) {
    const corpo = JSON.parse(opcoes.body);
    return json(corpo.documents.map((caminho) => {
      const uid = caminho.split('/').pop();
      return PERFIS[uid] ? { found: { name: caminho, fields: PERFIS[uid] } } : { missing: caminho };
    }));
  }

  const m = /\/documents\/([^?]+)(?:\?|$)/.exec(u);
  if (m) {
    const chave = m[1];
    const metodo = opcoes.method || 'GET';
    if (metodo === 'GET') return DOCS[chave] ? json(DOCS[chave]) : json({ error: {} }, 404);
    if (metodo === 'DELETE') { delete DOCS[chave]; return json({}); }
    DOCS[chave] = JSON.parse(opcoes.body);
    return json({ name: chave });
  }
  return fetchReal(url, opcoes);
};

const env = {
  FIREBASE_API_KEY: 'chave',
  FIREBASE_SERVICE_ACCOUNT: JSON.stringify(CONTA),
};
const carregar = async () => (await import('../worker/api/duplas.js?v=' + Math.random())).onRequest;
const pedir = async (corpo, metodo) => {
  const fn = await carregar();
  const req = new Request('http://local/api/duplas', {
    method: metodo || 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: metodo === 'GET' ? undefined : JSON.stringify(corpo),
  });
  const res = await fn({ request: req, env });
  return { status: res.status, corpo: await res.json().catch(() => ({})) };
};

/* ── convidar e aceitar ──────────────────────────────────────────────── */
let r = await pedir({ token: 't', acao: 'convidar', email: 'bia@email.com' });
if (r.corpo.ok) ok('dá para convidar alguém pelo e-mail');
else falha('convidar: ' + JSON.stringify(r));

/* Convite não pode virar amizade sozinho: quem foi chamado tem de aceitar. */
r = await pedir({ token: 't', acao: 'listar' });
let minha = (r.corpo.duplas || [])[0];
if (minha && minha.aceita === false && minha.euConvidei) ok('o convite fica esperando, não vira amizade sozinho');
else falha('estado do convite: ' + JSON.stringify(minha));

r = await pedir({ token: 't', acao: 'aceitar', id: minha.id });
if (r.status === 403) ok('quem convidou não aceita o próprio convite');
else falha('aceitou o próprio convite: ' + JSON.stringify(r));

/* E-mail que não tem conta responde igual a e-mail que tem: senão esta
   rota vira um jeito de descobrir quem usa o site. */
const antes = JSON.stringify(r.corpo);
r = await pedir({ token: 't', acao: 'convidar', email: 'ninguem@email.com' });
if (r.corpo.ok && !/não achei|não existe/i.test(JSON.stringify(r.corpo))) {
  ok('e-mail sem conta responde igual, sem contar quem tem conta no site');
} else falha('a resposta entrega se o e-mail tem conta: ' + JSON.stringify(r.corpo));

r = await pedir({ token: 't', acao: 'convidar', email: 'ana@email.com' });
if (r.status === 400) ok('não dá para convidar a si mesmo');
else falha('convidou a si mesmo: ' + JSON.stringify(r));

como('bia@email.com', 'uid-bia');
r = await pedir({ token: 't', acao: 'listar' });
const paraBia = (r.corpo.duplas || [])[0];
if (paraBia && !paraBia.euConvidei) ok('o convite aparece para quem foi chamado');
else falha('o convite não chegou: ' + JSON.stringify(r.corpo.duplas));

r = await pedir({ token: 't', acao: 'aceitar', id: paraBia.id });
if (r.corpo.ok) ok('quem foi chamado aceita');
else falha('aceitar: ' + JSON.stringify(r));

como('caio@email.com', 'uid-caio');
r = await pedir({ token: 't', acao: 'focar', id: paraBia.id, minutos: 25 });
if (r.status === 403) ok('quem não é da dupla não mexe nela');
else falha('mexeu na dupla dos outros: ' + JSON.stringify(r));

/* ── foco em dupla ───────────────────────────────────────────────────── */
como('ana@email.com', 'uid-ana');
r = await pedir({ token: 't', acao: 'focar', id: paraBia.id, minutos: 50 });
if (r.corpo.ok && r.corpo.foco && r.corpo.foco.restaSeg > 0) ok('dá para combinar um foco com a dupla');
else falha('focar: ' + JSON.stringify(r));

for (const m of [1, 4, 721, 99999]) {
  r = await pedir({ token: 't', acao: 'focar', id: paraBia.id, minutos: m });
  if (r.status !== 400) { falha('aceitou foco de ' + m + ' min'); break; }
}
if (r.status === 400) ok('foco curto ou longo demais é recusado');

/* ── duelo ───────────────────────────────────────────────────────────── */
const QUESTOES = [
  { enunciado: 'Q1?', alternativas: ['a', 'b', 'c', 'd'], certa: 2, porque: 'porque sim' },
  { enunciado: 'Q2?', alternativas: ['a', 'b', 'c', 'd'], certa: 0, porque: 'porque não' },
];

r = await pedir({ token: 't', acao: 'duelo-criar', id: paraBia.id, segundos: 10, questoes: QUESTOES });
if (r.status === 400) ok('tempo por questão fora de 30 a 60 segundos é recusado');
else falha('aceitou tempo fora da faixa: ' + JSON.stringify(r));

r = await pedir({ token: 't', acao: 'duelo-criar', id: paraBia.id, segundos: 45, tema: 'Nefro', questoes: QUESTOES });
if (r.corpo.ok) ok('dá para criar um duelo');
else falha('duelo-criar: ' + JSON.stringify(r));

/* ── o relógio não anda antes das duas entrarem ───────────────────────
   Antes ele começava na criação: quem criou respondia sozinho, com o
   tempo correndo, enquanto a outra pessoa nem sabia que havia duelo. */
r = await pedir({ token: 't', acao: 'duelo-estado', id: paraBia.id });
let duelo = r.corpo.duelo;
if (duelo && duelo.esperando) ok('recém-criado, o duelo fica esperando');
else falha('o duelo começou sozinho: ' + JSON.stringify(duelo));
if (duelo.questao === null) ok('e não mostra questão nenhuma enquanto espera');
else falha('mostrou questão antes de as duas entrarem');
if (duelo.euAceitei && duelo.faltam.indexOf('Bia') >= 0) ok('quem criou já está pronto, e a tela diz quem falta');
else falha('quem falta saiu ' + JSON.stringify(duelo.faltam));

/* A outra pessoa tem de VER que existe duelo esperando por ela. */
como('bia@email.com', 'uid-bia');
r = await pedir({ token: 't', acao: 'listar' });
const naLista = (r.corpo.duplas || [])[0];
if (naLista && naLista.duelo && naLista.duelo.esperando && !naLista.duelo.euAceitei) {
  ok('o duelo esperando aparece na lista da outra pessoa');
} else falha('a outra pessoa não vê o duelo: ' + JSON.stringify(naLista && naLista.duelo));
/* A marca identifica ESTE duelo. Sem ela, a dupla tem um id só e o aviso
   "fulano chamou você" tocaria uma vez na vida, nunca no segundo duelo. */
if (naLista && naLista.duelo && /^.+:\d{10,}$/.test(naLista.duelo.marca || '')) {
  ok('o duelo vem com marca própria, para o aviso tocar de novo no próximo');
} else falha('o duelo veio sem marca: ' + JSON.stringify(naLista && naLista.duelo && naLista.duelo.marca));

r = await pedir({ token: 't', acao: 'duelo-aceitar', id: paraBia.id });
if (r.corpo.ok && r.corpo.comecou) ok('quando a segunda entra, o relógio começa');
else falha('aceitar o duelo: ' + JSON.stringify(r));

como('ana@email.com', 'uid-ana');
r = await pedir({ token: 't', acao: 'duelo-estado', id: paraBia.id });
duelo = r.corpo.duelo;
if (duelo && !duelo.esperando && duelo.total === 2 && duelo.indice === 0) ok('o duelo começa na primeira questão');
else falha('estado do duelo: ' + JSON.stringify(duelo));

/* A REGRA: o gabarito não pode estar em lugar nenhum da resposta enquanto
   a questão está aberta. */
const cru = JSON.stringify(r.corpo);
if (duelo.questao && duelo.questao.certa === undefined) ok('a questão aberta desce sem o gabarito');
else falha('o gabarito veio junto da questão aberta');
if (!/porque sim/.test(cru)) ok('nem a explicação da resposta viaja antes da hora');
else falha('a explicação da resposta certa veio antes de a questão fechar');
if (duelo.gabarito === null) ok('o gabarito inteiro só existe no fim');
else falha('o gabarito inteiro desceu no meio do duelo');

/* Responder vale uma vez, e só a questão aberta agora. */
r = await pedir({ token: 't', acao: 'duelo-responder', id: paraBia.id, n: 0, escolha: 2 });
if (r.corpo.duelo && r.corpo.duelo.minhas[0] === 2) ok('a resposta é registrada');
else falha('responder: ' + JSON.stringify(r.corpo.duelo && r.corpo.duelo.minhas));

r = await pedir({ token: 't', acao: 'duelo-responder', id: paraBia.id, n: 0, escolha: 3 });
if (r.corpo.duelo.minhas[0] === 2) ok('responder de novo não troca a resposta já dada');
else falha('a resposta foi trocada na segunda tentativa');

r = await pedir({ token: 't', acao: 'duelo-responder', id: paraBia.id, n: 1, escolha: 0 });
if (r.status === 409) ok('não dá para responder uma questão que ainda não abriu');
else falha('respondeu fora da vez: ' + JSON.stringify(r));

/* Os dois responderam: não há mais nada acontecendo nesta questão, e o
   duelo não deve ficar parado esperando o relógio acabar. */
r = await pedir({ token: 't', acao: 'duelo-estado', id: paraBia.id });
if (r.corpo.duelo.indice === 0) ok('com só uma resposta, a questão continua aberta');
else falha('pulou com uma resposta só: ' + JSON.stringify(r.corpo.duelo.indice));

como('bia@email.com', 'uid-bia');
r = await pedir({ token: 't', acao: 'duelo-responder', id: paraBia.id, n: 0, escolha: 1 });
if (r.corpo.duelo.indice === 1) ok('quando os dois respondem, o duelo pula para a próxima na hora');
else falha('não pulou depois da segunda resposta: ' + JSON.stringify(r.corpo.duelo.indice));
if (r.corpo.duelo.questao && r.corpo.duelo.questao.n === 2) ok('e a questão que desce já é a seguinte');
else falha('a questão não avançou: ' + JSON.stringify(r.corpo.duelo.questao));

/* Quem pulou não perdeu a resposta, e o placar continua contando as duas. */
if (r.corpo.duelo.minhas[0] === 1) ok('a resposta que fechou a questão fica registrada');
else falha('a resposta sumiu no pulo: ' + JSON.stringify(r.corpo.duelo.minhas));
const placar = r.corpo.duelo.placar || [];
if (placar.length === 2 && placar.every((x) => x.respondidas === 1)) ok('as duas respostas da questão pulada contam no placar');
else falha('placar depois do pulo: ' + JSON.stringify(placar));

/* E a questão pulada fechou de verdade: ninguém responde ela depois. */
como('ana@email.com', 'uid-ana');
r = await pedir({ token: 't', acao: 'duelo-responder', id: paraBia.id, n: 0, escolha: 3 });
if (r.status === 409) ok('questão pulada não aceita mais resposta');
else falha('respondeu uma questão já pulada: ' + JSON.stringify(r.status));

/* Empurra o relógio para o fim e confere o que aparece então. */
DOCS['duelos/' + paraBia.id].fields.comecouEm = { doubleValue: Date.now() - 200000 };
r = await pedir({ token: 't', acao: 'duelo-estado', id: paraBia.id });
duelo = r.corpo.duelo;
if (duelo.acabou) ok('o duelo acaba sozinho quando o tempo das questões termina');
else falha('o duelo não acabou: ' + JSON.stringify(duelo));
if (duelo.gabarito && duelo.gabarito.length === 2 && duelo.gabarito[0].certa === 2) {
  ok('no fim o gabarito aparece, com a resposta certa de cada questão');
} else falha('o gabarito do fim saiu ' + JSON.stringify(duelo.gabarito));
if (duelo.gabarito[0].porque === 'porque sim') ok('e a explicação de cada questão vem junto');
else falha('a explicação não veio no fim');

const eu = duelo.placar.find((x) => x.uid === 'uid-ana');
if (eu && eu.acertos === 1) ok('o placar conta o acerto de quem respondeu');
else falha('placar: ' + JSON.stringify(duelo.placar));

r = await pedir({ token: 't', acao: 'duelo-responder', id: paraBia.id, n: 1, escolha: 0 });
if (r.status === 409) ok('acabado o duelo, ninguém responde mais nada');
else falha('respondeu depois de acabar: ' + JSON.stringify(r));

/* ── figuras na questão ──────────────────────────────────────────────
   Uma prova de imagem só funciona se a figura chegar na outra pessoa: o
   material foi lido no aparelho de quem enviou. */
const FIG = 'data:image/jpeg;base64,' + 'A'.repeat(200);
como('ana@email.com', 'uid-ana');
r = await pedir({
  token: 't', acao: 'duelo-criar', id: paraBia.id, segundos: 45, tema: 'ECG',
  questoes: [
    { enunciado: 'Que ritmo?', alternativas: ['a', 'b', 'c', 'd'], certa: 1, porque: 'traçado', imagem: 'ecg-1.jpg' },
    { enunciado: 'E este?', alternativas: ['a', 'b', 'c', 'd'], certa: 0, porque: 'x', imagem: 'nao-mandei.jpg' },
  ],
  figuras: [{ nome: 'ecg-1.jpg', dataUri: FIG }],
});
if (r.corpo.ok) ok('duelo com figura é criado');
else falha('criar com figura: ' + JSON.stringify(r));
if (DOCS['duelos/' + paraBia.id + '/figuras/ecg-1.jpg']) ok('a figura fica guardada fora do documento do duelo');
else falha('a figura não foi guardada em documento próprio');

como('bia@email.com', 'uid-bia');
await pedir({ token: 't', acao: 'duelo-aceitar', id: paraBia.id });
como('ana@email.com', 'uid-ana');

r = await pedir({ token: 't', acao: 'duelo-estado', id: paraBia.id });
const q0 = r.corpo.duelo.questao;
if (q0 && q0.imagem === 'ecg-1.jpg') ok('a questão desce com o NOME da figura');
else falha('nome da figura na questão: ' + JSON.stringify(q0));
if (!JSON.stringify(r.corpo).includes(FIG)) ok('os bytes da figura não viajam junto do estado');
else falha('a figura inteira desceu junto do estado do duelo');

/* Questão que cita figura que não chegou: perde a figura, mantém a
   questão. Pior seria um enunciado falando de uma imagem invisível. */
const guardado = DOCS['duelos/' + paraBia.id].fields.questoes.arrayValue.values[1].mapValue.fields;
if ((guardado.imagem.stringValue || '') === '') ok('questão que cita figura que não chegou fica sem figura');
else falha('ficou apontando para figura inexistente: ' + JSON.stringify(guardado.imagem));

r = await pedir({ token: 't', acao: 'duelo-figura', id: paraBia.id, nome: 'ecg-1.jpg' });
if (r.corpo.dataUri === FIG) ok('quem está no duelo baixa a figura');
else falha('duelo-figura: ' + JSON.stringify(r.status));

/* O nome vem do pedido: sem a conferência, viraria um jeito de ler
   qualquer documento pendurado no duelo. */
r = await pedir({ token: 't', acao: 'duelo-figura', id: paraBia.id, nome: 'nao-mandei.jpg' });
if (r.status === 404) ok('figura que nenhuma questão cita não desce');
else falha('baixou figura que não é do duelo: ' + JSON.stringify(r.status));

como('caio@email.com', 'uid-caio');
r = await pedir({ token: 't', acao: 'duelo-figura', id: paraBia.id, nome: 'ecg-1.jpg' });
if (r.status === 403) ok('quem não está no duelo não baixa a figura');
else falha('estranho baixou a figura: ' + JSON.stringify(r.status));

como('ana@email.com', 'uid-ana');
r = await pedir({ token: 't', acao: 'duelo-apagar', id: paraBia.id });
if (!DOCS['duelos/' + paraBia.id + '/figuras/ecg-1.jpg']) ok('apagar o duelo leva as figuras junto');
else falha('a figura sobreviveu ao duelo apagado');

/* Sobra um duelo de pé para a última conferência, que é sobre quem pode
   olhar o duelo dos outros. */
await pedir({ token: 't', acao: 'duelo-criar', id: paraBia.id, segundos: 45, tema: 'Nefro', questoes: QUESTOES });

como('caio@email.com', 'uid-caio');
r = await pedir({ token: 't', acao: 'duelo-estado', id: paraBia.id });
if (r.status === 403) ok('quem não está no duelo não vê o duelo');
else falha('duelo de fora: ' + JSON.stringify(r));

/* ── sem conta, nada ─────────────────────────────────────────────────── */
QUEM = null;
r = await pedir({ token: 't', acao: 'listar' });
if (r.status === 401) ok('sem sessão válida, a rota recusa');
else falha('sem sessão: ' + JSON.stringify(r));
QUEM = { email: 'ana@email.com', localId: 'uid-ana' };

r = await pedir({}, 'GET');
if (r.status === 405) ok('só aceita POST');
else falha('método: ' + JSON.stringify(r));

console.log(passos.join('\n'));
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
