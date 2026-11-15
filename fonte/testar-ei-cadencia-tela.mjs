/* "Ei, Cadência": chamar a mentora sem tocar, a barrinha do topo, os
 * comandos na tela e a memória (no computador, onde funciona).
 *
 * O reconhecimento de fala e o Gemini são de mentira. O que se confere:
 * - desligado, o site não fica ouvindo; a opção liga no painel e fica
 *   guardada no aparelho;
 * - conversa comum com a palavra "cadência" no meio não chama ninguém;
 * - "Ei, Cadência, abre os cartões" abre a conversa na barrinha do topo,
 *   sem apresentação, com o pedido como primeira fala;
 * - as ferramentas mexem na tela de verdade: abrem a aba, guardam na
 *   memória, concluem a pendência, ligam o Foco, esquecem; aba que a conta
 *   não tem é recusada;
 * - a memória aparece na aba Assistente e vai no contexto da conversa;
 * - fechada a conversa, o site volta a esperar o chamado.
 *
 *   node testar-ei-cadencia-tela.mjs [arquivo.html]
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
      if (m.clientContent && /abre os cart/.test(m.clientContent.turns[0].parts[0].text)) {
        setTimeout(() => this.manda({ toolCall: { functionCalls: [
          { id: 'j1', name: 'abrir_aba', args: { aba: 'cartoes' } },
          { id: 'j2', name: 'lembrar', args: { texto: 'meu internato é no HC, plantão às terças' } },
          { id: 'j3', name: 'adicionar_pendencia', args: { texto: 'ler o capítulo de sepse' } },
          { id: 'j4', name: 'abrir_aba', args: { aba: 'aba-que-nao-existe' } },
        ] } }), 30);
        return;
      }
      if (m.clientContent && /terminei a sepse/.test(m.clientContent.turns[0].parts[0].text)) {
        setTimeout(() => this.manda({ toolCall: { functionCalls: [
          { id: 'k1', name: 'concluir_pendencia', args: { texto: 'capítulo de sepse' } },
          { id: 'k2', name: 'controlar_foco', args: { acao: 'comecar' } },
          { id: 'k3', name: 'esquecer', args: { texto: 'internato no HC' } },
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
  /* O reconhecimento de fala do navegador, de mentira: o teste "fala". */
  window.__recs = [];
  class RecFalso {
    constructor() { this.ligado = false; window.__recs.push(this); }
    start() { this.ligado = true; setTimeout(() => { if (this.onstart) this.onstart(); }, 5); }
    abort() { this.ligado = false; }
    stop() { this.ligado = false; if (this.onend) this.onend(); }
    emitir(texto, final) {
      if (!this.ligado || !this.onresult) return false;
      this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: texto }], { isFinal: !!final })] });
      return true;
    }
  }
  window.SpeechRecognition = RecFalso; window.webkitSpeechRecognition = RecFalso;
  window.__falar = (texto, final) => window.__recs.filter((r) => r.ligado).map((r) => r.emitir(texto, final)).some(Boolean);
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


const guardado = (pag) => pag.evaluate(() => JSON.parse(localStorage.getItem('cadencia:v3') || '{}'));
{
  const { ctx, pag, pedidosVoz } = await abrir({ logado: true });
  const escutando = () => pag.evaluate(() => window.__recs.some((r) => r.ligado));
  const marca = async () => (await pag.locator('[data-teste="ei-cadencia-ouvindo"]').count()) > 0;

  if (!(await escutando()) && !(await marca())) ok('sem ligar a opção, o site não fica ouvindo');
  else falha('já estava ouvindo sem a opção ligada');

  /* liga a opção no painel e fecha a conversa */
  await pag.locator('[data-teste="abrir-assistente-voz"]').click();
  await esperar(pag, async () => /Ouvindo|Pensando|Falando/.test(await estado(pag)), 8000);
  await pag.locator('[data-teste="ei-cadencia"]').click();
  if (await pag.evaluate(() => localStorage.getItem('cadencia:v3:ei-cadencia') === '1')) ok('a opção "Ei, Cadência" liga no painel e fica guardada neste aparelho');
  else falha('a opção não ficou guardada');
  if (!(await escutando())) ok('com a conversa aberta, o chamado fica desligado (ela não ouve a si mesma)');
  else falha('ouvindo o chamado com a conversa aberta');
  await pag.locator('[data-teste="assistente-voz"] button[aria-label="Fechar"]').click();
  await esperar(pag, async () => (await escutando()) && (await marca()));
  if ((await escutando()) && (await marca())) ok('fechada a conversa, o site passa a esperar o chamado, com a marca no botão');
  else falha('não ficou esperando o chamado');

  const sessoesAntes = pedidosVoz.filter((p) => p.acao === 'sessao').length;
  await pag.evaluate(() => { window.__falar('hoje eu estudei frequência e cadência do marca-passo', true); });
  await pag.waitForTimeout(700);
  if (pedidosVoz.filter((p) => p.acao === 'sessao').length === sessoesAntes && !(await pag.locator('[data-teste="ilha-voz"]').count())) ok('a palavra "cadência" no meio de uma frase comum não chama a mentora');
  else falha('frase comum abriu a conversa');

  /* o chamado, com o pedido na mesma frase (primeiro parcial, depois a frase fechada) */
  const enviadosAntes = (await enviados(pag)).length;
  await pag.evaluate(() => { window.__falar('ei cadência abre os', false); });
  await pag.waitForTimeout(200);
  await pag.evaluate(() => { window.__falar('Ei, Cadência, abre os cartões', true); });
  await esperar(pag, async () => (await pag.locator('[data-teste="ilha-voz"]').count()) > 0, 8000);
  if (await pag.locator('[data-teste="ilha-voz"]').count() && !(await pag.locator('[data-teste="assistente-voz"]').count())) ok('"Ei, Cadência" abre a conversa na barrinha do topo, e não no painel');
  else falha('a barrinha não apareceu');
  await esperar(pag, async () => (await enviados(pag)).slice(enviadosAntes).some((m) => m.toolResponse), 9000);
  const novos = (await enviados(pag)).slice(enviadosAntes);
  const textos = novos.filter((m) => m.clientContent).map((m) => m.clientContent.turns[0].parts[0].text);
  if (textos.length === 1 && textos[0] === 'abre os cartões' && !textos.some((t) => /apresente/.test(t))) ok('o pedido da mesma frase vira a primeira fala, sem apresentação');
  else falha('primeira fala: ' + JSON.stringify(textos));
  if (pedidosVoz.filter((p) => p.acao === 'sessao').length === sessoesAntes + 1) ok('uma sessão só é aberta, e só depois do chamado');
  else falha('sessões abertas: ' + pedidosVoz.filter((p) => p.acao === 'sessao').length);

  const fr = ((novos.find((m) => m.toolResponse) || {}).toolResponse || {}).functionResponses || [];
  const topoDaAba = () => pag.evaluate(() => (document.querySelector('.capa-aba') || document.querySelector('main')).innerText.slice(0, 200));
  await esperar(pag, async () => /CARTÕES/i.test(await topoDaAba()));
  const topo = await topoDaAba();
  if (fr[0] && fr[0].response.ok && /Cartões aberta/.test(fr[0].response.resultado) && /CARTÕES/i.test(topo)) ok('a mentora abre a aba pedida de verdade');
  else falha('abrir aba: ' + JSON.stringify(fr[0]) + ' / ' + topo.slice(0, 80));
  if (fr[3] && fr[3].response.ok === false) ok('aba que não existe para a conta é recusada, sem quebrar');
  else falha('aba inexistente: ' + JSON.stringify(fr[3]));
  await pag.waitForTimeout(2100);
  let d = await guardado(pag);
  if (fr[1] && fr[1].response.ok && (d.lembrancas || []).some((x) => /internato é no HC/.test(x.texto))) ok('o que ela pediu para lembrar fica na memória da conta');
  else falha('lembrar: ' + JSON.stringify(fr[1]) + ' ' + JSON.stringify(d.lembrancas));

  /* segunda fala, pela conversa aberta: conclui, liga o foco, esquece */
  await pag.locator('[data-teste="ilha-voz"] button[aria-label="Abrir a conversa inteira"]').click();
  await pag.locator('[data-teste="assistente-voz"] input[placeholder="Ou escreva aqui…"]').fill('terminei a sepse, bora estudar');
  await pag.locator('[data-teste="assistente-voz"] input[placeholder="Ou escreva aqui…"]').press('Enter');
  await esperar(pag, async () => (await enviados(pag)).filter((m) => m.toolResponse).length >= 2, 9000);
  const fr2 = ((await enviados(pag)).filter((m) => m.toolResponse).pop().toolResponse || {}).functionResponses || [];
  await pag.waitForTimeout(2100);
  d = await guardado(pag);
  if (fr2[0] && fr2[0].response.ok && (d.tasks || []).some((t) => /sepse/.test(t.text) && t.done)) ok('a pendência que ela disse que fez fica concluída');
  else falha('concluir: ' + JSON.stringify(fr2[0]) + ' ' + JSON.stringify(d.tasks));
  const topo2 = await topoDaAba();
  if (fr2[1] && fr2[1].response.ok && /FOCO/i.test(topo2)) ok('ela liga o cronômetro de Foco e abre a aba');
  else falha('foco: ' + JSON.stringify(fr2[1]) + ' / ' + topo2.slice(0, 80));
  if (fr2[2] && fr2[2].response.ok && !(d.lembrancas || []).length) ok('e esquece a lembrança quando a pessoa pede');
  else falha('esquecer: ' + JSON.stringify(fr2[2]) + ' ' + JSON.stringify(d.lembrancas));

  /* fecha: volta a esperar o chamado */
  await pag.locator('[data-teste="assistente-voz"] button[aria-label="Fechar"]').click();
  await esperar(pag, escutando);
  if (await escutando()) ok('encerrada a conversa, o site volta a esperar o chamado');
  else falha('não voltou a esperar o chamado');

  /* a memória na aba Assistente, e no contexto da próxima conversa */
  await pag.locator('nav button:has-text("Assistente")').first().click();
  await pag.waitForTimeout(600);
  await pag.locator('[data-teste="memoria-mentora"] input').fill('minha prova é em março');
  await pag.locator('[data-teste="memoria-mentora"] input').press('Enter');
  await esperar(pag, async () => /minha prova é em março/.test(await pag.locator('[data-teste="memoria-mentora"]').innerText()));
  if (/minha prova é em março/.test(await pag.locator('[data-teste="memoria-mentora"]').innerText())) ok('a memória aparece na aba Assistente, e dá para acrescentar ali');
  else falha('cartão da memória');
  await pag.evaluate(() => { window.__falar('ok cadência', true); });
  await esperar(pag, async () => pedidosVoz.filter((p) => p.acao === 'sessao').length === sessoesAntes + 2, 8000);
  const ultimo = pedidosVoz.filter((p) => p.acao === 'sessao').pop() || {};
  if (/O QUE VOCÊ LEMBRA DESTA PESSOA/.test((ultimo.contexto || {}).resumo || '') && /minha prova é em março/.test(ultimo.contexto.resumo)) ok('e o que está na memória vai no contexto da conversa seguinte');
  else falha('memória no contexto: ' + String((ultimo.contexto || {}).resumo || '').slice(-200));
  await esperar(pag, async () => (await enviados(pag)).some((m) => m.clientContent && /Pode falar/.test(m.clientContent.turns[0].parts[0].text)), 8000);
  if ((await enviados(pag)).some((m) => m.clientContent && /Pode falar/.test(m.clientContent.turns[0].parts[0].text))) ok('chamado sem pedido: ela só responde "pode falar"');
  else falha('chamado sem pedido');

  await ctx.close();
}

if (!errosDaPagina.length) ok('nenhum erro de JavaScript na página');
else falha('erros na página: ' + errosDaPagina.join(' | '));

await navegador.close();
servidor.close();
console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
