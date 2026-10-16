/* A chamada de voz com a mentoria, com microfone, voz e IA de mentira.
 *
 * Duas vezes: num navegador que reconhece fala sozinho (Chrome, Safari) e
 * num que não reconhece (Firefox), onde a fala é gravada e vai em áudio.
 * O que se confere é o CICLO — ela fala, o microfone abre, a pessoa fala,
 * o pedido sai marcado como voz, ela responde falando — e o que a pessoa
 * ouviria: sem asterisco, sem marcador de lista lido em voz alta.
 *
 *   node testar-chamada-voz.mjs [arquivo.html]
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

/* A voz e o microfone de mentira. A síntese anota o que falaria; o
   reconhecimento expõe window.__dizer(texto) para o teste "falar". */
function falsos({ comReconhecimento }) {
  try { const k = 'cadencia:v3:convite-notificacoes-aparelho'; if (!localStorage.getItem(k)) localStorage.setItem(k, '1'); } catch (e) { /* segue */ }
  if (!sessionStorage.getItem('semeado')) {
    sessionStorage.setItem('semeado', '1');
    localStorage.setItem('cadencia:v3', JSON.stringify({ profile: { name: 'Teste', onboarded: true, examDate: '2027-03-10' } }));
    localStorage.setItem('cadencia:v3:assistente-modo', 'mentoria');
  }
  window.__falas = [];
  window.__cancelou = 0;
  window.__ouvindo = false;
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      speak(u) { window.__falas.push(u.text); setTimeout(() => u.onend && u.onend(), 30); },
      cancel() { window.__cancelou += 1; },
      getVoices() { return [{ name: 'Google português do Brasil', lang: 'pt-BR' }]; },
    },
  });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  if (comReconhecimento) {
    class Rec {
      constructor() { window.__rec = this; }
      start() { window.__ouvindo = true; }
      stop() { window.__ouvindo = false; setTimeout(() => this.onend && this.onend(), 10); }
      abort() { window.__ouvindo = false; }
    }
    window.SpeechRecognition = Rec;
    window.webkitSpeechRecognition = Rec;
    window.__dizer = (t) => window.__rec.onresult({ results: [[{ transcript: t }]] });
  } else {
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
    Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true });
    Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true });
    navigator.mediaDevices.getUserMedia = async () => new MediaStream();
    class Gravador {
      constructor() { this.mimeType = 'audio/webm'; window.__gravando = false; }
      static isTypeSupported() { return true; }
      start() { window.__gravando = true; }
      stop() {
        if (!window.__gravando) return;
        window.__gravando = false;
        this.ondataavailable({ data: new Blob([new Uint8Array(4000)], { type: 'audio/webm' }) });
        this.onstop();
      }
    }
    window.MediaRecorder = Gravador;
  }
}

async function abrir(comReconhecimento, fila, pedidos) {
  const pag = await (await navegador.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const errosDaPagina = [];
  pag.on('pageerror', (e) => errosDaPagina.push(e.message));
  await pag.addInitScript(falsos, { comReconhecimento });
  await pag.route('**/api/assistente', async (rota) => {
    const corpo = JSON.parse(rota.request().postData() || '{}');
    pedidos.push(corpo);
    const r = fila.shift() || { texto: 'Certo.', opcoes: [], perfil: {}, plano: null };
    await rota.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ cortado: false, ...r }) });
  });
  await pag.goto('file://' + alvo, { waitUntil: 'load' });
  await pag.waitForTimeout(1800);
  const semConta = pag.locator('button:has-text("usar sem conta")');
  if (await semConta.count() > 0) { await semConta.first().click(); await pag.waitForTimeout(500); }
  const aba = pag.locator('nav button:has-text("Assistente")');
  if (await aba.count()) { await aba.first().click(); await pag.waitForTimeout(600); }
  return { pag, errosDaPagina };
}

const estado = (pag) => pag.evaluate(() => (document.querySelector('[data-teste="estado-voz"]') || {}).innerText || '');
const esperar = async (pag, fn, ms = 6000) => {
  const ate = Date.now() + ms;
  while (Date.now() < ate) { if (await fn()) return true; await pag.waitForTimeout(100); }
  return false;
};

/* ── 1. navegador que reconhece fala ─────────────────────────────────── */
{
  const pedidos = [];
  const fila = [
    { texto: '**Oi!** Vejo que faltam 160 dias.\n\n- A que horas você costuma dormir?', opcoes: ['Antes das 23h', 'Depois da meia-noite'], perfil: {}, plano: null },
    { texto: 'Seis horas é pouco. Dá para deitar às onze?', opcoes: [], perfil: { sono: 'meia-noite às 6h' }, plano: null },
  ];
  const { pag, errosDaPagina } = await abrir(true, fila, pedidos);

  const botao = pag.locator('main button:has-text("Chamada de voz")');
  if (await botao.count() && await botao.first().isEnabled()) ok('a mentoria tem o botão de chamada de voz');
  else falha('não achei o botão de chamada de voz habilitado');
  await botao.first().click();

  await esperar(pag, async () => pedidos.length >= 1);
  const p1 = pedidos[0] || {};
  if (p1.voz === true && p1.modo === 'mentoria') ok('a chamada abre com um pedido marcado como voz');
  else falha('primeiro pedido: ' + JSON.stringify(p1).slice(0, 160));

  await esperar(pag, async () => /Oi!/.test((await pag.evaluate(() => window.__falas)).join(' ')));
  const falado = (await pag.evaluate(() => window.__falas)).join(' ');
  if ((await pag.evaluate(() => window.__falas))[0] === ' ') ok('o toque no botão já destrava a voz (exigência do iPhone)');
  else falha('a voz não foi destravada no toque');
  if (/Oi! Vejo que faltam 160 dias\./.test(falado) && /que horas você costuma dormir/.test(falado)) ok('a resposta é falada em voz alta');
  else falha('falou: ' + falado);
  if (!/\*|^-|\s-\s/.test(falado)) ok('sem asterisco nem marcador de lista lido em voz alta');
  else falha('a voz leu a formatação: ' + falado);

  const ouvindo = await esperar(pag, async () => (await pag.evaluate(() => window.__ouvindo)) && /Ouvindo/i.test(await estado(pag)));
  if (ouvindo) ok('quando ela termina de falar, o microfone abre sozinho');
  else falha('o microfone não abriu depois da fala: ' + await estado(pag));

  if (await pag.locator('[data-teste="chamada-voz"] button:has-text("Depois da meia-noite")').count()) ok('as opções continuam tocáveis durante a chamada');
  else falha('as opções sumiram na chamada');

  await pag.evaluate(() => window.__dizer('durmo à meia-noite e acordo às seis'));
  if (/durmo à meia-noite/.test(await pag.locator('[data-teste="chamada-voz"]').innerText())) ok('o que a pessoa fala aparece como legenda');
  else falha('a legenda não apareceu');
  await esperar(pag, async () => pedidos.length >= 2, 5000);
  const p2 = pedidos[1] || {};
  const ultima = (p2.mensagens || []).slice(-1)[0] || {};
  if (p2.voz === true && ultima.content === 'durmo à meia-noite e acordo às seis') ok('depois de uma pausa, a fala vai sozinha como resposta');
  else falha('segundo pedido: ' + JSON.stringify(p2).slice(0, 200));

  await esperar(pag, async () => /Seis horas é pouco/.test(await pag.evaluate(() => document.querySelector('main').innerText)));
  const t = await pag.evaluate(() => document.querySelector('main').innerText);
  if (/durmo à meia-noite e acordo às seis/.test(t) && /Seis horas é pouco/.test(t)) ok('a conversa falada fica escrita na mesma conversa');
  else falha('a conversa da chamada não ficou registrada');
  await pag.waitForTimeout(1900);
  const d = await pag.evaluate(() => JSON.parse(localStorage.getItem('cadencia:v3')));
  if (d && d.mentoria && d.mentoria.perfil && d.mentoria.perfil.sono) ok('e o que ela descobre por voz vai para o perfil, igual');
  else falha('o perfil não guardou o que foi dito por voz');

  /* sem largura sobrando no celular, com a chamada aberta */
  await pag.setViewportSize({ width: 390, height: 844 });
  await pag.waitForTimeout(400);
  const largo = await pag.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (!largo) ok('no celular, a tela da chamada cabe sem vazar para o lado');
  else falha('a tela da chamada passou da largura do celular');
  if (process.env.CAPTURA_VOZ) await pag.locator('[data-teste="chamada-voz"]').screenshot({ path: process.env.CAPTURA_VOZ }).catch(() => {});
  await pag.setViewportSize({ width: 1280, height: 900 });
  await pag.waitForTimeout(300);

  const cancelAntes = await pag.evaluate(() => window.__cancelou);
  await pag.locator('[data-teste="chamada-voz"] button:has-text("Encerrar")').first().click();
  await pag.waitForTimeout(300);
  if (!(await pag.locator('[data-teste="chamada-voz"]').count()) && await pag.locator('main textarea').isVisible()) ok('encerrar fecha a chamada e volta a caixa de texto');
  else falha('a chamada não fechou');
  if (await pag.evaluate(() => window.__cancelou) > cancelAntes && !(await pag.evaluate(() => window.__ouvindo))) ok('e cala a voz e desliga o microfone');
  else falha('encerrar deixou voz ou microfone ligados');

  if (!errosDaPagina.length) ok('nenhum erro de JavaScript na chamada');
  else falha('erros: ' + errosDaPagina.slice(0, 3).join(' | '));
  await pag.context().close();
}

/* ── 2. navegador sem reconhecimento: grava e manda o áudio ──────────── */
{
  const pedidos = [];
  const fila = [
    { texto: 'Oi! Quais são os seus horários livres?', opcoes: [], perfil: {}, plano: null },
    { texto: 'Anotei as noites. E no sábado?', opcoes: [], perfil: { horarios: 'seg a sex 19h às 22h' }, plano: null, ouvi: 'estudo de segunda a sexta das sete às dez' },
  ];
  const { pag, errosDaPagina } = await abrir(false, fila, pedidos);
  const botao = pag.locator('main button:has-text("Chamada de voz")');
  if (await botao.count() && await botao.first().isEnabled()) ok('sem reconhecimento no navegador, a chamada continua disponível (gravando)');
  else falha('sem reconhecimento, o botão sumiu ou ficou desligado');
  await botao.first().click();
  const gravando = await esperar(pag, async () => pag.evaluate(() => window.__gravando === true));
  if (gravando) ok('depois da fala dela, começa a gravar');
  else falha('não começou a gravar: ' + await estado(pag));
  await pag.locator('[data-teste="chamada-voz"] button:has-text("Terminei de falar")').first().click();
  await esperar(pag, async () => pedidos.length >= 2);
  const p2 = pedidos[1] || {};
  if (p2.audio && p2.audio.tipo === 'audio/webm' && p2.audio.dados.length > 1000 && p2.voz) ok('"terminei de falar" manda a fala gravada, em áudio, marcada como voz');
  else falha('pedido com áudio: ' + JSON.stringify(p2).slice(0, 160));
  await esperar(pag, async () => /E no sábado/.test(await pag.evaluate(() => document.querySelector('main').innerText)));
  const t = await pag.evaluate(() => document.querySelector('main').innerText);
  if (/estudo de segunda a sexta das sete às dez/.test(t) && !/🎤 …/.test(t)) ok('o que o servidor entendeu do áudio aparece como a fala da pessoa');
  else falha('a transcrição não substituiu o marcador: ' + t.slice(-300));
  if (!errosDaPagina.length) ok('nenhum erro de JavaScript no caminho da gravação');
  else falha('erros: ' + errosDaPagina.slice(0, 3).join(' | '));
  await pag.context().close();
}

await navegador.close();
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
