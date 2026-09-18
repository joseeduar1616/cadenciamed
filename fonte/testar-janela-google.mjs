/* Nada pode abrir a tela do Google sem alguém ter clicado.
 *
 * Este teste existe por causa de um defeito que durou meses: a
 * sincronização sozinha tinha uma "tentativa silenciosa" que chamava
 * requestAccessToken({ prompt: "" }) um segundo e meio depois de cada
 * abertura. Prompt vazio não quer dizer janela nenhuma — quer dizer sem
 * tela de consentimento. Quando o navegador não consegue resolver a
 * sessão do Google em silêncio (Chrome e Safari barram cookie de
 * terceiros, e no aplicativo instalado não há cookie nenhum), ele abre a
 * escolha de conta assim mesmo. Era isso que fazia o site pedir para
 * entrar no Google toda vez que era aberto.
 *
 * Aqui o window.google é de mentira e anota tudo que lhe pedem. O app
 * abre com a sincronização sozinha ligada, fica cinco segundos sem
 * ninguém tocar em nada, e a lista de pedidos tem de estar vazia.
 *
 *   node testar-janela-google.mjs [arquivo.html]
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const alvo = path.resolve(process.argv[2] || 'teste.html');
if (!fs.existsSync(alvo)) { console.error('não achei', alvo); process.exit(1); }

const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const navegador = await chromium.launch({
  args: ['--no-sandbox'],
  ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}),
});
const ctx = await navegador.newContext({ viewport: { width: 1440, height: 900 } });
const pag = await ctx.newPage();

/* Se alguma coisa tentar abrir janela de verdade, isso também conta. */
const janelasDeVerdade = [];
pag.on('popup', (p) => janelasDeVerdade.push(p.url()));

await pag.addInitScript(() => {
  /* O site só liga o Google quando existe credencial configurada. */
  window.CADENCIA_GOOGLE = { clientId: 'teste.apps.googleusercontent.com' };
  window.__pedidosGoogle = [];
  const anotar = (tipo, extra) => window.__pedidosGoogle.push({ tipo, extra: extra || null });
  /* O Google de mentira responde de verdade quando alguém pede: assim o
     teste segue adiante e consegue exercitar o que vem depois da
     autorização, que é a parte que escreve na agenda. */
  window.google = {
    accounts: {
      oauth2: {
        initTokenClient: (cfg) => ({
          requestAccessToken: (o) => {
            anotar('token', (o && o.prompt) === '' ? 'prompt vazio' : 'com prompt');
            window.setTimeout(() => cfg.callback({ access_token: 'token-de-teste', expires_in: 3600 }), 10);
          },
        }),
        initCodeClient: (cfg) => ({
          requestCode: () => {
            anotar('codigo');
            window.setTimeout(() => cfg.callback({ code: 'codigo-de-teste' }), 10);
          },
        }),
        revoke: () => undefined,
      },
    },
  };
  /* Sincronização sozinha ligada, como fica depois de puxar do Google uma
     vez. É essa a situação em que a tela aparecia a cada abertura. */
  try {
    window.localStorage.setItem('cadencia:v3', JSON.stringify({
      profile: { name: 'Teste' },
      googleCal: { id: 'agenda-de-teste', autoSync: true, ultima: 1 },
    }));
  } catch (e) { /* sem localStorage não há o que semear */ }
});

/* A agenda do Google, de mentira: anota o que chega e responde o mínimo
   para o app seguir em frente. */
const naAgenda = [];
await pag.route('https://www.googleapis.com/calendar/v3/**', (rota) => {
  const req = rota.request();
  const url = new URL(req.url());
  naAgenda.push({ metodo: req.method(), caminho: url.pathname.replace('/calendar/v3', '') });
  let corpo = '{}';
  if (req.method() === 'POST' && /\/calendars$/.test(url.pathname)) corpo = '{"id":"cal-de-teste"}';
  else if (/\/events\?/.test(req.url()) || /\/events$/.test(url.pathname) && req.method() === 'GET') corpo = '{"items":[]}';
  rota.fulfill({ status: 200, contentType: 'application/json', body: corpo });
});

await pag.goto('file://' + alvo, { waitUntil: 'load' });
await pag.waitForTimeout(2200);

const semConta = pag.locator('button:has-text("usar sem conta")');
if (await semConta.count() > 0) { await semConta.first().click(); await pag.waitForTimeout(400); }
const campoNome = pag.locator('input[placeholder="Seu nome"]');
if (await campoNome.count() > 0) {
  await campoNome.fill('Teste');
  await pag.locator('button:has-text("Começar")').first().click();
  await pag.waitForTimeout(1000);
}

if (await pag.evaluate(() => document.querySelector('#root')?.children.length > 0)) {
  ok('o app montou com a sincronização sozinha ligada');
} else falha('o #root ficou vazio: o teste não chegou a exercitar nada');

/* A primeira tentativa saía 1,5 s depois de abrir. Cinco segundos cobrem
   ela com folga, e ainda pegam quem tentasse de novo logo atrás. */
await pag.waitForTimeout(5000);

const pedidos = await pag.evaluate(() => window.__pedidosGoogle || []);
if (pedidos.length === 0) {
  ok('cinco segundos aberto, e nenhuma tela do Google foi pedida');
} else {
  falha(`o app pediu a tela do Google sozinho: ${pedidos.map((p) => `${p.tipo}${p.extra ? ` (${p.extra})` : ''}`).join(', ')}`);
}
if (janelasDeVerdade.length === 0) ok('nenhuma janela foi aberta sozinha');
else falha(`abriu janela sozinho: ${janelasDeVerdade.join(', ')}`);

/* Voltar para a aba, que é o outro momento em que a sincronização sozinha
   roda, também não pode pedir nada. */
await pag.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
await pag.waitForTimeout(1500);
const depoisDeVoltar = await pag.evaluate(() => (window.__pedidosGoogle || []).length);
if (depoisDeVoltar === 0) ok('voltar para a aba também não pede a tela do Google');
else falha('voltar para a aba pediu a tela do Google');

/* O contraponto: clicar tem de continuar funcionando, senão tudo acima
   passaria com o Google simplesmente quebrado.
   Aqui não há conta do Cadência — o Firebase não carrega sem rede —, e é
   justamente o caso em que não existe onde guardar a autorização: o clique
   cai no fluxo de token, que vale cerca de uma hora. O que a tela NÃO pode
   fazer é deixar isso parecer defeito, então ela tem de explicar. */
const abas = pag.locator('nav button:has-text("Metas")');
if (await abas.count() > 0) {
  await abas.first().click();
  await pag.waitForTimeout(500);
  const aviso = await pag.evaluate(() => document.querySelector('main').innerText);
  if (/Entre na sua conta do Cadência para o Google ficar ligado de vez/i.test(aviso)) {
    ok('sem conta, a aba explica por que a autorização do Google não fica guardada');
  } else falha('sem conta, nada explica por que o Google vai pedir autorização de novo');

  const botao = pag.locator('button:has-text("Conectar ao Google Agenda")');
  if (await botao.count() > 0) {
    await botao.first().click();
    await pag.waitForTimeout(1500);

    /* O PRIMEIRO clique não pode abrir janela nenhuma. Ele passa pelo
       servidor antes, e no iPhone uma janela aberta depois de uma ida à
       rede é bloqueada em silêncio: o toque já acabou. */
    const logoApos = await pag.evaluate(() => window.__pedidosGoogle || []);
    if (logoApos.length === 0) ok('conectar não tenta abrir a janela depois de falar com o servidor');
    else falha('conectar abriu a janela fora do clique: ' + logoApos.map((p) => p.tipo).join(', '));

    /* E aparece o segundo botão, que é quem abre a janela — nascendo do
       próprio clique, sem nada de rede antes. */
    const autorizar = pag.locator('button:has-text("Autorizar o Google")');
    if (await autorizar.count() > 0) ok('aparece o botão que abre a autorização');
    else falha('não apareceu o botão de autorizar');

    await autorizar.first().click();
    await pag.waitForTimeout(1200);
    const depois = await pag.evaluate(() => window.__pedidosGoogle || []);
    if (depois.length > 0) ok('o clique em autorizar abre a janela do Google');
    else falha('o botão de autorizar não pediu nada ao Google');
  } else falha('não achei o botão de conectar ao Google na aba Metas');
} else falha('não achei a aba Metas');

/* ── o botão de ligar de vez tem de estar ONDE A TELA MANDA IR ───────
 *
 * Este é o defeito que custou várias rodadas de conversa. O botão "Ligar
 * a conta de vez" existia só no fim da aba Metas. O diagnóstico do painel
 * de desenvolvedor, por outro lado, mandava clicar nele "na aba Agenda",
 * e lá ele só aparecia num caso de falha bem específico. Quem seguia a
 * instrução ia à Agenda, não achava botão nenhum, e concluía que o Google
 * estava quebrado — quando não faltava nada no servidor, faltava um
 * toque num botão que não estava onde a tela dizia.
 *
 * Aqui não há conta do Cadência (o Firebase não carrega sem rede), então
 * o cartão não aparece: sem conta não há onde guardar a autorização. O
 * que se cobra é o contrário, e é o que basta para o defeito não voltar:
 * se o cartão aparecer numa das duas abas, tem de aparecer na outra
 * também, porque agora as duas desenham o MESMO componente.
 */
{
  /* Sem conta o cartão não chega a ser desenhado em aba nenhuma, então
     quem responde aqui é a fonte: as duas abas têm de desenhar o mesmo
     componente. É esta a afirmação com dente — tirar o cartão de uma das
     duas deixa o teste vermelho na hora. */
  const naAgenda = /<LigarGoogleDeVez/.test(
    fs.readFileSync(new URL('./parte4.jsx', import.meta.url), 'utf8'));
  const nasMetas = /<LigarGoogleDeVez/.test(
    fs.readFileSync(new URL('./parte7.jsx', import.meta.url), 'utf8'));
  if (naAgenda && nasMetas) ok('ligar de vez: o cartão é desenhado na aba Agenda e na aba Metas');
  else falha(`ligar de vez: falta o cartão em ${!naAgenda ? 'Agenda' : 'Metas'} — o diagnóstico manda para lá`);

  /* E uma cópia só: duas divergem, e a pessoa acaba com dois botões que
     não fazem a mesma coisa. */
  const definicoes = ['parte3.jsx', 'parte4.jsx', 'parte7.jsx']
    .filter((f) => /function LigarGoogleDeVez/.test(
      fs.readFileSync(new URL('./' + f, import.meta.url), 'utf8'))).length;
  if (definicoes === 1) ok('e existe uma definição só do cartão, não duas cópias');
  else falha(`o cartão está definido ${definicoes} vezes`);

  /* Na tela: se aparecer numa aba, tem de aparecer na outra. */
  const ondeTem = [];
  for (const aba of ['Agenda', 'Metas']) {
    const b = pag.locator(`nav button:has-text("${aba}")`);
    if (await b.count() === 0) continue;
    await b.first().click();
    await pag.waitForTimeout(500);
    const t = await pag.evaluate(() => document.querySelector('main').innerText);
    if (/Ligar a conta de vez|Conta do Google ligada de vez/i.test(t)) ondeTem.push(aba);
  }
  if (ondeTem.length !== 1) {
    ok(`ligar de vez: na tela, o cartão não fica só numa das duas abas (${ondeTem.join(' e ') || 'nenhuma, por não haver conta'})`);
  } else {
    falha(`ligar de vez: o cartão só apareceu em ${ondeTem[0]}`);
  }
}

/* E o diagnóstico não pode mandar para uma aba onde o botão não está. */
{
  const fonte = fs.readFileSync(new URL('./parte21.jsx', import.meta.url), 'utf8');
  const trecho = fonte.slice(fonte.indexOf('sabe ligar" em não'), fonte.indexOf('sabe ligar" em não') + 700);
  const citaAgenda = /aba Agenda/.test(trecho);
  const citaMetas = /aba Metas/.test(trecho);
  if (citaAgenda && citaMetas) ok('o diagnóstico cita as duas abas onde o cartão realmente está');
  else falha('o diagnóstico manda para uma aba só, e o cartão está em duas');
}

/* ── mão dupla: mexer na Agenda tem de chegar ao Google sozinho ──────
   Este é o defeito que o commit anterior deixou passar: o envio
   automático só rodava com a conta ligada de vez. Quem tinha autorizado
   na sessão mexia na agenda, nada subia, e nada avisava que não ia
   subir. Aqui não há conta do Cadência, só o token da sessão — que é
   exatamente o caso que estava parado. */
naAgenda.length = 0;
if (await pag.locator('nav button:has-text("Agenda")').count() > 0) {
  await pag.locator('nav button:has-text("Agenda")').first().click();
  await pag.waitForTimeout(500);
  await pag.locator('button:has-text("Novo bloco")').first().click();
  await pag.waitForTimeout(300);
  await pag.locator('input[placeholder="Ex.: enfermaria clínica médica"]').fill('Plantão que tem de subir');
  await pag.locator('button:has-text("Adicionar bloco")').first().click();
  /* a espera do envio automático é de 6 s; 11 dão folga para a fila */
  await pag.waitForTimeout(11000);

  const escritas = naAgenda.filter((c) => c.metodo === 'POST' || c.metodo === 'PUT');
  if (escritas.some((c) => /\/events$/.test(c.caminho))) {
    ok('criar um bloco na Agenda sobe para o Google sozinho, sem clicar em sincronizar');
  } else {
    falha(`criar um bloco não subiu nada: o Google só recebeu ${naAgenda.map((c) => `${c.metodo} ${c.caminho}`).join(', ') || 'nada'}`);
  }

  /* E não pode sair janela nenhuma por causa disso. */
  const pedidosNoFim = await pag.evaluate(() => (window.__pedidosGoogle || []).length);
  const antesDoBloco = 2;   // conectar e autorizar, lá em cima
  if (pedidosNoFim <= antesDoBloco) ok('o envio automático não abriu nenhuma tela do Google');
  else falha('o envio automático abriu a tela do Google');

  /* Mandar de novo o que já está lá seria reescrever a agenda inteira a
     cada tecla: depois da primeira subida, parado, não sobe mais nada. */
  naAgenda.length = 0;
  await pag.waitForTimeout(9000);
  if (naAgenda.filter((c) => c.metodo === 'POST' || c.metodo === 'PUT').length === 0) {
    ok('sem mudança nova, nada é reenviado ao Google');
  } else falha('o envio automático ficou reescrevendo evento que não mudou');
} else falha('não achei a aba Agenda');

await navegador.close();
console.log(passos.join('\n'));
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
