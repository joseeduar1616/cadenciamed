/* A página de baixar o app (app.html → cadenciamed.com.br/app).
 *
 * Abre a página fingindo ser cada aparelho e confere que ela reconhece
 * qual é, mostra o caminho certo daquele aparelho primeiro, e não quebra
 * no celular. Também confere o que sustenta a página no ar: a rota /app,
 * o link dentro do site, e que o service worker não guarda esta página
 * como se fosse o app (senão o app instalado abriria a página de download
 * sem internet).
 *
 *   node testar-app.mjs
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const erros = [];
const passos = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

const pagina = path.resolve('app.html');
if (!fs.existsSync(pagina)) { console.error('não achei app.html'); process.exit(1); }

/* ── o que mantém a página no ar ──────────────────────────────────────── */
const firebase = JSON.parse(fs.readFileSync(path.resolve('../firebase.json'), 'utf8'));
const regras = firebase.hosting.rewrites;
const iApp = regras.findIndex((r) => r.source === '/app' && r.destination === '/app.html');
const iTudo = regras.findIndex((r) => r.source === '**');
if (iApp >= 0 && iApp < iTudo) ok('o Firebase leva /app à página, antes da regra que manda tudo para o app');
else falha('falta a regra /app → /app.html antes do "**" no firebase.json');

const publicar = fs.readFileSync(path.resolve('publicar.py'), 'utf8');
if (/'app\.html'/.test(publicar)) ok('a página vai para a pasta publicada');
else falha('app.html fora da lista do publicar.py');

const mapa = fs.readFileSync(path.resolve('sitemap.xml'), 'utf8');
if (mapa.includes('https://cadenciamed.com.br/app<')) ok('a página está no mapa do site');
else falha('a página não está no sitemap.xml');

/* O service worker: só o app vira casca offline. */
const sw = fs.readFileSync(path.resolve('sw.js'), 'utf8');
const m = /const PAGINAS_SOLTAS = (\/.*\/);/.exec(sw);
if (!m) falha('o sw.js não separa as páginas soltas da casca do app');
else {
  const soltas = eval(m[1]); // eslint-disable-line no-eval
  const devemSer = ['/app', '/app.html', '/termos.html', '/privacidade.html', '/recuperar.html'];
  const naoPodem = ['/', '/index.html', '/foco', '/aplicativo'];
  if (devemSer.every((p) => soltas.test(p))) ok('o service worker não guarda /app nem as páginas legais como casca do app');
  else falha('página solta virando casca: ' + devemSer.filter((p) => !soltas.test(p)).join(', '));
  if (naoPodem.every((p) => !soltas.test(p))) ok('e continua guardando o próprio app como casca');
  else falha('o app deixou de ser casca em: ' + naoPodem.filter((p) => soltas.test(p)).join(', '));
  if (/if \(!solta && r && r\.ok\)/.test(sw)) ok('só resposta boa do app substitui a casca guardada');
  else falha('a casca é substituída sem conferir se era o app');
}

/* ── a página em cada aparelho ────────────────────────────────────────── */
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const navegador = await chromium.launch({
  args: ['--no-sandbox'],
  ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}),
});

const APARELHOS = [
  {
    nome: 'iPhone no Safari', plataforma: 'ios', largura: 390, altura: 844, toque: true,
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1',
    titulo: /iPhone ou iPad/, passo: /Adicionar à Tela de Início/, qr: false,
  },
  {
    nome: 'Android no Chrome', plataforma: 'android', largura: 360, altura: 780, toque: true,
    ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    titulo: /Android/, passo: /Instalar app/, qr: false,
  },
  {
    nome: 'Mac no Safari', plataforma: 'mac', largura: 1280, altura: 800, toque: false,
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
    titulo: /Mac/, passo: /Adicionar ao Dock/, qr: true,
  },
  {
    nome: 'PC no Edge', plataforma: 'windows', largura: 1366, altura: 768, toque: false,
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
    titulo: /PC com Windows/, passo: /Instalar este site como aplicativo/, qr: true,
  },
  {
    nome: 'navegador de dentro do Instagram', plataforma: 'ios', largura: 390, altura: 844, toque: true,
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0',
    titulo: /iPhone ou iPad/, passo: /Abrir no navegador/, qr: false,
  },
];

for (const a of APARELHOS) {
  const ctx = await navegador.newContext({
    viewport: { width: a.largura, height: a.altura }, userAgent: a.ua,
    hasTouch: a.toque, isMobile: a.toque,
  });
  const pag = await ctx.newPage();
  const errosPag = [];
  pag.on('pageerror', (e) => errosPag.push(e.message));
  await pag.goto('file://' + pagina, { waitUntil: 'load' });
  await pag.waitForTimeout(300);

  const agora = await pag.locator('#agora').innerText();
  if (a.titulo.test(agora)) ok(`${a.nome}: reconhece o aparelho`);
  else falha(`${a.nome}: não reconheceu o aparelho: ${agora.slice(0, 80)}`);
  if (a.passo.test(agora)) ok(`${a.nome}: mostra o caminho certo no topo`);
  else falha(`${a.nome}: caminho errado no topo: ${agora.slice(0, 160)}`);

  const primeiro = await pag.evaluate(() => {
    const c = document.querySelector('.grade .plataforma');
    return c ? { p: c.getAttribute('data-plataforma'), sua: c.getAttribute('data-sua') } : null;
  });
  if (primeiro && primeiro.p === a.plataforma && primeiro.sua === '1') ok(`${a.nome}: o cartão do aparelho vem primeiro, marcado como "o seu"`);
  else falha(`${a.nome}: cartão do aparelho fora do lugar: ${JSON.stringify(primeiro)}`);

  const qrVisivel = await pag.locator('#bloco-qr').isVisible();
  if (qrVisivel === a.qr) ok(`${a.nome}: ${a.qr ? 'mostra' : 'esconde'} o QR code`);
  else falha(`${a.nome}: QR code ${qrVisivel ? 'aparecendo' : 'escondido'} sem motivo`);

  const vaza = await pag.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (vaza <= 0) ok(`${a.nome}: nada vaza para os lados`);
  else falha(`${a.nome}: a página vaza ${vaza}px para o lado`);

  if (!errosPag.length) ok(`${a.nome}: sem erro de script`);
  else falha(`${a.nome}: erro de script: ${errosPag.join(' | ')}`);
  await ctx.close();
}

/* O botão de um toque (Chrome e Edge): o navegador avisa que dá para
   instalar, e a página troca o passo a passo pelo botão. */
{
  const ctx = await navegador.newContext({
    viewport: { width: 1366, height: 768 },
    userAgent: APARELHOS[3].ua,
  });
  const pag = await ctx.newPage();
  await pag.goto('file://' + pagina, { waitUntil: 'load' });
  await pag.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true });
    e.prompt = () => { window.__pediu = true; };
    e.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(e);
  });
  await pag.waitForTimeout(100);
  if (await pag.locator('#instalar').isVisible()) ok('quando o navegador deixa, aparece o botão "Instalar o app"');
  else falha('o botão de instalar não apareceu com o aviso do navegador');
  await pag.locator('#instalar').click();
  if (await pag.evaluate(() => window.__pediu === true)) ok('o botão abre a instalação do navegador');
  else falha('o botão não chamou a instalação');
  await pag.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await pag.waitForTimeout(100);
  if (await pag.locator('#abrir').isVisible() && /Instalado/.test(await pag.locator('#agora').innerText())) {
    ok('instalado, a página diz onde achar o ícone e oferece abrir');
  } else falha('depois de instalar, a página não mudou');
  await ctx.close();
}

/* ── o link dentro do site ────────────────────────────────────────────── */
{
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { try { const k = 'cadencia:v3:convite-notificacoes-aparelho'; if (!localStorage.getItem(k)) localStorage.setItem(k, 'teste'); localStorage.setItem('cm-sem-pergunta-faculdade', '1'); } catch (e) { /* noop */ } });
  const pag = await ctx.newPage();
  await pag.route('**/api/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' }));
  await pag.goto('file://' + path.resolve('index.html'), { waitUntil: 'load' });
  await pag.waitForTimeout(1500);
  if (await pag.locator('a[href="/app"]').count() > 0) ok('a primeira página do site já tem o link "Baixar o app"');
  else falha('a primeira página não leva à página do app');
  const semConta = pag.locator('button:has-text("usar sem conta")');
  if (await semConta.count() > 0) { await semConta.first().click(); await pag.waitForTimeout(300); }
  const campoNome = pag.locator('input[placeholder="Seu nome"]');
  if (await campoNome.count() > 0) {
    await campoNome.fill('Teste');
    await pag.locator('button:has-text("Começar")').first().click();
    await pag.waitForTimeout(800);
  }
  const noMenu = await pag.evaluate(() => {
    const a = [...document.querySelectorAll('a[href="/app"]')].find((x) => /Baixar o app/i.test(x.innerText));
    return !!a && !a.closest('main');
  });
  if (noMenu) ok('dentro do site, o menu lateral tem "Baixar o app"');
  else falha('o menu lateral não tem "Baixar o app"');
  await ctx.close();
}

await navegador.close();
console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
