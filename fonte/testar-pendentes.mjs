/* O que não foi cumprido vai para a frente (parte27.jsx).
 *
 * Roda a função de verdade: o trecho puro do parte27 e os ajudantes de
 * data do base.jsx são lidos do próprio código-fonte e executados aqui,
 * para o teste não ficar testando uma cópia.
 *
 * O que importa travar: que remarca o que devia e SÓ o que devia (plantão
 * não rola, bloco marcado não rola, bloco de hoje ainda não rola), que o
 * horário novo não passa por cima de nada nem cai no dia de descanso, que
 * rodar duas vezes não duplica, e que sem nada a fazer devolve o mesmo
 * objeto — senão o site regravaria a conta a cada cinco minutos.
 *
 *   node testar-pendentes.mjs
 */
import fs from 'node:fs';

const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

const base = fs.readFileSync(new URL('./base.jsx', import.meta.url), 'utf8');
const p27 = fs.readFileSync(new URL('./parte27.jsx', import.meta.url), 'utf8');
const pegar = (re, nome) => {
  const m = base.match(re);
  if (!m) throw new Error('não achei ' + nome + ' no base.jsx');
  return m[0];
};
const ajudantes = [
  pegar(/const pad = [^\n]*/, 'pad'),
  pegar(/const toISO = [^\n]*/, 'toISO'),
  pegar(/function fromISO\(s\) \{[\s\S]*?\n\}/, 'fromISO'),
  pegar(/function addDays[^\n]*/, 'addDays'),
  pegar(/function brDate[^\n]*/, 'brDate'),
  pegar(/const toMin = [^\n]*/, 'toMin'),
  pegar(/const doMin = \(m\) => \{[\s\S]*?\n\};/, 'doMin'),
].join('\n');
const puro = p27.slice(0, p27.indexOf('/* ── o quadro na Agenda'));
const { rolarPendentes, pendentesParaIA } = new Function(
  `${ajudantes}\n${puro}\nreturn { rolarPendentes, pendentesParaIA };`)();

/* 2026-10-05 é segunda-feira. */
const SEG = '2026-10-05', TER = '2026-10-06', QUA = '2026-10-07';
const bloco = (id, day, start, end, extra) => ({ id, day, label: id, type: 'Estudo', start, end, origem: 'mentoria', ...extra });
const dados = (extra) => ({
  routine: [], agenda: [], blocos: {},
  rolagem: { modo: 'mentoria', ate: '2026-10-04', semLugar: [] },
  mentoria: { aplicadoEm: new Date('2026-10-01T12:00:00').getTime() },
  ...extra,
});
const remarcados = (d) => (d.agenda || []).filter((b) => b.origem === 'pendente');
const bate = (a, b) => a.start < b.end && b.start < a.end;

/* ── 1. o básico ───────────────────────────────────────────────────────
   Segunda tinha estudo 19h–20h30 e não foi marcado. Terça às 8h a rodada
   acontece: o bloco tem de ir para terça, sem bater no estudo de terça. */
let d = dados({
  routine: [
    bloco('cardio', 0, '19:00', '20:30'),
    bloco('pedi', 1, '19:00', '20:30'),
    bloco('plantao', 0, '07:00', '13:00', { type: 'Plantão' }),
  ],
});
let r = rolarPendentes(d, TER, 8 * 60);
let rem = remarcados(r);
if (rem.length === 1 && rem[0].label === 'cardio') ok('o estudo de segunda não marcado foi remarcado');
else falha('remarcados: ' + JSON.stringify(rem));
if (rem[0] && rem[0].date === TER) ok('para o primeiro dia com espaço (terça)');
else falha('foi para ' + (rem[0] && rem[0].date));
if (rem[0] && !bate(rem[0], { start: '19:00', end: '20:30' })) ok('sem passar por cima do estudo que já estava em terça');
else falha('bateu com o bloco de terça: ' + JSON.stringify(rem[0]));
if (rem[0] && rem[0].end.localeCompare(rem[0].start) > 0 && rem[0].de === SEG && rem[0].vezes === 1) {
  ok('guarda de onde veio e quantas vezes já andou');
} else falha('remarcado sem origem: ' + JSON.stringify(rem[0]));
if (!rem.some((b) => b.label === 'plantao')) ok('plantão perdido não se remarca');
else falha('o plantão foi remarcado');
if (r.rolagem.ate === SEG) ok('anota até que dia já conferiu');
else falha('ate: ' + r.rolagem.ate);
if (rem[0] && rem[0].start >= '08:15') ok('hoje, só depois de agora (com folga)');
else falha('remarcou para antes de agora: ' + (rem[0] && rem[0].start));

/* ── 2. rodar de novo não duplica, e devolve o mesmo objeto ─────────── */
const r2 = rolarPendentes(r, TER, 8 * 60 + 5);
if (r2 === r) ok('rodar de novo sem nada novo devolve o MESMO objeto (não regrava a conta)');
else falha('a segunda rodada mudou o estado: ' + JSON.stringify(remarcados(r2)));
const r3 = rolarPendentes({ ...r, rolagem: { ...r.rolagem, ate: '2026-10-04' } }, TER, 8 * 60);
if (remarcados(r3).length === 1) ok('e mesmo reconferindo o mesmo dia, não duplica (id vem do bloco e da data)');
else falha('duplicou: ' + remarcados(r3).length);

/* ── 3. marcado como cumprido não rola ──────────────────────────────── */
d = dados({ routine: [bloco('cardio', 0, '19:00', '20:30')], blocos: { [`cardio|${SEG}`]: 1 } });
r = rolarPendentes(d, TER, 8 * 60);
if (!remarcados(r).length) ok('bloco marcado como cumprido fica onde está');
else falha('remarcou o que foi cumprido');

/* ── 4. o de hoje ainda não rola ────────────────────────────────────── */
d = dados({ routine: [bloco('cardio', 1, '08:00', '09:00')], rolagem: { modo: 'mentoria', ate: SEG, semLugar: [] } });
r = rolarPendentes(d, TER, 22 * 60);
if (r === d) ok('o bloco de hoje, mesmo já passado, espera o dia acabar (ainda dá para marcar)');
else falha('remarcou um bloco de hoje');

/* ── 5. remarcado que passou de novo anda de novo ───────────────────── */
d = dados({ routine: [bloco('cardio', 0, '19:00', '20:30')] });
r = rolarPendentes(d, TER, 8 * 60);
r = rolarPendentes(r, QUA, 8 * 60);
rem = remarcados(r);
if (rem.length === 1 && rem[0].date >= QUA && rem[0].vezes === 2) ok('não cumprido de novo: anda outra vez e conta "2ª vez"');
else falha('segunda volta: ' + JSON.stringify(rem));
if (rem[0] && rem[0].de === SEG) ok('e continua dizendo de que dia veio');
else falha('perdeu a origem');

/* ── 6. dia de descanso é protegido ─────────────────────────────────── */
d = dados({
  routine: [
    bloco('cardio', 0, '19:00', '20:30'),
    bloco('folga', 1, '08:00', '22:00', { type: 'Descanso' }),
  ],
});
r = rolarPendentes(d, TER, 7 * 60);
rem = remarcados(r);
if (rem.length === 1 && rem[0].date !== TER) ok('não remarca no dia de descanso (vai para o dia seguinte)');
else falha('caiu no descanso: ' + JSON.stringify(rem));

/* ── 7. modo "só mentoria" não mexe nos blocos da pessoa ────────────── */
d = dados({ routine: [bloco('meu', 0, '19:00', '20:30', { origem: undefined })] });
r = rolarPendentes(d, TER, 8 * 60);
if (!remarcados(r).length) ok('no modo padrão, os blocos que a pessoa criou não andam');
else falha('remarcou um bloco da pessoa no modo só-mentoria');
r = rolarPendentes({ ...d, rolagem: { ...d.rolagem, modo: 'estudo' } }, TER, 8 * 60);
if (remarcados(r).length === 1 && remarcados(r)[0].fonte === 'meu') ok('no modo "todos os de estudo", andam também');
else falha('modo estudo: ' + JSON.stringify(remarcados(r)));
r = rolarPendentes({ ...dados({ routine: [bloco('cardio', 0, '19:00', '20:30')] }), rolagem: { modo: 'nao', ate: '2026-10-04', semLugar: [] } }, TER, 8 * 60);
if (!remarcados(r).length) ok('no modo "não remarcar", nada anda');
else falha('remarcou com o modo desligado');

/* ── 8. sem lugar: encurta, e se nem assim, lista ───────────────────── */
const cheio = (dia) => bloco('ocupado' + dia, dia, '06:00', '23:59', { type: 'Plantão', origem: undefined });
d = dados({ routine: [bloco('cardio', 0, '19:00', '20:30'), ...[1, 2, 3, 4, 5, 6].map(cheio), bloco('pausa', 0, '06:00', '23:59', { type: 'Plantão', origem: undefined })] });
r = rolarPendentes(d, TER, 8 * 60);
if (!remarcados(r).length && r.rolagem.semLugar.length === 1) ok('sem horário livre em sete dias, vai para a lista "sem horário", à vista');
else falha('sem lugar: ' + JSON.stringify({ rem: remarcados(r), sem: r.rolagem.semLugar }));
d = dados({ routine: [bloco('cardio', 0, '19:00', '21:00'), bloco('manha', 0, '06:00', '18:50', { type: 'Plantão', origem: undefined }), bloco('noite', 0, '21:00', '23:59', { type: 'Plantão', origem: undefined }), bloco('x', 1, '06:00', '21:20', { type: 'Plantão', origem: undefined }), ...[2, 3, 4, 5, 6].map(cheio)] });
r = rolarPendentes(d, TER, 6 * 60);
rem = remarcados(r);
if (rem.length === 1 && rem[0].encurtado) ok('se só cabe menor, entra encurtado (mínimo de 30 min)');
else falha('encurtado: ' + JSON.stringify(rem) + JSON.stringify(r.rolagem.semLugar));

/* ── 9. bloco da mentoria antes de o plano ir para a Agenda ─────────── */
d = dados({ routine: [bloco('cardio', 0, '19:00', '20:30')], mentoria: { aplicadoEm: new Date(`${TER}T07:00:00`).getTime() } });
r = rolarPendentes(d, TER, 8 * 60);
if (!remarcados(r).length) ok('não cobra o bloco de um dia em que o plano ainda nem estava na Agenda');
else falha('remarcou bloco de antes do plano');

/* ── 10. a mentoria fica sabendo ────────────────────────────────────── */
d = dados({ routine: [bloco('cardio', 0, '19:00', '20:30')] });
r = rolarPendentes(d, TER, 8 * 60);
const txt = pendentesParaIA(r, TER);
if (/FICARAM PARA TRÁS/.test(txt) && /cardio/.test(txt) && /remarcado 1x/.test(txt)) ok('a mentoria recebe a lista do que ficou para trás');
else falha('texto para a IA: ' + txt);

/* ── 11. primeira vez: só ontem, nada da semana inteira de uma vez ───── */
d = dados({ routine: [0, 1, 2, 3, 4, 5, 6].map((dia) => bloco('b' + dia, dia, '19:00', '19:30')), rolagem: { modo: 'mentoria', ate: '', semLugar: [] }, mentoria: {} });
r = rolarPendentes(d, '2026-10-08', 8 * 60);
if (remarcados(r).length === 1) ok('na primeira rodada só o dia de ontem conta, sem despejar a semana inteira');
else falha('primeira rodada remarcou ' + remarcados(r).length);

console.log(passos.join('\n'));
console.log(erros.length ? `\n${erros.length} erro(s)` : '\nnenhum erro');
process.exit(erros.length ? 1 : 0);
