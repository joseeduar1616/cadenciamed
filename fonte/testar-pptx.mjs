/* PowerPoint lido no próprio site (parte30, lerPptxComFiguras).
 *
 * Monta um .pptx de verdade (zip com o XML do PowerPoint) e envia no
 * Estudo interativo. Confere: os slides vêm na ordem da apresentação (a do
 * presentation.xml, não a do nome do arquivo); as notas do apresentador
 * entram junto; a imagem do slide vira figura com o texto do slide em
 * volta; o logotipo repetido em três slides e o ícone pequeno ficam de
 * fora; e a imagem chega ao slide da aula.
 *
 *   node testar-pptx.mjs [teste.html]
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');
const alvo = path.resolve(process.argv[2] || 'teste.html');
const erros = [];
const ok = (m) => console.log('ok   ' + m);
const falha = (m) => { console.log('FALHA ' + m); erros.push(m); };

/* PNG de uma cor só, do tamanho pedido */
function png(w, h, [r, g, b]) {
  const crcTab = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcTab[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const bloco = (tipo, dados) => {
    const t = Buffer.from(tipo); const len = Buffer.alloc(4); len.writeUInt32BE(dados.length);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, dados])));
    return Buffer.concat([len, t, dados, c]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const linha = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
  const cru = Buffer.concat(Array.from({ length: h }, () => linha));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), bloco('IHDR', ihdr), bloco('IDAT', zlib.deflateSync(cru)), bloco('IEND', Buffer.alloc(0))]);
}

const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const slideXml = (paras) => `<?xml version="1.0"?><p:sld ${NS}><p:cSld><p:spTree>${paras.map((t) => `<p:sp><p:txBody><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:txBody></p:sp>`).join('')}</p:spTree></p:cSld></p:sld>`;
const rels = (lista) => `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${lista.map(([id, tipo, alvo2]) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${tipo}" Target="${alvo2}"/>`).join('')}</Relationships>`;

const zip = new JSZip();
zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>');
/* a apresentação põe o slide3.xml PRIMEIRO: a ordem certa é a daqui */
zip.file('ppt/presentation.xml', `<?xml version="1.0"?><p:presentation ${NS}><p:sldIdLst><p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId1"/><p:sldId id="258" r:id="rId2"/></p:sldIdLst></p:presentation>`);
zip.file('ppt/_rels/presentation.xml.rels', rels([['rId1', 'slide', 'slides/slide1.xml'], ['rId2', 'slide', 'slides/slide2.xml'], ['rId3', 'slide', 'slides/slide3.xml']]));
zip.file('ppt/slides/slide3.xml', slideXml(['Insuficiência cardíaca', 'Aula de cardiologia']));
zip.file('ppt/slides/slide1.xml', slideXml(['Fisiopatologia da IC', 'Remodelamento ventricular após a lesão']));
zip.file('ppt/slides/slide2.xml', slideXml(['Tratamento', 'Diurético alivia a congestão']));
zip.file('ppt/slides/_rels/slide3.xml.rels', rels([['rId1', 'image', '../media/logo.png']]));
zip.file('ppt/slides/_rels/slide1.xml.rels', rels([['rId1', 'image', '../media/logo.png'], ['rId2', 'image', '../media/raiox.png'], ['rId3', 'image', '../media/icone.png'], ['rId4', 'notesSlide', '../notesSlides/notesSlide1.xml'], ['rId5', 'image', '../media/grafico.emf']]));
zip.file('ppt/slides/_rels/slide2.xml.rels', rels([['rId1', 'image', '../media/logo.png']]));
zip.file('ppt/notesSlides/notesSlide1.xml', slideXml(['NOTA: explique a lei de Frank-Starling aqui', '2']));
zip.file('ppt/media/logo.png', png(300, 200, [20, 20, 200]));
zip.file('ppt/media/raiox.png', png(400, 300, [200, 30, 30]));
zip.file('ppt/media/icone.png', png(24, 24, [0, 150, 0]));
zip.file('ppt/media/grafico.emf', Buffer.from('emf'));
const PPTX = await zip.generateAsync({ type: 'nodebuffer' });

const servidor = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(fs.readFileSync(alvo)); });
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const CHROME = process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const navegador = await chromium.launch({ args: ['--no-sandbox'], ...(fs.existsSync(CHROME) ? { executablePath: CHROME } : {}) });
const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => {
  if (location.protocol === 'about:' || sessionStorage.getItem('semeado')) return;
  sessionStorage.setItem('semeado', '1');
  localStorage.setItem('cadencia:v3:convite-notificacoes-aparelho', 'teste');
  localStorage.setItem('cadencia:v3', JSON.stringify({ profile: { name: 'Teste', onboarded: true }, tema: { versaoVisual: 2 } }));
});
const FB_AUTH = `
const user = { uid: 'u', email: 't@e.com', getIdToken: async () => 'tk' };
export function getAuth() { return { currentUser: user }; }
export function onAuthStateChanged(a, cb) { setTimeout(() => cb(user), 30); return () => {}; }
export async function setPersistence() {}
export const browserLocalPersistence = {}; export const browserSessionPersistence = {};
export async function signOut() {} export async function updateProfile() {}
export class GoogleAuthProvider { setCustomParameters() {} }
export async function getRedirectResult() { return null; }`;
const FB_STORE = `export function getFirestore() { return {}; } export function doc() { return {}; } export async function setDoc() {} export function onSnapshot() { return () => {}; }`;
await ctx.route('https://www.gstatic.com/firebasejs/**', (r) => {
  const u = r.request().url();
  r.fulfill({ status: 200, contentType: 'text/javascript', body: u.endsWith('firebase-app.js') ? 'export function initializeApp(c) { return { c }; }' : u.endsWith('firebase-auth.js') ? FB_AUTH : FB_STORE });
});
const pedidos = [];
await ctx.route('**/api/**', (r) => {
  let corpo = {};
  try { corpo = JSON.parse(r.request().postData() || '{}'); } catch (e) { /* GET */ }
  const resp = (j) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(j) });
  if (!r.request().url().includes('/api/estudo-ia')) return resp({ ok: true });
  pedidos.push(corpo);
  if (corpo.acao === 'plano') return resp({ ok: true, titulo: 'IC', resumo: 'x', blocos: [{ titulo: 'Fisiopatologia', objetivo: 'o', minutos: 10, topicos: ['a'], figuras: ['F1'] }] });
  if (corpo.acao === 'bloco') return resp({ ok: true, slides: [{ tipo: 'conceito', titulo: 'Raio X', texto: 'olha', figura: 'F1', legenda: 'Raio X', pontos: [] }, { tipo: 'resumo', titulo: 'Fim', pontos: ['a'] }], perguntas: [{ tipo: 'conceito', enunciado: 'P', gabarito: ['g'] }] });
  return resp({ ok: true });
});
await ctx.route('https://cdnjs.cloudflare.com/ajax/libs/jszip/**', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.resolve('../node_modules/jszip/dist/jszip.min.js'), 'utf8') }));
const pag = await ctx.newPage();
const errosDaPagina = [];
pag.on('pageerror', (e) => errosDaPagina.push(e.message));
await pag.goto(`http://127.0.0.1:${servidor.address().port}/`, { waitUntil: 'load' });
await pag.waitForTimeout(1500);

/* pela tela do Estudo interativo: envia, monta, e olha o que foi à IA */
await pag.locator('nav button:has-text("Estudo interativo")').first().click();
await pag.waitForTimeout(600);
const accept = await pag.locator('[data-teste="estudo-arquivo"]').getAttribute('accept');
if (/\.pptx/.test(accept || '')) ok('o seletor de arquivo aceita .pptx');
else falha('accept: ' + accept);
await pag.locator('[data-teste="estudo-arquivo"]').setInputFiles([{ name: 'aula.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', buffer: PPTX }]);
await pag.waitForTimeout(2000);
const mats = await pag.locator('[data-teste="estudo-materiais"]').innerText().catch(() => '');
if (/aula\.pptx/.test(mats) && /1 imagem/.test(mats)) ok('o PowerPoint entra como material, com a imagem');
else falha('materiais: ' + mats);
await pag.locator('[data-teste="estudo-texto"]').fill('Complemento do aluno sobre insuficiência cardíaca. '.repeat(8));
await pag.locator('[data-teste="estudo-montar"]').click();
await pag.waitForTimeout(1500);
const plano = pedidos.find((x) => x.acao === 'plano');
if (!plano) falha('a aula não foi pedida à IA');
else {
  const t = plano.texto;
  const i1 = t.indexOf('Insuficiência cardíaca'), i2 = t.indexOf('Fisiopatologia da IC'), i3 = t.indexOf('Tratamento');
  if (i1 >= 0 && i1 < i2 && i2 < i3) ok('os slides vêm na ordem da apresentação, não na do nome do arquivo');
  else falha('ordem: ' + t.slice(0, 300));
  if (/--- slide 2 ---\nFisiopatologia da IC\nRemodelamento/.test(t)) ok('cada slide vem marcado, com o texto em linhas');
  else falha('marcação dos slides: ' + t.slice(0, 300));
  if (/Notas do apresentador: NOTA: explique a lei de Frank-Starling aqui/.test(t) && !/aqui 2/.test(t)) ok('as notas do apresentador entram, sem o número da página');
  else falha('notas: ' + t.slice(0, 400));
  const figs = plano.figuras || [];
  if (figs.length === 1 && figs[0].pagina === 2 && figs[0].material === 'aula.pptx') ok('só a imagem do conteúdo vira figura (o logotipo repetido, o ícone pequeno e o EMF ficam de fora)');
  else falha('figuras: ' + JSON.stringify(figs));
  if (figs[0] && /Fisiopatologia da IC/.test(figs[0].contexto)) ok('a figura leva o texto do slide em volta, para a IA saber onde encaixar');
  else falha('contexto da figura: ' + JSON.stringify(figs[0]));
}
await pag.waitForSelector('[data-teste="estudo-painel"]', { timeout: 8000 }).catch(() => {});
await pag.locator('[data-teste="estudo-continuar"]').click().catch(() => {});
await pag.waitForSelector('[data-teste="estudo-figura"] img', { timeout: 8000 }).catch(() => {});
const src = await pag.locator('[data-teste="estudo-figura"] img').first().getAttribute('src').catch(() => '');
if (/^data:image\/jpeg;base64,/.test(src || '')) ok('a imagem do PowerPoint aparece no slide da aula');
else falha('figura no slide: ' + String(src).slice(0, 40));

if (!errosDaPagina.length) ok('nenhum erro de JavaScript na página');
else falha('erros: ' + errosDaPagina.slice(0, 3).join(' | '));
await navegador.close();
servidor.close();
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
