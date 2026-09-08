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

const pedir = (caminho, metodo = 'POST') => {
  pedidoAoAssets = null;
  return worker.fetch(new Request('https://cadenciamed.com.br' + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    ...(metodo === 'POST' ? { body: '{}' } : {}),
  }), env, {});
};

/* ── as quatro rotas existem e não caem nos arquivos ─────────────────── */
for (const rota of ['/api/assistente', '/api/cupom', '/api/acessos', '/api/compra']) {
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
