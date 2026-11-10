/* A assistente por voz (Gemini Live) na tela, com Google e microfone de mentira.
 *
 * O que se confere é o CICLO no navegador de verdade: o botão só aparece
 * para quem está logado; o toque abre a sessão pela rota, conecta no
 * endereço que a rota devolveu, manda o setup com o modelo que ela
 * devolveu, ela se apresenta (sem a vez escondida aparecer como fala da
 * pessoa), o microfone manda áudio a 16 mil, o botão de microfone
 * desliga e religa, o texto digitado vai como vez completa e volta com
 * legenda, interromper limpa a fila, e encerrar fecha tudo. E a tela diz
 * o tempo inteiro que é uma inteligência artificial.
 *
 * O WebSocket é um de mentira, injetado na página: responde setupComplete,
 * e a cada vez da pessoa manda legenda, um pedaço de áudio e o fim da vez.
 * O microfone é o aparelho falso do Chromium.
 *
 *   node testar-assistente-voz-tela.mjs [arquivo.html]
 */
import { chromium } from 'playwright';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { servirSolto } from './servir-teste.mjs';

const alvo = path.resolve(process.argv[2] || 'teste.html');
if (!fs.existsSync(alvo)) { console.error('não achei', alvo); process.exit(1); }
const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

const FB_APP = 'export function initializeApp(c) { return { c }; }';
const fbAuth = (logado) => `
const user = ${logado ? "{ uid: 'uid-teste', email: 'teste@exemplo.com', displayName: 'Teste', getIdToken: async () => 'token-teste' }" : 'null'};
export function getAuth() { return { currentUser: user }; }
export function onAuthStateChanged(a, cb) { setTimeout(() => cb(user), 30); return () => {}; }
export async function setPersistence() {}
export const browserLocalPersistence = {}; export const browserSessionPersistence = {};
export async function signOut() {} export async function updateProfile() {}
export async function signInWithEmailAndPassword() { return { user }; }
export async function createUserWithEmailAndPassword() { return { user }; }
export async function sendPasswordResetEmail() {}
export class GoogleAuthProvider { addScope() {} setCustomParameters() {} }
export async function signInWithPopup() { return { user }; }
export async function signInWithRedirect() {} export async function getRedirectResult() { return null; }`;
const FB_STORE = `
export function getFirestore() { return {}; }
export function doc(db, ...p) { return { path: p.join('/') }; }
export async function setDoc() {}
export async function getDoc() { return { exists: () => false, data: () => ({}) }; }
export function onSnapshot(ref, a, b) {
  const cb = typeof a === 'function' ? a : b;
  setTimeout(() => cb({ exists: () => false, metadata: { fromCache: false }, data: () => ({}) }), 40);
  return () => {};
}`;

/* O Gemini de mentira, dentro da página. */
function falsos() {
  try {
    localStorage.setItem('cm-sem-pergunta-faculdade', '1');
    localStorage.setItem('cadencia:v3:convite-notificacoes-aparelho', 'teste');
    if (!localStorage.getItem('cadencia:v3')) localStorage.setItem('cadencia:v3', JSON.stringify({ profile: { name: 'Teste', onboarded: true, examDate: '2027-03-10' }, theme: 'dark', marks: { 'epidemiologia-estudos-epidemiologicos': { aula: true, date: '2026-01-10' } } }));
  } catch (e) { /* noop */ }
  window.__wavTocados = 0;
  const playOriginal = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { if (/^blob:/.test(this.src)) window.__wavTocados += 1; return playOriginal.apply(this, arguments); };
  window.__ws = [];
  window.__enviado = [];
  const silencio = btoa(String.fromCharCode.apply(null, new Uint8Array(4800)));
  class WsFalso {
    constructor(url) {
      this.url = url; this.readyState = 0; window.__ws.push(this);
      setTimeout(() => { this.readyState = 1; if (this.onopen) this.onopen(); }, 10);
    }
    manda(obj) { if (this.onmessage) this.onmessage({ data: JSON.stringify(obj) }); }
    send(s) {
      const m = JSON.parse(s);
      window.__enviado.push(m);
      if (m.setup) setTimeout(() => this.manda({ setupComplete: {} }), 10);
      if (m.clientContent && /^mentoria:/.test(m.clientContent.turns[0].parts[0].text)) {
        setTimeout(() => this.manda({ toolCall: { functionCalls: [
          { id: 'm1', name: 'guardar_no_perfil', args: { campo: 'sono', valor: 'dorme à meia-noite' } },
          { id: 'm2', name: 'montar_plano', args: {} },
        ] } }), 30);
        return;
      }
      if (m.clientContent && /registra/.test(m.clientContent.turns[0].parts[0].text)) {
        setTimeout(() => this.manda({ toolCall: { functionCalls: [
          { id: 'f1', name: 'registrar_sessao', args: { materia: 'pneumonia', tipo: 'Questões', minutos: 40, questoes: 30, acertos: 24 } },
          { id: 'f2', name: 'adicionar_pendencia', args: { texto: 'refazer as questões de pneumonia' } },
          { id: 'f3', name: 'atualizar_item_do_plano', args: { titulo: 'cardio', situacao: 'feito' } },
          { id: 'f4', name: 'registrar_revisao', args: { aula: 'estudos epidemiológicos', como_foi: 'facil' } },
        ] } }), 30);
        return;
      }
      if (m.clientContent) {
        const t = m.clientContent.turns[0].parts[0].text;
        setTimeout(() => {
          this.manda({ serverContent: { outputTranscription: { text: /apresente/.test(t) ? 'Oi! Eu sou a assistente virtual do Cadência Med. ' : 'O plano custa trinta e nove reais por mês. ' } } });
          this.manda({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: silencio } }] } } });
          this.manda({ serverContent: { turnComplete: true } });
        }, 40);
      }
    }
    close(code) { this.readyState = 3; if (this.onclose) this.onclose({ code: code || 1000 }); }
  }
  WsFalso.CONNECTING = 0; WsFalso.OPEN = 1; WsFalso.CLOSING = 2; WsFalso.CLOSED = 3;
  window.WebSocket = WsFalso;
}

const servidor = http.createServer((req, res) => { if (servirSolto(req, res)) return;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(fs.readFileSync(alvo));
});
await new Promise((ok2) => servidor.listen(0, '127.0.0.1', ok2));
const ENDERECO = `http://127.0.0.1:${servidor.address().port}/`;
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const navegador = await chromium.launch({
  args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}),
});
const errosDaPagina = [];
const btoaNode = (u8) => Buffer.from(u8).toString('base64');
const RECURSOS = { assistente: true, cartoes: true, revisoes: true, provas: true, cronograma: true, rotina: true, amigos: true, metas: true, desempenho: true, simulados: true, progresso: true, treino: false };

async function abrir({ logado, largura = 1280, respostaVoz }) {
  const ctx = await navegador.newContext({ viewport: { width: largura, height: largura < 600 ? 844 : 900 }, locale: 'pt-BR', permissions: ['microphone'] });
  await ctx.addInitScript(falsos);
  await ctx.route('https://www.gstatic.com/firebasejs/**', (rr) => {
    const u = rr.request().url();
    rr.fulfill({ status: 200, contentType: 'text/javascript', body: u.endsWith('firebase-app.js') ? FB_APP : u.endsWith('firebase-auth.js') ? fbAuth(logado) : FB_STORE });
  });
  await ctx.route('https://accounts.google.com/gsi/client', (rr) => rr.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  const pedidosVoz = [];
  const pedidosAssistente = [];
  await ctx.route('**/api/**', (rr) => {
    const u = rr.request().url();
    if (u.includes('/api/plano')) return rr.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, pro: true, plano: 'anual', validoAte: Date.now() + 86400000, recursos: RECURSOS }) });
    if (u.includes('/api/assistente')) {
      pedidosAssistente.push(JSON.parse(rr.request().postData() || '{}'));
      return rr.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ texto: 'Oi, Zé! Vamos montar a sua semana. A que horas você costuma dormir?', opcoes: [], perfil: {}, plano: null, cortado: false }) });
    }
    if (u.includes('/api/voz')) {
      const corpoVoz = JSON.parse(rr.request().postData() || '{}');
      pedidosVoz.push(corpoVoz);
      if (corpoVoz.acao === 'falar') {
        return rr.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, audio: btoaNode(new Uint8Array(9600)), taxa: 24000, voz: 'Zephyr' }) });
      }
      const r = respostaVoz || { status: 200, corpo: { ok: true, url: 'wss://gemini.falso/ws?access_token=auth_tokens%2Fabc', setup: { model: 'models/gemini-falso-native-audio' }, modelo: 'gemini-falso-native-audio', voz: 'Zephyr', entrada: { taxa: 16000 }, saida: { taxa: 24000 } } };
      return rr.fulfill({ status: r.status, contentType: 'application/json', body: JSON.stringify(r.corpo) });
    }
    return rr.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  const pag = await ctx.newPage();
  pag.on('pageerror', (e) => errosDaPagina.push(e.message));
  await pag.goto(ENDERECO, { waitUntil: 'load' });
  await pag.waitForTimeout(1800);
  return { ctx, pag, pedidosVoz, pedidosAssistente };
}
const esperar = async (pag, fn, ms = 6000) => {
  const ate = Date.now() + ms;
  while (Date.now() < ate) { if (await fn()) return true; await pag.waitForTimeout(100); }
  return false;
};
const estado = (pag) => pag.evaluate(() => (document.querySelector('[data-teste="estado-assistente-voz"]') || {}).innerText || '');
const painel = (pag) => pag.evaluate(() => (document.querySelector('[data-teste="assistente-voz"]') || {}).innerText || '');
const enviados = (pag) => pag.evaluate(() => window.__enviado);

/* ── deslogado: sem botão ───────────────────────────────────────────── */
{
  const { ctx, pag } = await abrir({ logado: false });
  if (!(await pag.locator('[data-teste="abrir-assistente-voz"]').count())) ok('sem conta, o botão da assistente por voz não aparece');
  else falha('botão aparece deslogado');
  await ctx.close();
}

/* ── o ciclo inteiro, no computador ─────────────────────────────────── */
{
  const { ctx, pag, pedidosVoz } = await abrir({ logado: true });
  const botao = pag.locator('[data-teste="abrir-assistente-voz"]');
  if (await botao.count()) ok('logado, o botão flutuante aparece');
  else falha('botão não apareceu logado');
  await botao.click();

  await esperar(pag, async () => pedidosVoz.length >= 1);
  const p = pedidosVoz[0] || {};
  if (p.token === 'token-teste' && p.acao === 'sessao' && p.contexto && p.contexto.nome === 'Teste' && p.contexto.prova === '2027-03-10') ok('a rota recebe o token da conta e o contexto da pessoa (nome e prova)');
  else falha('pedido à rota: ' + JSON.stringify(p));

  const conectou = await esperar(pag, async () => (await pag.evaluate(() => window.__ws.length)) >= 1);
  const url = conectou ? await pag.evaluate(() => window.__ws[0].url) : '';
  if (/gemini\.falso\/ws\?access_token=auth_tokens%2Fabc/.test(url)) ok('conecta exatamente no endereço com o token que a rota devolveu');
  else falha('url do websocket: ' + url);

  await esperar(pag, async () => (await enviados(pag)).length >= 2);
  const e = await enviados(pag);
  if (e[0] && e[0].setup && e[0].setup.model === 'models/gemini-falso-native-audio' && Object.keys(e[0].setup).length === 1) ok('a primeira mensagem é o setup só com o modelo que a rota mandou');
  else falha('setup enviado: ' + JSON.stringify(e[0]));
  const intro = e.find((m) => m.clientContent);
  if (intro && /apresente/.test(intro.clientContent.turns[0].parts[0].text)) ok('depois do setup, pede que ela se apresente');
  else falha('sem pedido de apresentação: ' + JSON.stringify(e.slice(0, 3)));

  await esperar(pag, async () => /assistente virtual do Cadência Med/.test(await painel(pag)));
  const t = await painel(pag);
  if (/Oi! Eu sou a assistente virtual do Cadência Med/.test(t)) ok('a apresentação dela aparece como legenda');
  else falha('legenda da apresentação não apareceu: ' + t.slice(0, 200));
  if (!/apresente em uma frase/.test(t)) ok('a vez escondida (o pedido de apresentação) não aparece como fala da pessoa');
  else falha('o pedido escondido vazou na conversa');
  if (/inteligência artificial do Cadência Med, não é uma pessoa/.test(t)) ok('a tela diz o tempo inteiro que é uma inteligência artificial');
  else falha('sem aviso de IA');

  const ouvindo = await esperar(pag, async () => /Ouvindo/.test(await estado(pag)));
  if (ouvindo) ok('depois da apresentação, fica ouvindo com o microfone aberto');
  else falha('estado depois da fala: ' + await estado(pag));

  const mandouAudio = await esperar(pag, async () => (await enviados(pag)).some((m) => m.realtimeInput && m.realtimeInput.audio), 5000);
  const audio = (await enviados(pag)).find((m) => m.realtimeInput && m.realtimeInput.audio);
  if (mandouAudio && audio.realtimeInput.audio.mimeType === 'audio/pcm;rate=16000' && audio.realtimeInput.audio.data.length > 100) ok('o microfone manda áudio PCM a 16 mil, em pedaços');
  else falha('áudio do microfone: ' + JSON.stringify(audio || {}).slice(0, 120));

  /* desligar e religar o microfone */
  await pag.locator('[data-teste="assistente-voz"] button:has-text("Microfone ligado")').click();
  await pag.waitForTimeout(300);
  if (/Microfone desligado/.test(await estado(pag)) && (await enviados(pag)).some((m) => m.realtimeInput && m.realtimeInput.audioStreamEnd)) ok('desligar o microfone muda o estado e avisa o servidor (audioStreamEnd)');
  else falha('desligar microfone: ' + await estado(pag));
  const antes = (await enviados(pag)).filter((m) => m.realtimeInput && m.realtimeInput.audio).length;
  await pag.waitForTimeout(600);
  const depois = (await enviados(pag)).filter((m) => m.realtimeInput && m.realtimeInput.audio).length;
  if (depois === antes) ok('com o microfone desligado, nenhum áudio sai');
  else falha('áudio continuou saindo com o microfone desligado');
  await pag.locator('[data-teste="assistente-voz"] button:has-text("Ligar microfone")').click();
  await pag.waitForTimeout(300);
  if (/Ouvindo/.test(await estado(pag))) ok('religar o microfone volta a ouvir');
  else falha('religar: ' + await estado(pag));

  /* conversar por texto */
  await pag.locator('[data-teste="texto-assistente-voz"]').fill('quanto custa o plano?');
  await pag.keyboard.press('Enter');
  await esperar(pag, async () => /trinta e nove reais/.test(await painel(pag)));
  const t2 = await painel(pag);
  const vezTexto = (await enviados(pag)).find((m) => m.clientContent && /quanto custa/.test(m.clientContent.turns[0].parts[0].text));
  if (vezTexto && vezTexto.clientContent.turnComplete === true) ok('o texto digitado vai como vez completa da pessoa');
  else falha('texto não foi enviado');
  if (/quanto custa o plano\?/.test(t2) && /trinta e nove reais por mês/.test(t2)) ok('a pergunta escrita e a resposta falada ficam na conversa');
  else falha('conversa por texto: ' + t2.slice(0, 300));

  /* encerrar */
  await pag.locator('[data-teste="assistente-voz"] button:has-text("Encerrar")').click();
  await pag.waitForTimeout(300);
  const fechado = await pag.evaluate(() => window.__ws[0].readyState);
  if (fechado === 3 && !(await pag.locator('[data-teste="assistente-voz"]').count()) && await pag.locator('[data-teste="abrir-assistente-voz"]').count()) ok('encerrar fecha o WebSocket, fecha o painel e devolve o botão');
  else falha('encerrar: readyState=' + fechado);
  await ctx.close();
}

/* ── a mentora registra no painel o que a pessoa contou ──────────────── */
{
  const { ctx, pag, pedidosVoz } = await abrir({ logado: true });
  await pag.locator('[data-teste="abrir-assistente-voz"]').click();
  await esperar(pag, async () => /Ouvindo/.test(await estado(pag)));
  const ctxVoz = (pedidosVoz[0] || {}).contexto || {};
  if (/PROGRESSO GERAL/.test(ctxVoz.resumo || '') && /REVISÕES ATRASADAS/.test(ctxVoz.resumo || '')) ok('a mentora recebe a situação do estudo (o mesmo resumo do Assistente) ao abrir a conversa');
  else falha('resumo para a mentora: ' + JSON.stringify(ctxVoz).slice(0, 300));
  await pag.locator('[data-teste="assistente-voz"] input[placeholder="Ou escreva aqui…"]').fill('registra 30 questões de pneumonia');
  await pag.locator('[data-teste="assistente-voz"] button[aria-label="Enviar"]').click();
  await esperar(pag, async () => (await enviados(pag)).some((m) => m.toolResponse));
  const resp = ((await enviados(pag)).find((m) => m.toolResponse) || {}).toolResponse || {};
  const fr = resp.functionResponses || [];
  if (fr.length === 4 && fr[0].id === 'f1' && fr[0].response.ok && fr[1].response.ok) ok('as ferramentas pedidas pela mentora voltam respondidas, uma por pedido, com o mesmo id');
  else falha('toolResponse: ' + JSON.stringify(resp));
  if (fr[2] && fr[2].response.ok === false && /Meu plano/.test(fr[2].response.resultado)) ok('sem plano mandado, o item do plano volta recusado com o motivo (ela não finge que marcou)');
  else falha('item do plano sem plano: ' + JSON.stringify(fr[2]));
  await pag.waitForTimeout(1900);
  const d = await pag.evaluate(() => JSON.parse(localStorage.getItem('cadencia:v3') || '{}'));
  const sess = (d.sessions || []).find((x) => x.questions === 30);
  if (sess && sess.correct === 24 && sess.minutes === 40 && sess.kind === 'Questões') ok('a sessão contada por voz entra no painel com questões, acertos e tempo');
  else falha('sessão por voz: ' + JSON.stringify(d.sessions));
  const rv = (d.reviews || {})['epidemiologia-estudos-epidemiologicos'] || {};
  if (fr[3] && fr[3].id === 'f4' && fr[3].response.ok && /saiu da fila/.test(fr[3].response.resultado) && rv.recuperado && Object.keys(rv.done || {}).length >= 1) ok('a revisão contada por voz recupera a aula na escada (uma revisão, e ela sai da fila)');
  else falha('revisão por voz: ' + JSON.stringify(fr[3]) + ' ' + JSON.stringify(rv));
  if ((d.tasks || []).some((t) => /refazer as questões de pneumonia/.test(t.text))) ok('e a pendência pedida por voz aparece em Hoje');
  else falha('pendência por voz: ' + JSON.stringify(d.tasks));
  await ctx.close();
}

/* ── a chamada da Mentoria é a mesma conversa ao vivo, em modo mentoria ── */
{
  const { ctx, pag, pedidosVoz, pedidosAssistente } = await abrir({ logado: true });
  await pag.evaluate(() => localStorage.setItem('cadencia:v3:assistente-modo', 'mentoria'));
  await pag.reload({ waitUntil: 'load' });
  await pag.waitForTimeout(1800);
  const menu = pag.locator('button[aria-label="Abrir menu"]').first();
  if (await menu.count() && await menu.isVisible()) { await menu.click(); await pag.waitForTimeout(300); }
  await pag.locator('nav button:has-text("Assistente")').first().click();
  await pag.waitForTimeout(700);
  const botao = pag.locator('main button:has-text("Chamada de voz")');
  if (await botao.count()) {
    await botao.first().click();
    await esperar(pag, async () => /Ouvindo/.test(await estado(pag)), 8000);
    const sessaoVoz = pedidosVoz.find((p) => p.acao === 'sessao') || {};
    if (sessaoVoz.contexto && sessaoVoz.contexto.modo === 'mentoria' && /PROGRESSO GERAL/.test(sessaoVoz.contexto.resumo || '')) ok('a Chamada de voz da Mentoria abre a conversa ao vivo (a mesma voz da assistente), em modo mentoria e com o painel');
    else falha('sessão da mentoria: ' + JSON.stringify(sessaoVoz).slice(0, 300));
    if (/Mentoria por voz/.test(await painel(pag)) && !pedidosVoz.some((p) => p.acao === 'falar')) ok('o painel diz que é a Mentoria por voz, e nada passa pela fala antiga');
    else falha('painel da mentoria: ' + (await painel(pag)).slice(0, 200));
    const intro = (await enviados(pag)).find((m) => m.clientContent);
    if (intro && /mentoria de estudo/.test(intro.clientContent.turns[0].parts[0].text)) ok('ela começa pela entrevista da mentoria');
    else falha('início da mentoria: ' + JSON.stringify(intro));
    /* ela guarda no perfil e pede o plano */
    await pag.locator('[data-teste="assistente-voz"] input[placeholder="Ou escreva aqui…"]').fill('mentoria: durmo meia-noite');
    await pag.locator('[data-teste="assistente-voz"] button[aria-label="Enviar"]').click();
    await esperar(pag, async () => (await enviados(pag)).filter((m) => m.toolResponse).length >= 1, 9000);
    await pag.waitForTimeout(1900);
    const d = await pag.evaluate(() => JSON.parse(localStorage.getItem('cadencia:v3') || '{}'));
    if (d.mentoria && d.mentoria.perfil && /meia-noite/.test(d.mentoria.perfil.sono || '')) ok('o que a pessoa conta por voz vai para o perfil da mentoria');
    else falha('perfil por voz: ' + JSON.stringify(d.mentoria));
    const monta = pedidosAssistente.find((p) => p.modo === 'mentoria' && /Monte agora o meu plano/.test(JSON.stringify(p.mensagens || [])));
    if (monta && monta.perfil && /meia-noite/.test(monta.perfil.sono || '')) ok('montar o plano chama a mentoria escrita, com o perfil que a voz guardou');
    else falha('montar plano: ' + JSON.stringify(pedidosAssistente).slice(0, 300));
    const resp = (await enviados(pag)).filter((m) => m.toolResponse).pop();
    const fr = (resp && resp.toolResponse.functionResponses) || [];
    if (fr.length === 2 && fr.every((r) => r.id)) ok('as duas ferramentas da entrevista voltam respondidas para ela');
    else falha('respostas da entrevista: ' + JSON.stringify(resp));
    await pag.locator('[data-teste="assistente-voz"] button:has-text("Encerrar")').click();
    await pag.waitForTimeout(400);
    const conversa = await pag.evaluate(() => JSON.parse(localStorage.getItem('cadencia:v3:mentoria-conversa') || '[]'));
    if (conversa.some((m) => /durmo meia-noite/.test(m.texto))) ok('ao encerrar, o que foi falado entra na conversa escrita da mentoria');
    else falha('conversa da mentoria depois da ligação: ' + JSON.stringify(conversa).slice(0, 300));
  } else falha('não achei a chamada de voz da Mentoria');
  await ctx.close();
}

/* ── a rota recusa ──────────────────────────────────────────────────── */
{
  const { ctx, pag } = await abrir({ logado: true, respostaVoz: { status: 403, corpo: { erro: 'Esta função faz parte do plano completo.' } } });
  await pag.locator('[data-teste="abrir-assistente-voz"]').click();
  await esperar(pag, async () => /plano completo/.test(await painel(pag)));
  if (/plano completo/.test(await painel(pag)) && /Não deu para conectar/.test(await estado(pag)) && await pag.locator('[data-teste="assistente-voz"] button:has-text("Ligar de novo")').count()) ok('quando a rota recusa, o motivo aparece e dá para tentar de novo');
  else falha('recusa: ' + await painel(pag));
  await ctx.close();
}

/* ── no celular ─────────────────────────────────────────────────────── */
{
  const { ctx, pag } = await abrir({ logado: true, largura: 390 });
  await pag.locator('[data-teste="abrir-assistente-voz"]').click();
  await esperar(pag, async () => /Ouvindo/.test(await estado(pag)));
  const caixa = await pag.locator('[data-teste="assistente-voz"]').boundingBox();
  const larg = await pag.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  if (caixa && caixa.x >= 0 && caixa.x + caixa.width <= 390 && larg[0] === larg[1]) ok('no celular o painel cabe na tela, sem rolagem lateral');
  else falha('celular: ' + JSON.stringify(caixa) + ' ' + larg.join('/'));
  if (caixa && caixa.y + caixa.height >= 840) ok('e fica colado embaixo, como uma folha que sobe');
  else falha('painel do celular não está embaixo: ' + JSON.stringify(caixa));
  await ctx.close();
}

await navegador.close();
servidor.close();
if (!errosDaPagina.length) ok('nenhum erro de JavaScript na página');
else falha('erros: ' + errosDaPagina.slice(0, 3).join(' | '));
console.log(passos.join('\n'));
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
