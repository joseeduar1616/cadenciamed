/* Faculdade, especialidade e simulados abertos · a tela (Chromium, com o
 * Firebase e o servidor de mentira).
 *
 * O caminho: a janela aparece uma vez; a faculdade se acha pela sigla ou
 * pelo nome sem acento; a lista de especialidades já vem inteira e filtra
 * ao digitar, com mais de uma escolhida; salvar guarda no perfil e grava a
 * faculdade no perfil público; recarregar não mostra a janela de novo;
 * "Agora não" adia só até a próxima entrada; a aba Amigos mostra os colegas da
 * faculdade e convida com um toque; e a aba Simulados mostra as salas
 * abertas, com os simulados postados, e entra sem senha.
 *
 *   node testar-faculdade-tela.mjs [teste.html]
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';

const alvo = path.resolve(process.argv[2] || 'teste.html');
const erros = [];
const ok = (m) => console.log('ok   ' + m);
const falha = (m) => { console.log('FALHA ' + m); erros.push(m); };

const FB_AUTH = `
const user = { uid: 'u', email: localStorage.getItem('teste-email') || 't@e.com', getIdToken: async () => 'tk' };
export function getAuth() { return { currentUser: user }; }
export function onAuthStateChanged(a, cb) { setTimeout(() => cb(user), 30); return () => {}; }
export async function setPersistence() {}
export const browserLocalPersistence = {}; export const browserSessionPersistence = {};
export async function signOut() {} export async function updateProfile() {}
export class GoogleAuthProvider { setCustomParameters() {} }
export async function getRedirectResult() { return null; }`;
/* setDoc anota o que foi gravado, para conferir o perfil público. */
const FB_STORE = `export function getFirestore() { return {}; }
export function doc(db, ...partes) { return { caminho: partes.join('/') }; }
export async function setDoc(ref, dados) { (window.__gravados = window.__gravados || []).push({ caminho: ref.caminho, dados: JSON.parse(JSON.stringify(dados)) }); }
/* a conta ainda não tem nada na nuvem: a janela espera esta resposta */
export function onSnapshot(ref, op, cb) { setTimeout(() => cb({ exists: () => false, metadata: { fromCache: false }, data: () => null }), 300); return () => {}; }`;

const pedidos = [];
let membro = false;
const servidor = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(fs.readFileSync(alvo)); });
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const navegador = await chromium.launch({ args: ['--no-sandbox'], ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}) });
const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => {
  if (location.protocol === 'about:' || sessionStorage.getItem('semeado')) return;
  sessionStorage.setItem('semeado', '1');
  localStorage.setItem('cm-teste-faculdade', '1');
  localStorage.setItem('cadencia:v3:convite-notificacoes-aparelho', 'teste');
  localStorage.setItem('cadencia:v3', JSON.stringify({ profile: { name: 'Ana', onboarded: true, examDate: '2027-03-10' }, tema: { versaoVisual: 2 } }));
});
await ctx.route('https://www.gstatic.com/firebasejs/**', (r) => {
  const u = r.request().url();
  r.fulfill({ status: 200, contentType: 'text/javascript', body: u.endsWith('firebase-app.js') ? 'export function initializeApp(c) { return { c }; }' : u.endsWith('firebase-auth.js') ? FB_AUTH : FB_STORE });
});
await ctx.route('**/api/**', (r) => {
  let corpo = {};
  try { corpo = JSON.parse(r.request().postData() || '{}'); } catch (e) { /* GET */ }
  const url = r.request().url();
  const resp = (j) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) });
  if (url.includes('/api/duplas') || url.includes('/api/salas')) pedidos.push({ rota: url.includes('duplas') ? 'duplas' : 'salas', ...corpo });
  if (url.includes('/api/duplas')) {
    if (corpo.acao === 'colegas') {
      return resp({ ok: true, colegas: [
        { uid: 'uid-caio', nome: 'Caio', foto: '', especialidades: ['Cardiologia'] },
        { uid: 'uid-bia', nome: 'Bia', foto: '', especialidades: ['Psiquiatria'] },
      ] });
    }
    if (corpo.acao === 'convidar-colega') return resp({ ok: true, mensagem: 'Convite enviado. Aparece para a pessoa na aba Amigos.' });
    if (corpo.acao === 'listar') return resp({ ok: true, duplas: [] });
    return resp({ ok: true });
  }
  if (url.includes('/api/salas') && corpo.tipo === 'simulado') {
    if (corpo.acao === 'minhas') return resp({ salas: membro ? [{ slug: 'turma-r1-2027', nome: 'Turma R1 2027', membros: 13 }] : [] });
    if (corpo.acao === 'sim-abertas') {
      return resp({ ok: true, salas: [
        { slug: 'turma-r1-2027', nome: 'Turma R1 2027', pessoas: 12, souMembro: membro, totalSimulados: 2,
          simulados: [{ id: 's1', nome: 'SIMULADO ENARE 1', data: '2026-10-01', total: 100, quantos: 9 }, { id: 's2', nome: 'Prova SUS-SP', data: '2026-09-20', total: 120, quantos: 4 }] },
        { slug: 'r1-ufg', nome: 'R1 UFG', pessoas: 3, souMembro: false, totalSimulados: 0, simulados: [] },
      ] });
    }
    if (corpo.acao === 'sim-participar') { membro = true; return resp({ ok: true, slug: corpo.nome, nome: 'Turma R1 2027', mensagem: 'Você está em "Turma R1 2027".' }); }
    if (corpo.acao === 'sim-listar') return resp({ simulados: [{ id: 's1', nome: 'SIMULADO ENARE 1', data: '2026-10-01', total: 100, quantos: 9, liberado: false, linhas: [], meu: null }] });
    if (corpo.acao === 'ranking') return resp({ sala: { souDono: false } });
    return resp({ ok: true });
  }
  return resp({ ok: true });
});
const pag = await ctx.newPage();
const errosDaPagina = [];
pag.on('pageerror', (e) => errosDaPagina.push(e.message));
await pag.goto(`http://127.0.0.1:${servidor.address().port}/`, { waitUntil: 'load' });
await pag.waitForTimeout(1500);
const foto = async (n) => { if (process.env.CAPTURAS) await pag.screenshot({ path: `${process.env.CAPTURAS}/${n}.png` }); };
const dados = () => pag.evaluate(() => JSON.parse(localStorage.getItem('cadencia:v3') || '{}'));
const janela = pag.locator('[data-teste="pergunta-faculdade"]');

/* ── 1. a janela aparece ─────────────────────────────────────────────── */
if (await janela.isVisible().catch(() => false)) ok('na próxima entrada aparece a pergunta da faculdade e da especialidade');
else falha('a janela não apareceu');
await foto('faculdade-1-janela');
const centro = await pag.evaluate(() => {
  const el = document.querySelector('[data-teste="pergunta-faculdade"]');
  const caixa = el.firstElementChild.getBoundingClientRect();
  return { noCorpo: el.parentElement === document.body, dx: Math.abs(caixa.left + caixa.width / 2 - innerWidth / 2), dy: Math.abs(caixa.top + caixa.height / 2 - innerHeight / 2) };
});
if (centro.noCorpo && centro.dx < 4 && centro.dy < 4) ok('a janela fica no meio da tela, por cima de tudo');
else falha('posição da janela: ' + JSON.stringify(centro));

const opcoesFac = pag.locator('[data-teste="faculdade-opcao"]');
const nFac = await opcoesFac.count();
if (nFac >= 50) ok(`a lista de faculdades já aparece antes de digitar (${nFac} na tela)`);
else falha('lista de faculdades curta: ' + nFac);
const nEsp = await pag.locator('[data-teste="especialidade-opcao"]').count();
if (nEsp === 56) ok('as 55 especialidades já aparecem, mais "Ainda não decidi"');
else falha('especialidades na lista: ' + nEsp);

const busca = pag.locator('[data-teste="faculdade-busca"]');
await busca.fill('ufg');
let primeira = (await opcoesFac.first().innerText()).replace(/\s+/g, ' ');
if (/^UFG · Universidade Federal de Goiás/.test(primeira)) ok('digitar "ufg" traz a UFG em primeiro');
else falha('busca por sigla: ' + primeira);
await busca.fill('universidade federal de goias');
const textos = await opcoesFac.allInnerTexts();
if (textos.length >= 1 && /UFG/.test(textos[0])) ok('o nome por extenso, sem acento, também acha a UFG');
else falha('busca por nome: ' + textos.join(' | '));
await busca.fill('faculdade que nao existe xyz');
if (await pag.locator('[data-teste="faculdade-outra"]').isVisible()) ok('quem não acha a sua pode usar o nome que escreveu');
else falha('sem opção de escrever a faculdade');
await busca.fill('UFG');
await opcoesFac.first().click();
if (/UFG/.test(await pag.locator('[data-teste="faculdade-escolhida"]').innerText())) ok('a UFG fica escolhida');
else falha('faculdade não ficou escolhida');

const buscaEsp = pag.locator('[data-teste="especialidade-busca"]');
await buscaEsp.fill('cardio');
const filtradas = await pag.locator('[data-teste="especialidade-opcao"]').allInnerTexts();
if (filtradas.length === 2 && filtradas.some((t) => /Cardiologia/.test(t)) && filtradas.some((t) => /Cirurgia Cardiovascular/.test(t))) ok('digitar "cardio" filtra para Cardiologia e Cirurgia Cardiovascular');
else falha('filtro de especialidade: ' + filtradas.join(' | '));
await pag.locator('[data-teste="especialidade-opcao"]:has-text("Cardiologia")').first().click();
await buscaEsp.fill('pediat');
await pag.locator('[data-teste="especialidade-opcao"]', { hasText: /^Pediatria$/ }).first().click();
await buscaEsp.fill('');
const chips = await pag.locator('[data-teste="especialidades-escolhidas"] button').allInnerTexts();
if (chips.length === 2) ok('dá para escolher mais de uma especialidade');
else falha('especialidades escolhidas: ' + chips.join(' | '));
if (await pag.locator('[data-teste="faculdade-mostrar"]').isChecked()) ok('achar colegas já vem marcado, e dá para desmarcar');
else falha('opção de colegas desmarcada');
await foto('faculdade-2-preenchida');
await pag.locator('[data-teste="faculdade-salvar"]').click();
await pag.waitForTimeout(300);
if (!(await janela.isVisible().catch(() => false))) ok('salvar fecha a janela');
else falha('a janela continuou aberta');
await pag.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('cadencia:v3')).profile.perguntouFaculdade === true; } catch (e) { return false; } }, null, { timeout: 8000 }).catch(() => {});
let d = await dados();
if (d.profile.faculdade === 'ufg-go' && /Universidade Federal de Goiás/.test(d.profile.faculdadeNome)
  && d.profile.especialidades.join(',') === 'Cardiologia,Pediatria' && d.profile.mostrarFaculdade === true && d.profile.perguntouFaculdade === true) {
  ok('a faculdade, as especialidades e a escolha ficam no perfil');
} else falha('perfil: ' + JSON.stringify(d.profile));
await pag.waitForFunction(() => (window.__gravados || []).some((g) => g.caminho === 'perfis/u' && g.dados.faculdade === 'ufg-go'), null, { timeout: 6000 }).catch(() => {});
const grav = await pag.evaluate(() => (window.__gravados || []).filter((g) => g.caminho === 'perfis/u' && 'faculdade' in g.dados).pop());
if (grav && grav.dados.faculdade === 'ufg-go' && grav.dados.mostrarFaculdade === true && grav.dados.especialidades.length === 2) ok('o perfil público recebe a faculdade e as especialidades');
else falha('perfil público: ' + JSON.stringify(grav));

/* ── 2. uma vez só ───────────────────────────────────────────────────── */
await pag.reload({ waitUntil: 'load' });
await pag.waitForTimeout(1500);
if (!(await janela.isVisible().catch(() => false))) ok('recarregando, a janela não aparece de novo');
else falha('a janela voltou');

/* ── 3. Amigos: colegas da faculdade ─────────────────────────────────── */
await pag.locator('nav button:has-text("Amigos")').first().click();
await pag.waitForSelector('[data-teste="colega"]', { timeout: 8000 }).catch(() => {});
const colegas = await pag.locator('[data-teste="colega"]').allInnerTexts();
if (colegas.length === 2 && /Caio/.test(colegas[0]) && /quer o mesmo que você/.test(colegas[0]) && !/quer o mesmo/.test(colegas[1])) {
  ok('a aba Amigos mostra os colegas da faculdade, marcando quem quer a mesma especialidade');
} else falha('colegas: ' + colegas.join(' | '));
await pag.waitForTimeout(900);
await foto('faculdade-3-amigos');
await pag.locator('[data-teste="colega"]').first().locator('button:has-text("Adicionar")').click();
await pag.waitForTimeout(400);
const conv = pedidos.find((p) => p.rota === 'duplas' && p.acao === 'convidar-colega');
if (conv && conv.uid === 'uid-caio' && /convite enviado/.test(await pag.locator('[data-teste="colega"]').first().innerText())) ok('"Adicionar" manda o convite e o cartão mostra que foi');
else falha('convidar colega: ' + JSON.stringify(conv));

/* ── 4. Simulados abertos ────────────────────────────────────────────── */
await pag.locator('nav button:has-text("Simulados")').first().click();
await pag.waitForSelector('[data-teste="sala-aberta"]', { timeout: 8000 }).catch(() => {});
const abertas = await pag.locator('[data-teste="sala-aberta"]').allInnerTexts();
if (abertas.length === 2 && /SIMULADO ENARE 1/.test(abertas[0]) && /100 questões/.test(abertas[0]) && /9 lançaram/.test(abertas[0])) {
  ok('a aba Simulados mostra as salas abertas com os simulados postados, para quem não está em nenhuma');
} else falha('salas abertas: ' + abertas.join(' | '));
if (!(await pag.locator('input[type="password"]').count())) ok('não pede senha para entrar nem para criar');
else falha('ainda tem campo de senha');
await pag.waitForTimeout(900);
await foto('faculdade-4-simulados');
await pag.locator('[data-teste="sala-aberta"]').first().locator('button:has-text("Entrar")').click();
await pag.waitForFunction(() => /Simulados da sala/.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {});
const part = pedidos.find((p) => p.acao === 'sim-participar');
if (part && part.nome === 'turma-r1-2027' && /Simulados da sala/.test(await pag.innerText('body'))) ok('"Entrar" entra na sala sem senha e abre os simulados dela');
else falha('entrar na sala aberta: ' + JSON.stringify(part));
if (await pag.locator('[data-teste="simulados-abertos"]').isVisible()) ok('depois de entrar, a lista das outras salas continua embaixo');
else falha('a lista aberta sumiu depois de entrar');

/* ── 5. "Agora não" adia até a próxima entrada ──────────────────────── */
const zerar = () => pag.evaluate(() => {
  const x = JSON.parse(localStorage.getItem('cadencia:v3'));
  x.profile.perguntouFaculdade = false; x.profile.faculdade = ''; x.profile.faculdadeNome = ''; x.profile.especialidades = [];
  localStorage.setItem('cadencia:v3', JSON.stringify(x));
  sessionStorage.removeItem('cm-faculdade-depois');
});
await zerar();
await pag.reload({ waitUntil: 'load' });
await pag.waitForTimeout(1500);
if (await janela.isVisible().catch(() => false)) {
  await pag.locator('[data-teste="faculdade-depois"]').click();
  await pag.waitForTimeout(300);
  if (!(await janela.isVisible().catch(() => false))) ok('"Agora não" fecha a janela');
  else falha('"Agora não" não fechou');
  await pag.reload({ waitUntil: 'load' });
  await pag.waitForTimeout(1500);
  if (!(await janela.isVisible().catch(() => false))) ok('na mesma entrada, recarregando, não pergunta de novo');
  else falha('voltou na mesma entrada');
  /* uma entrada nova (a sessão do navegador zera) */
  await pag.evaluate(() => sessionStorage.removeItem('cm-faculdade-depois'));
  await pag.reload({ waitUntil: 'load' });
  await pag.waitForTimeout(1500);
  if (await janela.isVisible().catch(() => false)) ok('quem ainda não preencheu vê a janela de novo na próxima entrada');
  else falha('não perguntou de novo para quem não preencheu');
  await pag.locator('[data-teste="faculdade-depois"]').click();
} else falha('a janela não voltou para testar "Agora não"');

/* quem só pôs a especialidade já preencheu: não pergunta */
await pag.evaluate(() => {
  const x = JSON.parse(localStorage.getItem('cadencia:v3'));
  x.profile.especialidades = ['Pediatria'];
  localStorage.setItem('cadencia:v3', JSON.stringify(x));
  sessionStorage.removeItem('cm-faculdade-depois');
});
await pag.reload({ waitUntil: 'load' });
await pag.waitForTimeout(1500);
if (!(await janela.isVisible().catch(() => false))) ok('quem já pôs alguma coisa não vê a janela');
else falha('perguntou para quem já tinha preenchido');

/* ── 6. dá para mudar depois em Configurações ───────────────────────── */
await pag.locator('nav button:has-text("Configurações")').first().click();
await pag.waitForTimeout(500);
if (await pag.locator('[data-teste="faculdade-perfil"] [data-teste="faculdade-busca"]').isVisible()) ok('Configurações, Seu perfil, tem os mesmos campos para mudar depois');
else falha('faculdade não aparece em Configurações');

/* ── 7. a conta do dono é zerada uma vez, para testar a janela ─────── */
await pag.evaluate(() => {
  localStorage.setItem('teste-email', 'joseeduardo1616@gmail.com');
  const x = JSON.parse(localStorage.getItem('cadencia:v3'));
  x.profile.faculdade = 'ufg-go'; x.profile.faculdadeNome = 'UFG · Universidade Federal de Goiás'; x.profile.especialidades = ['Cardiologia'];
  localStorage.setItem('cadencia:v3', JSON.stringify(x));
  sessionStorage.removeItem('cm-faculdade-depois');
});
await pag.reload({ waitUntil: 'load' });
await pag.waitForTimeout(2000);
d = await dados();
if (await janela.isVisible().catch(() => false) && !d.profile.faculdade && !d.profile.especialidades.length && d.profile.faculdadeZerada === 1) {
  ok('na conta do dono, a faculdade é apagada uma vez e a janela aparece');
} else falha('zerar do dono: ' + JSON.stringify(d.profile));
await pag.locator('[data-teste="faculdade-busca"]').fill('UFG');
await pag.locator('[data-teste="faculdade-opcao"]').first().click();
await pag.locator('[data-teste="faculdade-salvar"]').click();
await pag.waitForTimeout(300);
await pag.evaluate(() => sessionStorage.removeItem('cm-faculdade-depois'));
await pag.waitForFunction(() => { try { return JSON.parse(localStorage.getItem('cadencia:v3')).profile.faculdade === 'ufg-go'; } catch (e) { return false; } }, null, { timeout: 8000 }).catch(() => {});
await pag.reload({ waitUntil: 'load' });
await pag.waitForTimeout(2000);
d = await dados();
if (!(await janela.isVisible().catch(() => false)) && d.profile.faculdade === 'ufg-go') ok('depois de o dono preencher, não apaga de novo nem pergunta');
else falha('dono depois de preencher: ' + JSON.stringify(d.profile));

if (errosDaPagina.length) falha('erros na página: ' + errosDaPagina.join(' | '));
else ok('nenhum erro de JavaScript na página');

await navegador.close();
servidor.close();
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
