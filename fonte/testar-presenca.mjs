/* Testa a regra do "você está aí?" (base.jsx, copiada pelo
 * extrair_memoria.py para _presenca.mjs).
 *
 * O que ela não pode fazer: perguntar antes dos 30 minutos, parar antes do
 * minuto de espera acabar, contar o minuto sem resposta como estudo, ou
 * deixar o site fechado inflar as horas.
 *
 *   node testar-presenca.mjs
 */
import {
  PRESENCA_INTERVALO_MS, PRESENCA_ESPERA_MS, estadoDaPresenca,
  corridoAtePresenca, restoAtePresenca,
} from './_presenca.mjs';

const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };
const confere = (cond, m, detalhe) => (cond ? ok(m) : falha(m + (detalhe !== undefined ? ': ' + JSON.stringify(detalhe) : '')));

const MIN = 60 * 1000;
const t0 = Date.UTC(2026, 8, 27, 13, 0, 0);

confere(PRESENCA_INTERVALO_MS === 30 * MIN, 'a pergunta vem de meia em meia hora');
confere(PRESENCA_ESPERA_MS === 1 * MIN, 'a pergunta espera 1 minuto');

/* ── quando perguntar ───────────────────────────────────────────────── */
let e = estadoDaPresenca(0, t0 + 5 * 60 * MIN);
confere(e.fase === 'ok', 'sem início marcado, não pergunta nada', e);

e = estadoDaPresenca(t0, t0 + 29 * MIN + 59 * 1000);
confere(e.fase === 'ok', 'aos 29:59 ainda não pergunta', e);

e = estadoDaPresenca(t0, t0 + 30 * MIN);
confere(e.fase === 'perguntando' && e.restaMs === MIN, 'aos 30:00 pergunta, com 1 minuto para responder', e);

e = estadoDaPresenca(t0, t0 + 30 * MIN + 45 * 1000);
confere(e.fase === 'perguntando' && e.restaMs === 15 * 1000, 'a contagem da resposta desce junto com o relógio', e);

e = estadoDaPresenca(t0, t0 + 31 * MIN - 1);
confere(e.fase === 'perguntando', 'um instante antes do minuto acabar, ainda dá para responder', e);

e = estadoDaPresenca(t0, t0 + 31 * MIN);
confere(e.fase === 'sumiu' && e.perguntaEm === t0 + 30 * MIN, 'com o minuto vencido, para — no instante da pergunta', e);

/* ── responder recomeça a meia hora ──────────────────────────────────── */
const respondeu = t0 + 30 * MIN + 20 * 1000;
e = estadoDaPresenca(respondeu, t0 + 55 * MIN);
confere(e.fase === 'ok', 'quem respondeu não é perguntado de novo antes de outra meia hora', e);
e = estadoDaPresenca(respondeu, respondeu + 30 * MIN);
confere(e.fase === 'perguntando', 'e é perguntado de novo meia hora depois da resposta', e);

/* ── o site fechado não infla as horas ──────────────────────────────── */
e = estadoDaPresenca(t0, t0 + 3 * 60 * MIN);
confere(e.fase === 'sumiu' && e.perguntaEm === t0 + 30 * MIN,
  'fechou o site correndo e voltou 3 h depois: parou aos 30 min, não aos 180', e);

/* tempo corrido: 10 min já guardados, retomou em t0, sumiu */
let seg = corridoAtePresenca(600, t0, e.perguntaEm);
confere(seg === 600 + 30 * 60, 'o tempo corrido soma só até a pergunta', seg);
confere(corridoAtePresenca(600, 0, t0) === 600, 'sem começo marcado, fica o que já estava guardado');
confere(corridoAtePresenca(-5, t0, t0 - MIN) === 0, 'nunca negativo, nem com relógio andando para trás');

/* pomodoro de 50 min começado em t0: parou aos 30, faltavam 20 */
const fim50 = t0 + 50 * MIN;
let resto = restoAtePresenca(fim50, t0 + 30 * MIN, 50 * 60);
confere(resto === 20 * 60, 'pomodoro de 50 min parado aos 30 guarda os 20 que faltavam', resto);
resto = restoAtePresenca(t0 + 10 * MIN, t0 + 30 * MIN, 25 * 60);
confere(resto === 0, 'fase que já tinha acabado antes da pergunta fica em zero, não negativa', resto);
resto = restoAtePresenca(t0 + 90 * MIN, t0 + 30 * MIN, 25 * 60);
confere(resto === 25 * 60, 'o que falta nunca passa da duração da fase', resto);

/* ── simulação: um dia com três respostas e um sumiço ───────────────── */
{
  let desde = t0;
  const respostas = [t0 + 30 * MIN + 10 * 1000, t0 + 60 * MIN + 40 * 1000, t0 + 91 * MIN];
  let parou = 0;
  for (let agora = t0; agora <= t0 + 4 * 60 * MIN; agora += 5 * 1000) {
    const r = respostas.find((x) => x === agora);
    const est = estadoDaPresenca(desde, agora);
    if (est.fase === 'sumiu') { parou = est.perguntaEm; break; }
    if (r && est.fase === 'perguntando') desde = r;
  }
  /* a terceira resposta (91:00) chega 20 s depois da pergunta das 90:40 —
     ainda vale; depois dela, ninguém responde mais */
  confere(parou === t0 + 91 * MIN + 30 * MIN, 'numa sessão longa, para meia hora depois da última resposta', (parou - t0) / MIN);
}

console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
