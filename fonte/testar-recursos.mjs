/* Quem vê o quê: a regra vale no SERVIDOR.
 *
 * Antes, fechar uma aba era não desenhá-la na barra. Isso não fecha nada —
 * quem soubesse o nome da aba chegava nela, e as rotas por trás não
 * perguntavam. Agora a regra mora em worker/api/_comum.js, o /api/plano
 * responde por ela, e a tela só desenha o que ele disser.
 *
 * A tela guarda uma cópia do padrão (RECURSOS_PADRAO, em parte11.jsx) para
 * ter o que desenhar enquanto o servidor não respondeu. Duas listas é duas
 * chances de divergirem em silêncio: uma aba nova aparecendo aberta para
 * todo mundo porque a cópia da tela nunca soube dela. O teste compara as
 * duas, campo a campo.
 *
 *   node testar-recursos.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RECURSOS, REGRAS, recursosDe, regrasGravadas, camposDasRegras } from '../worker/api/_comum.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const erros = [];
const ok = (m) => console.log('ok   ' + m);
const falha = (m) => { console.log('FALHA ' + m); erros.push(m); };

/* ── as duas listas têm de bater ────────────────────────────────────── */
const jsx = fs.readFileSync(path.join(aqui, 'parte11.jsx'), 'utf8');
const bloco = jsx.slice(jsx.indexOf('const RECURSOS_PADRAO = {'));
const corpo = bloco.slice(bloco.indexOf('{') + 1, bloco.indexOf('};'));
const naTela = {};
for (const m of corpo.matchAll(/(\w+)\s*:\s*"(\w+)"/g)) naTela[m[1]] = m[2];

const noServidor = {};
for (const r of RECURSOS) noServidor[r.id] = r.padrao;
const faltando = Object.keys(noServidor).filter((k) => !(k in naTela));
const sobrando = Object.keys(naTela).filter((k) => !(k in noServidor));
const diferentes = Object.keys(noServidor).filter((k) => k in naTela && naTela[k] !== noServidor[k]);

if (!faltando.length && !sobrando.length) ok('a lista de abas da tela tem exatamente as mesmas do servidor');
else falha(`a tela e o servidor discordam: falta ${faltando.join(', ') || 'nada'}; sobra ${sobrando.join(', ') || 'nada'}`);
if (!diferentes.length) ok('e o padrão de cada aba é o mesmo nos dois');
else falha(`padrão diferente em: ${diferentes.join(', ')}`);

/* ── a academia é do dono ───────────────────────────────────────────── */
const treino = RECURSOS.find((r) => r.id === 'treino');
if (treino && treino.padrao === 'dono') ok('a aba Treino nasce fechada, só para o dono');
else falha('a aba Treino não está fechada por padrão');

/* ── as três regras, e o que cada uma faz ───────────────────────────── */
const comRegra = (regra, quem) => recursosDe({ ...quem, regras: { treino: regra } }).treino;

if (comRegra('dono', { dono: false, pro: true }) === false) ok('"só você": nem quem assina vê');
else falha('quem assina viu uma aba marcada como só do dono');
if (comRegra('dono', { dono: true, pro: true }) === true) ok('"só você": o dono vê');
else falha('o dono não viu a própria aba');

if (comRegra('pro', { dono: false, pro: true }) === true) ok('"quem assina": assinante vê');
else falha('assinante não viu uma aba liberada para assinantes');
if (comRegra('pro', { dono: false, pro: false }) === false) ok('"quem assina": quem não assina não vê');
else falha('quem não assina viu uma aba paga');

if (comRegra('todos', { dono: false, pro: false }) === true) ok('"todo mundo": qualquer conta vê');
else falha('uma aba aberta a todos ficou fechada');

/* O dono vê tudo, sempre. Senão dava para ele se trancar fora do painel
   que decide quem vê o quê — e aí não haveria como destrancar. */
const tudoFechado = {};
for (const r of RECURSOS) tudoFechado[r.id] = 'dono';
const doDono = recursosDe({ dono: true, pro: false, regras: tudoFechado });
if (Object.values(doDono).every(Boolean)) ok('com tudo fechado, o dono continua vendo tudo');
else falha('o dono conseguiu se trancar fora do site');

/* ── liberação avulsa: uma aba, uma pessoa ──────────────────────────── */
const avulso = recursosDe({ dono: false, pro: false, regras: { cartoes: 'pro' }, liberados: { cartoes: true } });
if (avulso.cartoes === true) ok('dá para abrir uma aba paga para uma pessoa só, sem dar assinatura');
else falha('a liberação avulsa não abriu a aba');
if (avulso.assistente === false) ok('e a liberação avulsa abre só aquela aba, não as outras pagas');
else falha('liberar uma aba abriu as outras junto');

/* ── o que vem do banco é conferido ─────────────────────────────────── */
const sujo = regrasGravadas({ fields: {
  treino: { stringValue: 'todos' },
  cartoes: { stringValue: 'liberado-geral' },   // regra inventada
  aba_que_nao_existe: { stringValue: 'todos' },
} });
if (sujo.treino === 'todos') ok('regra válida gravada no banco é respeitada');
else falha('a regra gravada foi ignorada');
if (!('cartoes' in sujo)) ok('regra inventada é descartada, e a aba cai no padrão');
else falha('uma regra inventada passou: ' + sujo.cartoes);
if (!('aba_que_nao_existe' in sujo)) ok('campo estranho no banco não vira aba');
else falha('um campo desconhecido do banco virou recurso');

/* Nem o contrário: o que sai para o banco também é filtrado, senão
   bastaria uma chamada torta para gravar lixo que ninguém mais lê. */
const campos = camposDasRegras({ treino: 'pro', cartoes: 'xis', invencao: 'todos' });
if (campos.treino && campos.treino.stringValue === 'pro') ok('a gravação leva a regra boa');
else falha('a regra boa não foi gravada');
if (!campos.cartoes && !campos.invencao) ok('e deixa de fora regra inventada e aba inexistente');
else falha('a gravação aceitou lixo');

/* ── a reserva da tela não pode punir quem paga ─────────────────────
   Quando o servidor não responde, a tela aplica os padrões ao que já
   sabe. Devolvendo só os padrões, como fazia antes, uma oscilação de
   internet na hora de conferir o plano tirava os Cartões da barra de quem
   assina: a pessoa pagou e viu a aba sumir. */
const reservaJsx = jsx.slice(jsx.indexOf('function recursosLocais'));
const usaPro = /regra === "pro" && !!pro/.test(reservaJsx.slice(0, 600));
const usaDono = /!!dono \|\|/.test(reservaJsx.slice(0, 600));
if (usaPro) ok('a reserva da tela respeita quem assina, mesmo sem resposta do servidor');
else falha('a reserva da tela ignora a assinatura: uma queda de rede tiraria as abas pagas');
if (usaDono) ok('e o dono continua vendo tudo mesmo com o servidor fora');
else falha('o dono perde as abas quando o servidor não responde');

if (REGRAS.length === 3) ok('são três regras, e só três');
else falha(`apareceram ${REGRAS.length} regras`);

console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
