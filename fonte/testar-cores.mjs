/* Testa a matemática de cor do tema próprio: uma cor escolhida continua
 * legível nos dois temas (claro e escuro), e a segunda cor sugerida
 * combina com a primeira, em vez de ser um palpite solto.
 *
 * Roda contra _cores.mjs, a cópia automática de hexParaHsl/hslParaHex/
 * corLegivel/corCombinando (do base.jsx) — refeita pelo extrair_cores.py
 * a cada build.
 *
 *   node testar-cores.mjs
 */
const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

const { hexParaHsl, hslParaHex, corLegivel, corCombinando } = await import('./_cores.mjs');

/* ── ida e volta hex ↔ HSL ────────────────────────────────────────────── */
for (const hex of ['#FF0000', '#00FF00', '#0000FF', '#35E4FF', '#A855F7', '#FFFFFF', '#000000', '#808080']) {
  const { h, s, l } = hexParaHsl(hex);
  const volta = hslParaHex(h, s, l);
  if (volta === hex.toUpperCase()) ok(`${hex}: ida e volta hex→HSL→hex bate certinho`);
  else falha(`${hex}: virou HSL(${h.toFixed(1)},${s.toFixed(1)},${l.toFixed(1)}) e voltou ${volta}, esperado ${hex}`);
}

/* ── cor clara demais fica mais escura, e continua a mesma cor (matiz) ── */
{
  const clara = '#FFF9C4';   // amarelo bem claro, quase invisível no fundo claro
  const ajustada = corLegivel(clara);
  const antes = hexParaHsl(clara), depois = hexParaHsl(ajustada);
  if (depois.l <= 72) ok('cor clara demais é escurecida até a faixa legível');
  else falha(`cor clara não foi ajustada: L ficou em ${depois.l.toFixed(1)}`);
  if (Math.abs(depois.h - antes.h) < 5) ok('escurecer a cor clara não muda o matiz (continua "a mesma cor")');
  else falha(`o matiz mudou ao ajustar: ${antes.h.toFixed(1)} → ${depois.h.toFixed(1)}`);
}

/* ── cor escura demais fica mais clara ───────────────────────────────── */
{
  const escura = '#1A0033';   // roxo quase preto, some no fundo escuro
  const ajustada = corLegivel(escura);
  const depois = hexParaHsl(ajustada);
  if (depois.l >= 45) ok('cor escura demais é clareada até a faixa legível');
  else falha(`cor escura não foi ajustada: L ficou em ${depois.l.toFixed(1)}`);
}

/* ── cor pouco saturada (acinzentada) ganha mais saturação ───────────── */
{
  const cinza = '#8A8580';
  const ajustada = corLegivel(cinza);
  const depois = hexParaHsl(ajustada);
  if (depois.s >= 49.9) ok('cor pouco saturada ganha saturação suficiente para não parecer cinza');
  else falha(`saturação não ajustada: ${depois.s.toFixed(1)}`);
}

/* ── uma cor já dentro da faixa boa não muda muito ───────────────────── */
{
  for (const c of ['#35E4FF', '#FF7BC0', '#FFC658']) {   // as próprias cores prontas (CORES_TEMA)
    const ajustada = corLegivel(c);
    const antes = hexParaHsl(c), depois = hexParaHsl(ajustada);
    if (Math.abs(antes.l - depois.l) < 3 && Math.abs(antes.s - depois.s) < 3) {
      ok(`${c}: já estava na faixa boa, corLegivel mantém quase igual`);
    } else falha(`${c}: mudou mais do que devia — L ${antes.l.toFixed(1)}→${depois.l.toFixed(1)}, S ${antes.s.toFixed(1)}→${depois.s.toFixed(1)}`);
  }
}

/* ── a segunda cor sugerida combina, não é solta ─────────────────────── */
{
  const base = '#FF7BC0';   // rosa, o exemplo do próprio pedido original
  const combinando = corCombinando(base);
  const { h: h1 } = hexParaHsl(base);
  const { h: h2, s, l } = hexParaHsl(combinando);
  const diferenca = Math.min(Math.abs(h1 - h2), 360 - Math.abs(h1 - h2));
  if (diferenca > 20 && diferenca < 160) {
    ok(`rosa (${base}): a cor sugerida gira o matiz (${diferenca.toFixed(0)}°) sem virar oposta nem repetir a mesma`);
  } else falha(`giro de matiz fora do esperado: ${diferenca.toFixed(0)}°`);
  if (s >= 50 && l >= 45 && l <= 72) ok('a cor combinando também nasce dentro da faixa legível');
  else falha(`cor combinando fora da faixa: S=${s.toFixed(1)} L=${l.toFixed(1)}`);
}

/* ── mesma entrada, mesma saída (determinístico) ─────────────────────── */
{
  const a = corCombinando('#3B82F6'), b = corCombinando('#3B82F6');
  if (a === b) ok('corCombinando é determinístico: a mesma cor sempre sugere a mesma combinação');
  else falha(`corCombinando não é determinístico: ${a} vs ${b}`);
}

/* ── hex de 3 dígitos também funciona ─────────────────────────────────── */
{
  const { h, s, l } = hexParaHsl('#0F0');
  const cheia = hexParaHsl('#00FF00');
  if (Math.abs(h - cheia.h) < 1 && Math.abs(s - cheia.s) < 1 && Math.abs(l - cheia.l) < 1) {
    ok('hex de 3 dígitos (#0F0) é lido igual ao de 6 (#00FF00)');
  } else falha('hex de 3 dígitos não bateu com o de 6');
}


/* ── o ambiente da cor própria também precisa ser legível ──────────────
 *
 * Quem escolhe uma cor não recebe só um botão colorido: o fundo, os
 * painéis, os quatro tons de texto, as cinco áreas e as duas cores de
 * acento são todos recalculados no matiz escolhido. Cada um desses vira
 * letra em algum lugar do site, e nenhum deles era conferido de verdade.
 *
 * O defeito concreto: a conta media o texto contra o painel mais claro,
 * que no tema escuro é um rgba translúcido. A luminância só sabia ler
 * hex, um rgba virava NaN, "NaN >= alvo" é sempre falso, e o laço de
 * ajuste rodava até o fim — levando os QUATRO tons de texto a branco
 * puro. A hierarquia inteira sumia, sem erro nenhum aparecer.
 */
import { ambienteDoTema, contraste, achatar, luminancia, canaisDaCor, CONTRASTE_MINIMO } from './_cores.mjs';

if (!Number.isNaN(luminancia('rgba(66,55,104,0.88)'))) ok('a luminância lê rgba, e não só hex');
else falha('rgba ainda vira NaN na conta de luminância');

const [r, g, b, a] = canaisDaCor('rgba(10, 20, 30, 0.5)');
if (r === 10 && g === 20 && b === 30 && a === 0.5) ok('canaisDaCor separa os quatro canais de um rgba');
else falha(`canaisDaCor devolveu ${r},${g},${b},${a}`);

if (achatar('rgba(0,0,0,0.5)', '#FFFFFF').toLowerCase() === '#808080') ok('preto pela metade sobre branco dá cinza médio');
else falha('achatar errou a mistura: ' + achatar('rgba(0,0,0,0.5)', '#FFFFFF'));
if (achatar('#123456', '#FFFFFF').toLowerCase() === '#123456') ok('cor opaca atravessa o achatar sem mudar');
else falha('achatar mexeu numa cor opaca');

/* O piso de verdade: o painel mais claro já empilhado sobre os de baixo. */
const pisoDe = (v) => achatar(v['--card3'], achatar(v['--card2'], achatar(v['--card'], v['--bg'])));

const CORES = ['#A855F7', '#E23E96', '#12A594', '#FF7A3D', '#5C7CFA', '#7C3AED', '#FFC658'];
const LETRAS = ['--ink', '--dim', '--faint', '--ghost', '--neon', '--neon2',
  '--a-CL', '--a-CI', '--a-GO', '--a-PE', '--a-PR'];

for (const claro of [false, true]) {
  const nome = claro ? 'claro' : 'escuro';
  const ruins = [];
  const iguais = [];
  for (const cor of CORES) {
    const v = ambienteDoTema(cor, claro, '', '');
    const piso = pisoDe(v);
    for (const n of LETRAS) {
      const rz = contraste(v[n], piso);
      if (!(rz >= 4.5)) ruins.push(`${cor} ${n}=${v[n]} → ${Number.isNaN(rz) ? 'NaN' : rz.toFixed(2)}:1`);
    }
    /* Os quatro tons de texto precisam continuar DIFERENTES entre si.
       Quando o ajuste descambava, todos iam parar no mesmo branco: o
       contraste passava e a hierarquia morria. */
    const tons = new Set(['--ink', '--dim', '--faint', '--ghost'].map((n) => v[n]));
    if (tons.size < 4) iguais.push(`${cor}: ${[...tons].join(' ')}`);
  }
  if (!ruins.length) ok(`tema ${nome}: toda cor do ambiente passa em 4.5:1 contra o painel composto`);
  else falha(`tema ${nome}, abaixo do mínimo: ${ruins.slice(0, 6).join('; ')}`);
  if (!iguais.length) ok(`tema ${nome}: os quatro tons de texto continuam distintos entre si`);
  else falha(`tema ${nome}, tons achatados no mesmo valor: ${iguais.slice(0, 3).join('; ')}`);
}

/* A cor escolhida é respeitada: o ajuste só corrige o quanto precisa. */
const claroV = ambienteDoTema('#E23E96', true, '#FF7BC0', '#E23E96');
const escuroV = ambienteDoTema('#E23E96', false, '#FF7BC0', '#E23E96');
if (claroV['--neon'] !== escuroV['--neon']) ok('o acento nasce diferente em cada tema, em vez de um valor só para os dois');
else falha('o acento saiu igual nos dois temas');

if (CONTRASTE_MINIMO['--ghost'] >= 4.5) ok('o tom mais apagado responde por texto, e não por ícone');
else falha('o --ghost voltou a ser orçado abaixo de 4.5:1');

console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
