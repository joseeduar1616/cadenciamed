/* Testa as provas publicadas por código, sem tocar no Firebase.
 *
 * Roda contra o arquivo que vai para o ar (worker/api/provas.js). O que
 * mais importa aqui é quem pode o quê: publicar é só do dono, e o CÓDIGO é
 * a chave — quem o tem entra, quem não tem não deve conseguir descobrir
 * nada, nem adivinhando, nem listando, nem escrevendo um código torto.
 *
 *   node testar-provas.mjs
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
let BANCO = {};        // caminho -> { fields }
let TOCADOS = [];      // todo endereço que o módulo tentou ler ou escrever

const json = (corpo, status = 200) => new Response(JSON.stringify(corpo),
  { status, headers: { 'Content-Type': 'application/json' } });

globalThis.fetch = async (url, opcoes = {}) => {
  /* O fetch de verdade normaliza o ".." do endereço antes de sair. Sem
     fazer o mesmo aqui, o teste de fuga passaria com a trava removida: o
     banco de mentira veria "provas/..%2F.." e nunca o "usuarios/alguem"
     que a chamada de verdade atingiria. */
  const u = new URL(String(url)).href;
  if (u.includes('identitytoolkit.googleapis.com')) {
    return QUEM ? json({ users: [QUEM] }) : json({ error: {} }, 400);
  }
  if (u.includes('oauth2.googleapis.com/token')) return json({ access_token: 'token-falso' });

  const m = /\/documents\/(.+?)(\?|$)/.exec(u);
  const caminho = m ? decodeURIComponent(m[1]) : '';
  TOCADOS.push(caminho);

  /* a listagem da coleção */
  if (caminho === 'provas') {
    return json({
      documents: Object.entries(BANCO)
        .filter(([k]) => /^provas\/[^/]+$/.test(k))
        .map(([k, doc]) => ({ name: 'p/documents/' + k, fields: doc.fields })),
    });
  }

  const metodo = opcoes.method || 'GET';
  if (metodo === 'GET') return BANCO[caminho] ? json(BANCO[caminho]) : json({}, 404);
  if (metodo === 'DELETE') { delete BANCO[caminho]; return json({}); }
  BANCO[caminho] = JSON.parse(opcoes.body);
  return json({ name: caminho });
};

const env = { FIREBASE_API_KEY: 'chave', FIREBASE_SERVICE_ACCOUNT: JSON.stringify(CONTA) };
const mod = await import('../worker/api/provas.js');

const pedir = async (corpo, metodo = 'POST') => {
  TOCADOS = [];
  const res = await mod.onRequest({
    request: new Request('http://local/api/provas', {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      ...(metodo === 'POST' ? { body: JSON.stringify(corpo) } : {}),
    }),
    env,
  });
  return { status: res.status, corpo: await res.json() };
};

const como = (email, uid) => { QUEM = { email, localId: uid }; };

const questao = (n, extra) => ({
  numero: n,
  assunto: 'Insuficiência cardíaca',
  enunciado: `Questão ${n}: paciente com dispneia aos esforços e edema. Qual a conduta?`,
  alternativas: ['Diurético', 'Antibiótico', 'Corticoide', 'Nada'],
  certa: 0,
  comentarios: ['alivia a congestão', 'não há infecção', 'não é inflamatório', 'piora'],
  fonte: 'Diretriz brasileira', seguranca: 'alta', avisos: '',
  ...extra,
});

/* ── 1. o dono publica ────────────────────────────────────────────────── */
let r = await pedir({
  token: 't', acao: 'publicar', codigo: 'provoes71',
  prova: 'Provões 71', descricao: 'seleção de clínica',
  questoes: [questao(1), questao(2), questao(3)],
});
if (r.corpo.ok && r.corpo.questoes === 3) ok('o dono publica uma prova com o código que ele escolheu');
else falha('publicar: ' + JSON.stringify(r));

/* ── 2. qualquer pessoa logada resgata com o código ───────────────────── */
como('ana@email.com', 'uid-ana');
r = await pedir({ token: 't', acao: 'resgatar', codigo: 'provoes71' });
if (r.corpo.ok && (r.corpo.questoes || []).length === 3) ok('quem tem o código recebe a prova inteira');
else falha('resgatar: ' + JSON.stringify(r).slice(0, 200));
if (r.corpo.prova === 'Provões 71') ok('com o nome da prova junto');
else falha('nome da prova: ' + JSON.stringify(r.corpo.prova));
if ((r.corpo.questoes[0].comentarios || []).length === 4) ok('e com o comentário de todas as alternativas');
else falha('veio sem os comentários');

/* O código é a chave, então ele não pode depender de como foi digitado. */
for (const jeito of ['PROVOES71', 'Provões 71', ' provões-71 ']) {
  r = await pedir({ token: 't', acao: 'resgatar', codigo: jeito });
  if (!r.corpo.ok) { falha(`"${jeito}" não achou a prova`); break; }
}
if (r.corpo.ok) ok('maiúscula, acento e espaço no código levam à mesma prova');

/* ── 3. sem o código não se chega a lugar nenhum ──────────────────────── */
r = await pedir({ token: 't', acao: 'resgatar', codigo: 'provoes72' });
if (r.status === 404) ok('código errado não devolve nada');
else falha('código errado: ' + JSON.stringify(r));

r = await pedir({ token: 't', acao: 'listar' });
if (r.status === 403) ok('quem não é dono não lista as provas: descobrir a lista mataria o código');
else falha('listou sem ser dono: ' + JSON.stringify(r).slice(0, 160));

/* ── 4. fuga pelo endereço ────────────────────────────────────────────── */
BANCO['usuarios/uid-dono'] = { fields: { dados: { stringValue: 'segredo de outra pessoa' } } };
r = await pedir({ token: 't', acao: 'resgatar', codigo: '../../usuarios/uid-dono' });
const fugiu = TOCADOS.some((c) => c.includes('usuarios/'));
if (!fugiu && r.status >= 400) ok('código com ".." não vira endereço de outra coleção');
else falha('o endereço escapou da coleção: ' + JSON.stringify(TOCADOS));

/* ── 5. publicar é só do dono ─────────────────────────────────────────── */
r = await pedir({
  token: 't', acao: 'publicar', codigo: 'minhaprova',
  prova: 'x', questoes: [questao(1)],
});
if (r.status === 403) ok('quem não é dono não publica');
else falha('publicou sem ser dono: ' + JSON.stringify(r));

r = await pedir({ token: 't', acao: 'despublicar', codigo: 'provoes71' });
if (r.status === 403) ok('nem despublica');
else falha('despublicou sem ser dono');

/* ── 6. meia questão não entra ────────────────────────────────────────── */
como('joseeduardo1616@gmail.com', 'uid-dono');
r = await pedir({
  token: 't', acao: 'publicar', codigo: 'meia',
  prova: 'Meia', questoes: [
    questao(1),
    questao(2, { comentarios: ['só um comentário'] }),        // falta comentário
    questao(3, { certa: 9 }),                                  // gabarito fora da lista
    questao(4, { alternativas: ['uma só'] }),                  // sem alternativas
    questao(5, { enunciado: '' }),                             // sem enunciado
  ],
});
if (r.corpo.questoes === 1 && r.corpo.descartadas === 4) ok('questão pela metade é descartada, não publicada capenga');
else falha('limpeza: ' + JSON.stringify(r.corpo));

/* ── 7. prova grande vai em pedaços ───────────────────────────────────── */
const muitas = Array.from({ length: 45 }, (_, i) => questao(i + 1));
r = await pedir({ token: 't', acao: 'publicar', codigo: 'grande', prova: 'Grande', questoes: muitas });
if (r.corpo.questoes === 45) ok('prova de 45 questões é publicada inteira');
else falha('prova grande: ' + JSON.stringify(r.corpo));
const pedacos = Object.keys(BANCO).filter((k) => k.startsWith('provas/grande/questoes/'));
if (pedacos.length === 3) ok('e fica dividida em pedaços, para caber no limite do Firestore');
else falha('pedaços: ' + pedacos.length);

como('ana@email.com', 'uid-ana');
r = await pedir({ token: 't', acao: 'resgatar', codigo: 'grande' });
if ((r.corpo.questoes || []).length === 45) ok('e volta inteira, remontada dos pedaços');
else falha('remontagem: ' + (r.corpo.questoes || []).length);

/* ── 8. republicar menor não deixa sobra da maior ─────────────────────── */
como('joseeduardo1616@gmail.com', 'uid-dono');
await pedir({ token: 't', acao: 'publicar', codigo: 'grande', prova: 'Grande', questoes: muitas.slice(0, 5) });
como('ana@email.com', 'uid-ana');
r = await pedir({ token: 't', acao: 'resgatar', codigo: 'grande' });
if ((r.corpo.questoes || []).length === 5) ok('republicar menor apaga o que sobrava da versão maior');
else falha('sobrou questão velha: ' + (r.corpo.questoes || []).length);

/* ── 9. despublicar ───────────────────────────────────────────────────── */
como('joseeduardo1616@gmail.com', 'uid-dono');
r = await pedir({ token: 't', acao: 'despublicar', codigo: 'grande' });
como('ana@email.com', 'uid-ana');
r = await pedir({ token: 't', acao: 'resgatar', codigo: 'grande' });
if (r.status === 404) ok('prova despublicada some para quem tinha o código');
else falha('despublicada continuou aparecendo');

/* ── 10. recusas gerais ───────────────────────────────────────────────── */
QUEM = null;
r = await pedir({ token: 'velho', acao: 'resgatar', codigo: 'provoes71' });
if (r.status === 403) ok('sem sessão válida, não responde');
else falha('sessão inválida: ' + JSON.stringify(r));
como('ana@email.com', 'uid-ana');

r = await pedir({}, 'GET');
if (r.status === 405) ok('só aceita POST');
else falha('método: ' + JSON.stringify(r));

r = await pedir({ token: 't', acao: 'inventada' });
if (r.status === 400 || r.status === 403) ok('ação desconhecida é recusada');
else falha('ação inventada: ' + JSON.stringify(r));

console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
