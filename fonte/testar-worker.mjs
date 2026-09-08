/* Testa a entrada do Worker: quem vira API e quem vira arquivo do site.
 *
 * É a peça que decide o roteamento inteiro. Um engano aqui deixa o site no ar
 * mas com as quatro rotas mortas, ou o contrário.
 *
 *   node testar-worker.mjs
 */
const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

/* O binding de arquivos estáticos, fingido. */
let pedidoAoAssets = null;
const env = {
  ASSETS: {
    fetch: (req) => {
      pedidoAoAssets = new URL(req.url).pathname;
      return Promise.resolve(new Response('<html>o site</html>', {
        headers: { 'Content-Type': 'text/html' },
      }));
    },
  },
};

/* Sem chave nenhuma, cada rota responde o erro de configuração dela — que é
   o suficiente para provar que a rota existe e foi chamada. */
const { default: worker } = await import('../worker/index.js');

const pedir = (caminho, metodo = 'POST', cabecalhos = {}) => {
  pedidoAoAssets = null;
  return worker.fetch(new Request('https://cadenciamed.com.br' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...cabecalhos },
    ...(metodo === 'POST' ? { body: '{}' } : {}),
  }), env, {});
};

/* ── as seis rotas existem e não caem nos arquivos ───────────────────── */
for (const rota of ['/api/assistente', '/api/cupom', '/api/acessos', '/api/compra', '/api/salas', '/api/baralhos']) {
  const r = await pedir(rota);
  if (pedidoAoAssets === null) ok(`${rota} é atendida pelo Worker, não pelos arquivos`);
  else falha(`${rota} caiu nos arquivos estáticos`);
  if (r.status >= 200 && r.status < 600) ok(`${rota} responde (${r.status})`);
  else falha(`${rota} não respondeu`);
}

/* barra no fim não pode virar 404 */
const r1 = await pedir('/api/cupom/');
if (pedidoAoAssets === null) ok('barra no fim do endereço não quebra a rota');
else falha('/api/cupom/ caiu nos arquivos');

/* ── tudo que não é /api/ vai para os arquivos ───────────────────────── */
for (const caminho of ['/', '/index.html', '/icone-192.png', '/manifest.webmanifest', '/qualquer-coisa']) {
  const r = await pedir(caminho, 'GET');
  if (pedidoAoAssets === caminho) ok(`${caminho} é servido como arquivo do site`);
  else falha(`${caminho} não chegou nos arquivos (foi para ${pedidoAoAssets})`);
}

/* uma rota /api/ que não existe também é arquivo, não erro cru */
const r2 = await pedir('/api/inventada', 'GET');
if (pedidoAoAssets === '/api/inventada') ok('rota /api inexistente cai no site, sem erro cru');
else falha('rota /api inexistente: ' + pedidoAoAssets);

/* ── CORS ────────────────────────────────────────────────────────────
   Enquanto as páginas vêm do Firebase Hosting e as rotas /api vêm do
   Worker, toda chamada é entre domínios: sem estes cabeçalhos o navegador
   descarta a resposta e o painel mostra "não deu certo" sem motivo. */
const SITE = 'https://cadenciamed.com.br';

const pre = await pedir('/api/cupom', 'OPTIONS', { Origin: SITE });
if (pre.status === 204) ok('a pergunta de permissão (OPTIONS) é respondida sem exigir token');
else falha('OPTIONS: ' + pre.status);
if (pre.headers.get('Access-Control-Allow-Origin') === SITE) ok('a resposta ao OPTIONS libera o site');
else falha('OPTIONS sem origem liberada');
if ((pre.headers.get('Access-Control-Allow-Headers') || '').toLowerCase().includes('content-type')) ok('o OPTIONS libera o cabeçalho Content-Type, que é o que o app manda');
else falha('OPTIONS não libera Content-Type');

const comOrigem = await pedir('/api/cupom', 'POST', { Origin: SITE });
if (comOrigem.headers.get('Access-Control-Allow-Origin') === SITE) ok('a resposta da rota também vem liberada para o site');
else falha('POST sem cabeçalho de liberação');
if (comOrigem.headers.get('Vary') === 'Origin') ok('o Vary evita que um proxy sirva a resposta de uma origem para outra');
else falha('sem Vary: Origin');
if ((comOrigem.headers.get('Content-Type') || '').includes('json')) ok('liberar o CORS não estraga o Content-Type da rota');
else falha('Content-Type virou: ' + comOrigem.headers.get('Content-Type'));

/* site desconhecido não pode chamar com o token de quem está logado */
const invasor = await pedir('/api/cupom', 'POST', { Origin: 'https://site-qualquer.com' });
if (!invasor.headers.get('Access-Control-Allow-Origin')) ok('origem desconhecida não recebe liberação');
else falha('liberou origem desconhecida');
const preInvasor = await pedir('/api/cupom', 'OPTIONS', { Origin: 'https://site-qualquer.com' });
if (preInvasor.status === 403) ok('a pergunta de permissão de origem desconhecida é recusada');
else falha('OPTIONS de invasor: ' + preInvasor.status);

/* a lista dá para trocar sem mexer no código */
const envOutro = { ...env, ORIGENS: 'https://outro.exemplo' };
const r4 = await worker.fetch(new Request('https://x/api/cupom', {
  method: 'POST', headers: { Origin: 'https://outro.exemplo' }, body: '{}',
}), envOutro, {});
if (r4.headers.get('Access-Control-Allow-Origin') === 'https://outro.exemplo') ok('ORIGENS troca a lista de sites liberados');
else falha('ORIGENS não foi respeitada');
const r5 = await worker.fetch(new Request('https://x/api/cupom', {
  method: 'POST', headers: { Origin: SITE }, body: '{}',
}), envOutro, {});
if (!r5.headers.get('Access-Control-Allow-Origin')) ok('com ORIGENS cadastrada, a lista padrão deixa de valer');
else falha('ORIGENS não substituiu a lista padrão');

/* ── exceção de dentro de uma rota vira JSON, não página do Cloudflare ─ */
const { default: workerQuebrado } = await import('../worker/index.js?v=2');
const envQuebrado = {
  ASSETS: env.ASSETS,
  /* uma conta de serviço corrompida faz o cupom estourar lá dentro */
  FIREBASE_API_KEY: 'k',
  FIREBASE_SERVICE_ACCOUNT: '{isso não é json}',
};
globalThis.fetch = async () => new Response(JSON.stringify({ users: [{ localId: 'u', email: 'a@b.c' }] }),
  { status: 200, headers: { 'Content-Type': 'application/json' } });
const r3 = await workerQuebrado.fetch(
  new Request('https://x/api/cupom', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: 't', codigo: 'secdamocada' }),
  }), envQuebrado, {});
const corpo = await r3.json().catch(() => null);
if (corpo && corpo.erro) ok('erro dentro da rota volta como JSON explicado');
else falha('erro dentro da rota não virou JSON: ' + r3.status);

console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
