/* Apelido e foto de perfil.
 *
 * O que se testa aqui não é "o campo salvou". É o que acontece com a foto
 * no caminho até o perfil público, porque é ali que estão os dois
 * estragos possíveis:
 *
 * · A foto vai para perfis/{uid}, que é lido EM LOTE para todo mundo de
 *   uma sala de uma vez. Uma foto de celular tem alguns megabytes; vinte
 *   delas estouram o limite do documento e deixam o ranking impossível de
 *   abrir numa internet ruim. Por isso ela é encolhida no navegador, antes
 *   de sair, e o teste confere o tamanho de verdade.
 *
 * · Guardar um endereço http no lugar da imagem transformaria cada
 *   abertura da lista de amigos numa visita a um site de fora, contando a
 *   quem hospeda a imagem quem estava olhando e quando. Só data URL de
 *   imagem entra.
 *
 *   node testar-perfil.mjs [arquivo.html]
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
      profile: { name: 'José Eduardo Silva', onboarded: true },
    }));
  } catch (e) { /* sem localStorage o teste ainda abre */ }
});

await pag.goto('file://' + alvo, { waitUntil: 'load' });
await pag.waitForTimeout(1800);
const semConta = pag.locator('button:has-text("usar sem conta")');
if (await semConta.count() > 0) { await semConta.first().click(); await pag.waitForTimeout(400); }

/* O app grava no aparelho com 1,5 s de atraso (ver o efeito de gravação
   em parte8.jsx), então medir antes disso é medir o estado anterior. */
const irParaConfig = async () => {
  const b = pag.locator('nav button:has-text("Configurações")');
  if (await b.count() === 0) return false;
  await b.first().click();
  await pag.waitForTimeout(600);
  return true;
};

if (!await irParaConfig()) {
  falha('não achei a aba Configurações');
} else {
  /* ── o cartão existe e diz para que serve ─────────────────────────── */
  const texto = await pag.evaluate(() => document.querySelector('main').innerText);
  if (/seu perfil/i.test(texto)) ok('o perfil tem lugar próprio em Configurações');
  else falha('não achei o cartão do perfil');

  /* ── apelido ───────────────────────────────────────────────────────── */
  const campo = pag.locator('input[placeholder*="deixe vazio"], input[maxlength="24"]');
  if (await campo.count() > 0) {
    await campo.first().fill('Zé da Nefro');
    await pag.waitForTimeout(2600);
    const guardado = await pag.evaluate(() => {
      try { return (JSON.parse(localStorage.getItem('cadencia:v3')).profile || {}).apelido; }
      catch (e) { return null; }
    });
    if (guardado === 'Zé da Nefro') ok('o apelido é guardado');
    else falha('o apelido não foi guardado: ' + JSON.stringify(guardado));

    /* O apelido tem teto: um nome comprido estoura a linha do ranking. */
    await campo.first().fill('x'.repeat(60));
    await pag.waitForTimeout(2600);
    const cortado = await pag.evaluate(() => {
      try { return (JSON.parse(localStorage.getItem('cadencia:v3')).profile || {}).apelido.length; }
      catch (e) { return -1; }
    });
    if (cortado === 24) ok('o apelido tem teto, e o corte acontece na hora de digitar');
    else falha('o apelido entrou com ' + cortado + ' caracteres');
    await campo.first().fill('Zé da Nefro');
    await pag.waitForTimeout(500);
  } else falha('não achei o campo de apelido');

  /* ── foto: a que sobe é a encolhida ────────────────────────────────── */
  const entrada = pag.locator('input[type="file"][accept="image/*"]');
  if (await entrada.count() > 0) {
    /* Uma imagem grande de verdade: 1200x900, que é o que sai de câmera. */
    const grande = path.join('/tmp', 'foto-de-teste.png');
    const png = await pag.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 1200; c.height = 900;
      const x = c.getContext('2d');
      /* ruído, para não comprimir a quase nada e o teste medir algo real */
      for (let i = 0; i < 4000; i += 1) {
        x.fillStyle = `hsl(${(i * 37) % 360},70%,${30 + (i % 50)}%)`;
        x.fillRect((i * 13) % 1200, (i * 29) % 900, 24, 24);
      }
      return c.toDataURL('image/png').split(',')[1];
    });
    fs.writeFileSync(grande, Buffer.from(png, 'base64'));
    const tamanhoOriginal = fs.statSync(grande).size;

    await entrada.first().setInputFiles(grande);
    await pag.waitForTimeout(3000);

    const foto = await pag.evaluate(() => {
      try { return (JSON.parse(localStorage.getItem('cadencia:v3')).profile || {}).foto || ''; }
      catch (e) { return ''; }
    });

    if (foto && /^data:image\//.test(foto)) ok('a foto é guardada como imagem embutida, sem depender de site de fora');
    else falha('a foto não foi guardada: ' + String(foto).slice(0, 60));

    if (foto && foto.length < 60000) {
      ok(`a foto é encolhida antes de subir (${tamanhoOriginal} bytes viraram ${foto.length})`);
    } else falha(`a foto ficou com ${foto.length} caracteres, grande demais para ir no perfil`);

    /* E encolhida de verdade, não só recomprimida: ela é lida em lote. */
    const lado = await pag.evaluate((f) => new Promise((r) => {
      const i = new Image();
      i.onload = () => r(Math.max(i.width, i.height));
      i.onerror = () => r(-1);
      i.src = f;
    }), foto);
    if (lado === 128) ok('e encolhida ao tamanho em que ela aparece, 128 pixels');
    else falha('a foto guardada tem ' + lado + ' pixels de lado');

    /* A foto aparece no lugar das iniciais. */
    const temImg = await pag.evaluate(() => {
      const imgs = [...document.querySelectorAll('main img')];
      return imgs.some((i) => (i.src || '').startsWith('data:image/'));
    });
    if (temImg) ok('a foto aparece na tela, no lugar das iniciais');
    else falha('a foto foi guardada mas não apareceu');

    /* E dá para tirar. */
    const tirar = pag.locator('main button:has-text("tirar")');
    if (await tirar.count() > 0) {
      await tirar.first().click();
      await pag.waitForTimeout(2600);
      const depois = await pag.evaluate(() => {
        try { return (JSON.parse(localStorage.getItem('cadencia:v3')).profile || {}).foto; }
        catch (e) { return null; }
      });
      if (!depois) ok('dá para tirar a foto e voltar às iniciais');
      else falha('a foto continuou depois de tirar');
    } else falha('não achei o botão de tirar a foto');
  } else falha('não achei o campo de mandar a foto');
}

/* ── endereço de fora não entra no lugar da foto ────────────────────── */
await pag.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('cadencia:v3'));
  d.profile.foto = 'https://site-de-fora.exemplo/rastreador.png';
  localStorage.setItem('cadencia:v3', JSON.stringify(d));
});
await pag.reload({ waitUntil: 'load' });
await pag.waitForTimeout(1800);
const sobrou = await pag.evaluate(() => {
  try { return (JSON.parse(localStorage.getItem('cadencia:v3')).profile || {}).foto; }
  catch (e) { return null; }
});
const buscouFora = await pag.evaluate(() => [...document.querySelectorAll('img')]
  .some((i) => /^https?:/.test(i.src || '')));
if (!sobrou) ok('endereço de site de fora é descartado no lugar da foto');
else falha('um endereço externo virou foto de perfil: ' + sobrou);
if (!buscouFora) ok('e nenhuma imagem do perfil é buscada fora do site');
else falha('a página foi buscar imagem em site de fora');

await navegador.close();
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
