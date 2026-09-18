/* Os lembretes precisam SAIR, e não só dizer que estão ligados.
 *
 * O defeito que este teste tranca: o aviso era criado com "new
 * Notification". No Chrome do Android esse construtor simplesmente lança
 * ("Illegal constructor") — só o showNotification do service worker
 * funciona por lá. Como a chamada estava dentro de um try que engolia o
 * erro, no Android a pessoa ligava os lembretes, via "ligados" na tela, e
 * não recebia aviso nenhum. Nada acusava nada.
 *
 * Aqui o construtor é substituído por um que lança, como no Android, e o
 * service worker de mentira anota o que lhe pedem. O aviso tem de sair
 * pelo service worker mesmo assim.
 *
 *   node testar-lembretes.mjs [arquivo.html]
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';

const alvo = path.resolve(process.argv[2] || 'teste.html');
if (!fs.existsSync(alvo)) { console.error('não achei', alvo); process.exit(1); }

const erros = [];
const ok = (m) => console.log('ok   ' + m);
const falha = (m) => { console.log('FALHA ' + m); erros.push(m); };

const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const navegador = await chromium.launch({
  args: ['--no-sandbox'],
  ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}),
});
const pag = await (await navegador.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

await pag.addInitScript(() => {
  try {
    window.localStorage.setItem('cadencia:v3', JSON.stringify({
      profile: { name: 'Teste', onboarded: true },
    }));
  } catch (e) { /* segue */ }

  window.__avisos = [];
  window.__pediuPermissao = 0;

  /* O Android: o construtor lança. Se o site depender dele, não sai aviso. */
  const Falso = function () { throw new TypeError('Illegal constructor'); };
  Falso.permission = 'granted';
  Falso.requestPermission = () => { window.__pediuPermissao += 1; return Promise.resolve('granted'); };
  Object.defineProperty(window, 'Notification', { value: Falso, writable: true, configurable: true });

  /* O service worker de mentira: é por aqui que o aviso tem de sair. */
  const registro = {
    showNotification: (titulo, opcoes) => {
      window.__avisos.push({ titulo, corpo: (opcoes || {}).body, tag: (opcoes || {}).tag });
      return Promise.resolve();
    },
  };
  Object.defineProperty(window.navigator, 'serviceWorker', {
    value: { getRegistration: () => Promise.resolve(registro), register: () => Promise.resolve(registro) },
    configurable: true,
  });
});

await pag.goto('file://' + alvo, { waitUntil: 'load' });
await pag.waitForTimeout(1800);
const semConta = pag.locator('button:has-text("usar sem conta")');
if (await semConta.count() > 0) { await semConta.first().click(); await pag.waitForTimeout(400); }

const config = pag.locator('nav button:has-text("Configurações")');
if (await config.count() === 0) {
  falha('não achei a aba Configurações');
} else {
  await config.first().click();
  await pag.waitForTimeout(700);

  const ligar = pag.locator('main button:has-text("Ligar os lembretes")');
  if (await ligar.count() === 0) {
    falha('não achei o botão de ligar os lembretes');
  } else {
    await ligar.first().click();
    await pag.waitForTimeout(1200);

    const avisos = await pag.evaluate(() => window.__avisos || []);
    if (avisos.length > 0) {
      ok('mesmo onde "new Notification" lança, o aviso sai pelo service worker');
    } else {
      falha('nenhum aviso saiu: no Android isto seria lembrete ligado e aviso nenhum');
    }

    if (avisos[0] && avisos[0].corpo) ok('e o aviso vai com texto, não só com título');
    else falha('o aviso saiu sem corpo: ' + JSON.stringify(avisos[0]));

    /* Ligado de verdade: a tela diz, e o botão de testar aparece. */
    const texto = await pag.evaluate(() => document.querySelector('main').innerText);
    if (/ligados/i.test(texto)) ok('a tela mostra que ficaram ligados');
    else falha('a tela não confirmou que os lembretes ligaram');

    const testar = pag.locator('main button:has-text("mandar um agora")');
    if (await testar.count() > 0) {
      ok('tem botão de mandar um aviso na hora, para conferir no aparelho');
      const antes = (await pag.evaluate(() => window.__avisos.length));
      await testar.first().click();
      await pag.waitForTimeout(900);
      const depois = await pag.evaluate(() => window.__avisos.length);
      if (depois > antes) ok('e o botão de testar manda um aviso de verdade');
      else falha('o botão de testar não mandou nada');
    } else falha('não achei o botão de testar');

    /* Dois blocos de mesmo nome não podem se apagar: a marca separa. */
    const marcas = await pag.evaluate(() => (window.__avisos || []).map((a) => a.tag));
    if (marcas.every((m) => m)) ok('todo aviso vai com marca própria, para um não apagar o outro');
    else falha('saiu aviso sem marca: ' + JSON.stringify(marcas));
  }
}

/* ── a tela não pode mentir sobre a permissão ─────────────────────────── */
await pag.evaluate(() => { window.Notification.permission = 'denied'; });
await pag.waitForTimeout(3600);
const recusado = await pag.evaluate(() => document.querySelector('main').innerText);
if (/recusou as notificações/i.test(recusado)) {
  ok('permissão revogada por fora é percebida, sem precisar recarregar');
} else falha('a tela continuou dizendo que estava tudo certo depois de a permissão cair');

await navegador.close();
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
