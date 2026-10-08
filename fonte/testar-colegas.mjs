/* Colegas da mesma faculdade, na rota das duplas.
 *
 * Roda contra worker/api/duplas.js, com identidade e Firestore
 * respondidos aqui mesmo, em memória.
 *
 * (Base copiada de testar-duplas.mjs.)
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
    if (col === 'perfis') {
      const achadas = Object.entries(DOCS)
        .filter(([k]) => k.startsWith('perfis/'))
        .filter(([, doc]) => (doc.fields.faculdade || {}).stringValue === f.value.stringValue)
        .map(([k, doc]) => ({ document: { name: 'p/documents/' + k, fields: doc.fields } }));
      return json(achadas.length ? achadas : [{ readTime: 'a' }]);
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


const perfil = (uid, nome, faculdade, mostrar, esp = []) => {
  DOCS['perfis/' + uid] = { fields: {
    nome: { stringValue: nome }, faculdade: { stringValue: faculdade },
    mostrarFaculdade: { booleanValue: mostrar },
    especialidades: { arrayValue: { values: esp.map((e) => ({ stringValue: e })) } },
  } };
};
perfil('uid-ana', 'Ana', 'ufg-go', true, ['Cardiologia', 'Pediatria']);
perfil('uid-bia', 'Bia', 'ufg-go', true, ['Psiquiatria']);
perfil('uid-caio', 'Caio', 'ufg-go', true, ['Cardiologia']);
perfil('uid-duda', 'Duda', 'ufg-go', false, ['Pediatria']);     // não quis aparecer
perfil('uid-eva', 'Eva', '', false, []);                         // desligou: grava vazio
perfil('uid-fabi', 'Fabi', 'unb-df', true, ['Cardiologia']);    // outra faculdade

let r = await pedir({ token: 't', acao: 'colegas' });
const nomes = (r.corpo.colegas || []).map((c) => c.nome);
if (nomes.join(',') === 'Caio,Bia') ok('acha os colegas da mesma faculdade, quem quer a mesma especialidade primeiro');
else falha('colegas: ' + JSON.stringify(r.corpo));
if (!nomes.includes('Duda') && !nomes.includes('Fabi') && !nomes.includes('Ana')) ok('não mostra quem não quis aparecer, quem é de outra faculdade, nem a própria pessoa');
else falha('vazou gente: ' + nomes);
const caio = (r.corpo.colegas || [])[0] || {};
if (caio.especialidades && caio.especialidades[0] === 'Cardiologia' && !JSON.stringify(r.corpo).includes('@')) ok('volta nome e especialidades, sem e-mail');
else falha('campos do colega: ' + JSON.stringify(caio));

r = await pedir({ token: 't', acao: 'convidar-colega', uid: 'uid-duda' });
if (r.status === 403) ok('não dá para chamar pelo uid quem não escolheu aparecer');
else falha('convidar quem não aparece: ' + JSON.stringify(r));
r = await pedir({ token: 't', acao: 'convidar-colega', uid: 'uid-fabi' });
if (r.status === 403) ok('não dá para chamar pelo uid quem é de outra faculdade');
else falha('convidar de outra faculdade: ' + JSON.stringify(r));
r = await pedir({ token: 't', acao: 'convidar-colega', uid: 'uid-ana' });
if (r.status === 400) ok('não dá para se convidar');
else falha('convidar a si: ' + JSON.stringify(r));

r = await pedir({ token: 't', acao: 'convidar-colega', uid: 'uid-caio' });
if (r.corpo.ok && DOCS['duplas/uid-ana_uid-caio'] && DOCS['duplas/uid-ana_uid-caio'].fields.aceita.booleanValue === false) ok('o colega recebe o convite, que espera ele aceitar');
else falha('convidar colega: ' + JSON.stringify(r));
r = await pedir({ token: 't', acao: 'colegas' });
if ((r.corpo.colegas || []).map((c) => c.nome).join(',') === 'Bia') ok('quem já foi convidado sai da lista');
else falha('lista depois do convite: ' + JSON.stringify(r.corpo));

como('caio@email.com', 'uid-caio');
r = await pedir({ token: 't', acao: 'listar' });
const conv = (r.corpo.duplas || [])[0];
if (conv && conv.nome === 'Ana' && !conv.euConvidei) ok('o convite aparece para o colega na lista de amigos');
else falha('convite do lado do colega: ' + JSON.stringify(r.corpo));

/* Quem não aparece também não vê: ninguém olha sem ser visto. */
como('duda@email.com', 'uid-duda');
r = await pedir({ token: 't', acao: 'colegas' });
if ((r.corpo.colegas || []).length === 0 && r.corpo.aviso) ok('quem não escolheu aparecer não vê os colegas');
else falha('olhar sem aparecer: ' + JSON.stringify(r.corpo));
r = await pedir({ token: 't', acao: 'convidar-colega', uid: 'uid-bia' });
if (r.status === 403) ok('e também não chama ninguém pelo uid');
else falha('chamar sem aparecer: ' + JSON.stringify(r));

console.log(passos.join('\n'));
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
