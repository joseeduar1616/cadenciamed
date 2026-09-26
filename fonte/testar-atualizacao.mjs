/* A pessoa tem de FICAR SABENDO que saiu versão nova.
 *
 * Este teste existe por um defeito que fez uma publicação inteira parecer
 * que não tinha acontecido.
 *
 * O site é um arquivo só, com todo o código dentro do HTML. O service
 * worker chama skipWaiting e clients.claim, então ele próprio troca assim
 * que a versão nova chega — mas a PÁGINA já aberta continua rodando o
 * código antigo até alguém recarregar. Num aplicativo instalado na tela
 * de início, que ninguém fecha de verdade, isso dura indefinidamente: o
 * servidor publica, o service worker atualiza, e a tela continua a mesma
 * de semanas atrás. Do lado de quem usa, "as atualizações não foram
 * publicadas" — e não havia como nem ver qual versão estava rodando.
 *
 * O que se cobra aqui:
 *   · o HTML carrega o carimbo da versão numa meta própria;
 *   · trocar de service worker no meio do caminho faz aparecer a tarja;
 *   · a tarja tem como recarregar E como adiar;
 *   · a PRIMEIRA instalação não mostra tarja nenhuma (não há o que
 *     atualizar: a página já é a mais nova).
 *
 *   node testar-atualizacao.mjs [arquivo.html]
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';

const alvo = path.resolve(process.argv[2] || 'index.html');
if (!fs.existsSync(alvo)) { console.error('não achei', alvo); process.exit(1); }

const erros = [];
const ok = (m) => console.log('ok   ' + m);
const falha = (m) => { console.log('FALHA ' + m); erros.push(m); };

/* ── o carimbo está no HTML ──────────────────────────────────────────── */
const html = fs.readFileSync(alvo, 'utf8');
const meta = html.match(/name="cadencia-versao"\s+content="([^"]*)"/);
if (meta && meta[1].trim() && meta[1] !== '__VERSAO__') {
  ok(`o HTML carrega o carimbo da versão ("${meta[1]}")`);
} else {
  falha('o HTML saiu sem o carimbo da versão: não há como conferir o que está no ar');
}

/* O mesmo carimbo tem de chegar ao JS, senão a tela compara uma coisa
   com outra e acusa versão nova para sempre. */
if (meta && html.includes(`"${meta[1]}"`)) {
  ok('e o mesmo carimbo está no código, para a comparação bater');
} else {
  falha('o carimbo do HTML não aparece no código: a conferência compararia coisas diferentes');
}

/* Servido por http em 127.0.0.1: origem segura para o navegador, e o
   mesmo caminho de código que roda em produção. */
const servidor = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const endereco = `http://127.0.0.1:${servidor.address().port}/`;

const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const navegador = await chromium.launch({
  args: ['--no-sandbox'],
  ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}),
});

/* O registro só roda em origem segura, e localhost conta como uma — é por
   isso que o teste serve o arquivo por http em 127.0.0.1 em vez de abri-lo
   como arquivo: assim o caminho exercitado é o mesmo de produção.

   O navigator.serviceWorker é de mentira porque o teste precisa DISPARAR
   a troca de versão na mão. De verdade isso exigiria publicar duas vezes
   e esperar o navegador perceber, que não é coisa que caiba num teste. */
const preparar = async (pag, jaControlado) => {
  await pag.addInitScript((controlado) => {
    const ouvintes = {};
    const registro = {
      installing: null,
      addEventListener: (t, f) => { (ouvintes['reg:' + t] = ouvintes['reg:' + t] || []).push(f); },
      update: () => Promise.resolve(),
    };
    const sw = {
      controller: controlado ? { state: 'activated' } : null,
      register: () => Promise.resolve(registro),
      getRegistration: () => Promise.resolve(registro),
      addEventListener: (t, f) => { (ouvintes['sw:' + t] = ouvintes['sw:' + t] || []).push(f); },
    };
    Object.defineProperty(window.navigator, 'serviceWorker', { value: sw, configurable: true });
    window.__trocarDeVersao = () => {
      for (const f of ouvintes['sw:controllerchange'] || []) f();
    };
  }, jaControlado);
};

/* ── 1. já havia versão rodando: a troca avisa ───────────────────────── */
{
  const pag = await (await navegador.newContext()).newPage();
  await preparar(pag, true);
  await pag.goto(endereco, { waitUntil: 'load' });
  await pag.waitForTimeout(1500);

  const registrou = await pag.evaluate(() => typeof window.__trocarDeVersao === 'function');
  if (!registrou) {
    falha('o script de registro do service worker não rodou: o teste não chegou a exercitar nada');
  } else {
    await pag.evaluate(() => window.__trocarDeVersao());
    await pag.waitForTimeout(400);

    const tarja = await pag.evaluate(() => {
      const d = document.getElementById('tarja-versao');
      if (!d) return null;
      /* offsetParent é sempre nulo em elemento "position: fixed", então
         ele não serve para dizer se a coisa aparece. O que vale é ter
         tamanho na tela e não estar escondida por estilo. */
      const cs = getComputedStyle(d);
      const r = d.getBoundingClientRect();
      return {
        texto: d.innerText,
        visivel: r.width > 40 && r.height > 20
          && cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.1,
        dentroDaTela: r.top < 900 && r.bottom > 0,
      };
    });

    if (tarja) ok('quando a versão nova assume, a tarja aparece');
    else falha('a versão nova entrou e nada avisou: é este o defeito que fez a publicação parecer que não aconteceu');

    if (tarja && /vers[ãa]o nova/i.test(tarja.texto)) ok('e ela diz o que aconteceu, em português');
    else if (tarja) falha('a tarja não explica nada: ' + tarja.texto);

    if (tarja && tarja.visivel) ok('e está visível na tela, não escondida atrás de alguma coisa');
    else if (tarja) falha('a tarja foi criada mas não aparece');

    if (tarja && tarja.dentroDaTela) ok('e dentro da área visível, não jogada para fora da tela');
    else if (tarja) falha('a tarja ficou fora da tela');

    /* Recarregar tem de ser uma ESCOLHA: recarregar sozinho no meio de um
       flashcard ou de um duelo faz perder o que estava sendo feito.
       Quem diz se recarregou é uma marca posta no window: um reload apaga
       o window inteiro, então a marca sumir é a prova de que recarregou —
       e sobreviver, a prova de que não. */
    await pag.evaluate(() => { window.__marcaDeVida = 1; });
    await pag.waitForTimeout(600);
    const aindaViva = await pag.evaluate(() => window.__marcaDeVida === 1);
    if (aindaViva) ok('e o site não se recarrega sozinho, o que faria perder o que estava aberto');
    else falha('o site recarregou sozinho, sem perguntar');

    const botoes = await pag.evaluate(() => [...document.querySelectorAll('#tarja-versao button')]
      .map((b) => b.innerText.trim()));
    if (botoes.length >= 2) ok(`a tarja oferece atualizar e adiar (${botoes.join(', ')})`);
    else falha('faltou saída na tarja: ' + JSON.stringify(botoes));

    /* E o botão de atualizar recarrega de verdade: a marca de vida tem
       de sumir depois do clique. */
    await pag.click('#tarja-recarregar');
    await pag.waitForLoadState('load').catch(() => undefined);
    await pag.waitForTimeout(600);
    const sumiu = await pag.evaluate(() => window.__marcaDeVida !== 1);
    if (sumiu) ok('e o botão de atualizar recarrega a página de verdade');
    else falha('o botão de atualizar não recarregou nada');
  }
  await pag.close();
}

/* ── 2. primeira instalação: nada a avisar ───────────────────────────── */
{
  const pag = await (await navegador.newContext()).newPage();
  await preparar(pag, false);
  await pag.goto(endereco, { waitUntil: 'load' });
  await pag.waitForTimeout(1500);
  await pag.evaluate(() => window.__trocarDeVersao && window.__trocarDeVersao());
  await pag.waitForTimeout(400);

  const temTarja = await pag.evaluate(() => !!document.getElementById('tarja-versao'));
  if (!temTarja) ok('na primeira visita não aparece tarja: a página já é a mais nova');
  else falha('a primeira visita mostrou "tem versão nova" sem haver versão anterior');
  await pag.close();
}

await navegador.close();
servidor.close();
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
