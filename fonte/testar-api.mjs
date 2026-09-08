/* Testa como o app acha o servidor das rotas /api.
 *
 * Enquanto as páginas vêm do Firebase Hosting, /api/... não existe naquele
 * endereço: a hospedagem devolve a própria página do site, com status 200.
 * Quem resolve isso é o chamarApi, tentando o Worker em seguida. Era esta a
 * causa do "Não deu certo." no painel de acessos e no cupom.
 *
 * O código testado é cópia automática do parte2.jsx, refeita pelo
 * extrair_leitor.py a cada build, então não há duas versões para divergir.
 *
 *   node testar-api.mjs
 */
const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

const WORKER = 'https://cadenciamed.joseeduardo1616.workers.dev';

const pagina = () => new Response('<!doctype html><html>o site</html>',
  { status: 200, headers: { 'Content-Type': 'text/html' } });
const dados = (corpo, status = 200) => new Response(JSON.stringify(corpo),
  { status, headers: { 'Content-Type': 'application/json' } });

/* Cada teste começa com o módulo zerado: o chamarApi guarda qual endereço
   respondeu, e essa memória atravessaria de um caso para o outro. */
let tentativas = [];
async function novo(origem = 'https://cadenciamed.com.br', config) {
  tentativas = [];
  globalThis.window = { location: { origin: origem } };
  if (config !== undefined) globalThis.window.CADENCIA_API = config;
  return import('./_leitor.mjs?v=' + Math.random());
}

const responder = (mapa) => {
  globalThis.fetch = async (url) => {
    tentativas.push(String(url));
    const f = mapa[String(url)];
    if (!f) throw new TypeError('Failed to fetch');
    return f();
  };
};

/* ── o caso que estava quebrado ──────────────────────────────────────── */
let m = await novo();
responder({
  '/api/acessos': pagina,                                   // Firebase Hosting
  [WORKER + '/api/acessos']: () => dados({ lista: [] }),    // Worker
});
let r = await m.chamarApi('/api/acessos', {}, 'O painel de acessos');
if (r.dados && r.dados.lista) ok('quando o site devolve a página, a chamada é repetida no Worker');
else falha('não caiu no Worker: ' + JSON.stringify(r));
if (tentativas.length === 2 && tentativas[0] === '/api/acessos') ok('tenta primeiro o próprio site, e só então o Worker');
else falha('ordem das tentativas: ' + JSON.stringify(tentativas));

/* e não repete a descoberta a cada chamada */
tentativas = [];
await m.chamarApi('/api/cupom', {}, 'O resgate de cupom');
if (tentativas.length === 1 && tentativas[0].startsWith(WORKER)) ok('depois de achar, as chamadas seguintes vão direto ao Worker');
else falha('refez a descoberta: ' + JSON.stringify(tentativas));

/* ── erro que veio do servidor não pode virar troca de endereço ──────── */
m = await novo();
responder({
  '/api/cupom': () => dados({ erro: 'Cupom inválido.' }, 404),
  [WORKER + '/api/cupom']: () => dados({ ok: true }),
});
r = await m.chamarApi('/api/cupom', {}, 'O resgate de cupom');
if (r.erro === 'Cupom inválido.') ok('cupom inválido chega a quem perguntou, com a mensagem do servidor');
else falha('mensagem do servidor perdida: ' + JSON.stringify(r));
if (tentativas.length === 1) ok('um 404 com explicação não faz procurar outro servidor');
else falha('procurou outro servidor à toa: ' + JSON.stringify(tentativas));

/* ── quando os dois lugares falham, a mensagem explica o que falta ───── */
m = await novo();
responder({ '/api/acessos': pagina, [WORKER + '/api/acessos']: pagina });
r = await m.chamarApi('/api/acessos', {}, 'O painel de acessos');
if (r.erro && /não está publicado/.test(r.erro)) ok('sem servidor em lugar nenhum, diz que falta publicar');
else falha('mensagem final: ' + JSON.stringify(r));

/* ── o navegador barrando por CORS conta como endereço que não serve ─── */
m = await novo();
responder({ [WORKER + '/api/salas']: () => dados({ salas: [] }) });   // o site nem responde
r = await m.chamarApi('/api/salas', {}, 'As salas de amigos');
if (r.dados && r.dados.salas) ok('se a chamada ao site nem completa, tenta o Worker mesmo assim');
else falha('não tentou o Worker após falha de rede: ' + JSON.stringify(r));

m = await novo();
responder({});
r = await m.chamarApi('/api/salas', {}, 'As salas de amigos');
if (r.erro && /conexão/.test(r.erro)) ok('sem rede nenhuma, fala em conexão em vez de erro cru');
else falha('sem rede: ' + JSON.stringify(r));

/* ── servido pelo próprio Worker: não há segundo lugar para tentar ───── */
m = await novo(WORKER);
if (m.basesDeApi().length === 1 && m.basesDeApi()[0] === '') ok('quando o site já é o Worker, não há endereço de reserva');
else falha('bases no Worker: ' + JSON.stringify(m.basesDeApi()));

/* ── CADENCIA_API manda em tudo ──────────────────────────────────────── */
m = await novo('https://cadenciamed.com.br', 'https://outro.exemplo/');
if (JSON.stringify(m.basesDeApi()) === '["https://outro.exemplo"]') ok('CADENCIA_API aponta para outro servidor, sem barra sobrando');
else falha('CADENCIA_API: ' + JSON.stringify(m.basesDeApi()));

m = await novo('https://cadenciamed.com.br', '');
if (JSON.stringify(m.basesDeApi()) === '[""]') ok('CADENCIA_API vazia fixa o próprio site, sem reserva');
else falha('CADENCIA_API vazia: ' + JSON.stringify(m.basesDeApi()));

/* ── o corpo vai como JSON, que é o que as rotas esperam ─────────────── */
m = await novo();
let recebido = null;
globalThis.fetch = async (url, opcoes) => {
  recebido = opcoes;
  return dados({ ok: true });
};
await m.chamarApi('/api/cupom', { codigo: 'x' }, 'O resgate de cupom');
if (recebido && recebido.method === 'POST' && JSON.parse(recebido.body).codigo === 'x') ok('o corpo é enviado como JSON em POST');
else falha('corpo enviado: ' + JSON.stringify(recebido));
if (recebido.headers['Content-Type'] === 'application/json') ok('manda o Content-Type que as rotas esperam');
else falha('sem Content-Type');

console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
