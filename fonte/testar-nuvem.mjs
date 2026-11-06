/* Testa quem vence no encontro entre um aparelho e a conta na nuvem.
 *
 * Este é o teste que existe porque alguém perdeu dados. O relato: celular
 * novo, clicou em sincronizar, e a conta apareceu zerada — e o aparelho
 * antigo, ao abrir, baixaria esse zero por cima do que tinha.
 *
 * O caminho do estrago: num aparelho novo o app está vazio; o envio
 * automático subia esse vazio antes de o servidor ter respondido uma vez
 * sequer; o vazio ia por cima do que estava gravado. Nenhum erro na tela,
 * em nenhum dos dois passos.
 *
 *   node testar-nuvem.mjs
 */
const passos = [];
const erros = [];
const ok = (m) => passos.push('ok   ' + m);
const falha = (m) => { passos.push('FALHA ' + m); erros.push(m); };

const { decidirNuvem, mesclarDados, mudouDesdeBase } = await import('./_nuvem.mjs');

const caso = (nome, entrada, esperado) => {
  const r = decidirNuvem(entrada);
  if (r === esperado) ok(nome);
  else falha(`${nome}: esperava "${esperado}", veio "${r}"`);
};

/* ── o caso que apagou os dados ───────────────────────────────────────
 * Aparelho novo, cache vazio (porque é novo), servidor ainda sem
 * responder. "Não existe" vindo do cache não prova nada: se isto virar
 * "subir", o vazio deste aparelho vai por cima da conta. */
caso('aparelho novo, sem resposta do servidor: não faz nada',
  { existe: false, daCache: true, primeira: true }, 'esperar');

caso('e continua sem fazer nada nas vezes seguintes',
  { existe: false, daCache: false, primeira: false }, 'esperar');

/* ── conta realmente nova ──────────────────────────────────────────── */
caso('servidor confirma que a conta nunca guardou nada: este aparelho sobe o que tem',
  { existe: false, daCache: false, primeira: true }, 'subir');

/* ── aparelho novo achando a conta cheia ──────────────────────────── */
caso('aparelho vazio encontra conta com dados: baixa',
  { existe: true, daCache: false, primeira: true, mesmoAparelho: false,
    atualizadoEm: 1000, stampLocal: 0, riquezaLocal: 0, riquezaNuvem: 900 }, 'baixar');

/* ── aparelho cheio achando a conta pobre ───────────────────────────
 * Já foi "o aparelho ganha". Duas vezes uma cópia velha e cheia, num
 * aparelho sem marca de sincronização, passou por cima de semanas de
 * estudo. Existindo documento na conta, a conta vence; o que estava no
 * aparelho vai para as versões anteriores, e a pessoa decide. */
caso('aparelho com mais conteúdo que a conta, sem nunca ter sincronizado: ainda assim baixa (a cópia local vai para as versões)',
  { existe: true, daCache: false, primeira: true, mesmoAparelho: false,
    atualizadoEm: 1000, stampLocal: 0, riquezaLocal: 900, riquezaNuvem: 3 }, 'baixar');

/* Empate não conta como vitória do aparelho: na dúvida vale a conta, que é
   o que os outros aparelhos também vão ver. */
caso('empate de conteúdo: vale a conta',
  { existe: true, daCache: false, primeira: true, mesmoAparelho: false,
    atualizadoEm: 1000, stampLocal: 0, riquezaLocal: 50, riquezaNuvem: 50 }, 'baixar');

/* ── reencontro: o aparelho já conhecia a conta ───────────────────────
 * O caso que apagou uma semana de estudo: um aparelho parado, com uma
 * cópia velha e cheia, abriu a página, viu a conta pela "primeira vez"
 * daquela sessão e ganhou na riqueza. Se ele já sincronizou esta conta
 * antes (stampLocal > 0) e a conta andou desde então, o que ele tem é
 * velho, por mais que pareça. */
caso('aparelho que já sincronizou esta conta, e a conta mudou depois: baixa, mesmo com mais conteúdo aqui',
  { existe: true, daCache: false, primeira: true, mesmoAparelho: false,
    atualizadoEm: 9000, stampLocal: 1000, riquezaLocal: 900, riquezaNuvem: 1 }, 'baixar');

caso('aparelho que já sincronizou esta conta, e a conta não mudou desde então: nada a fazer',
  { existe: true, daCache: false, primeira: true, mesmoAparelho: false,
    atualizadoEm: 1000, stampLocal: 1000, riquezaLocal: 900, riquezaNuvem: 1 }, 'ignorar');

caso('a conta voltou no tempo por uma recuperação: o aparelho baixa a versão recuperada',
  { existe: true, daCache: false, primeira: true, mesmoAparelho: false,
    atualizadoEm: 9000, stampLocal: 8000, riquezaLocal: 600, riquezaNuvem: 590 }, 'baixar');

/* ── ecos e versões velhas ────────────────────────────────────────── */
caso('o que este mesmo aparelho acabou de escrever volta e é ignorado',
  { existe: true, daCache: false, primeira: false, mesmoAparelho: true,
    atualizadoEm: 9000, stampLocal: 1000, riquezaLocal: 10, riquezaNuvem: 10 }, 'ignorar');

caso('versão mais velha do que a que já está em mãos é ignorada',
  { existe: true, daCache: false, primeira: false, mesmoAparelho: false,
    atualizadoEm: 500, stampLocal: 1000, riquezaLocal: 10, riquezaNuvem: 10 }, 'ignorar');

caso('mesmo instante também é ignorado, que é o eco do próprio envio',
  { existe: true, daCache: false, primeira: false, mesmoAparelho: false,
    atualizadoEm: 1000, stampLocal: 1000, riquezaLocal: 10, riquezaNuvem: 10 }, 'ignorar');

/* ── depois do primeiro encontro ──────────────────────────────────── */
caso('fora do primeiro encontro, a conta mais nova sempre vence, mesmo com menos',
  { existe: true, daCache: false, primeira: false, mesmoAparelho: false,
    atualizadoEm: 9000, stampLocal: 1000, riquezaLocal: 900, riquezaNuvem: 1 }, 'baixar');

/* ── dados do cache, que são dados de verdade ─────────────────────── */
caso('documento existente vindo do cache ainda é decidido normalmente',
  { existe: true, daCache: true, primeira: true, mesmoAparelho: false,
    atualizadoEm: 1000, stampLocal: 0, riquezaLocal: 0, riquezaNuvem: 400 }, 'baixar');

/* ── com base guardada: subir o que ficou para trás, juntar no reencontro ── */
caso('mexeu aqui, fechou antes do envio, e a conta continua na mesma versão: sobe ao reabrir',
  { existe: true, daCache: false, primeira: true, mesmoAparelho: true,
    atualizadoEm: 1000, stampLocal: 1000, temBase: true, mudouAqui: true }, 'subir');
caso('sem nada mudado aqui e a conta na mesma versão: ignora',
  { existe: true, daCache: false, primeira: true, mesmoAparelho: true,
    atualizadoEm: 1000, stampLocal: 1000, temBase: true, mudouAqui: false }, 'ignorar');
caso('a conta andou (outro aparelho) e aqui não mudou nada: baixa',
  { existe: true, daCache: false, primeira: false, mesmoAparelho: false,
    atualizadoEm: 2000, stampLocal: 1000, temBase: true, mudouAqui: false }, 'baixar');
caso('a conta andou e aqui também mudou: junta, não substitui',
  { existe: true, daCache: false, primeira: true, mesmoAparelho: false,
    atualizadoEm: 2000, stampLocal: 1000, temBase: true, mudouAqui: true }, 'mesclar');
caso('sem base (aparelho de antes desta regra): a conta mais nova vence como antes',
  { existe: true, daCache: false, primeira: true, mesmoAparelho: false,
    atualizadoEm: 2000, stampLocal: 1000, temBase: false, mudouAqui: true }, 'baixar');
caso('conta nova continua subindo, com ou sem base',
  { existe: false, daCache: false, primeira: true, temBase: true, mudouAqui: true }, 'subir');
caso('"não existe" do cache continua sem fazer nada, com ou sem base',
  { existe: false, daCache: true, primeira: true, temBase: true, mudouAqui: true }, 'esperar');

{
  const sessao = (id, min) => ({ id, date: '2026-11-06', minutes: min });
  const base = {
    theme: 'dark', profile: { name: 'Zé' },
    sessions: [sessao('a', 30), sessao('b', 40)],
    marks: { cardio: { aula: false }, nefro: { aula: true } },
    flash: [{ id: 'c1', frente: 'x', prox: '2026-11-06' }, { id: 'c2', frente: 'y', prox: '2026-11-06' }],
    goals: { weekly: 600 },
    pomoLog: [{ date: '2026-11-05', mins: 25 }],
  };
  /* no celular: sessão nova, cartão c1 revisado, aula de cardio marcada, tema claro */
  const celular = JSON.parse(JSON.stringify(base));
  celular.theme = 'light';
  celular.sessions.push(sessao('cel', 50));
  celular.flash[0].prox = '2026-11-10';
  celular.marks.cardio.aula = true;
  celular.pomoLog.push({ date: '2026-11-06', mins: 25 });
  /* no computador (já na conta): outra sessão nova, sessão b apagada, cartão c2 revisado, meta mudada */
  const conta = JSON.parse(JSON.stringify(base));
  conta.sessions = [sessao('a', 30), sessao('pc', 90)];
  conta.flash[1].prox = '2026-11-12';
  conta.goals.weekly = 720;
  conta.pomoLog.push({ date: '2026-11-06', mins: 50 });
  const j = mesclarDados(base, celular, conta);
  const ids = j.sessions.map((x) => x.id).sort().join(',');
  if (ids === 'a,cel,pc') ok('sessões: as duas novas ficam, e a apagada no computador sai');
  else falha('sessões juntadas: ' + ids);
  if (j.flash.find((c) => c.id === 'c1').prox === '2026-11-10' && j.flash.find((c) => c.id === 'c2').prox === '2026-11-12') ok('cartões: a revisão feita em cada aparelho fica');
  else falha('cartões juntados: ' + JSON.stringify(j.flash));
  if (j.marks.cardio.aula === true && j.marks.nefro.aula === true) ok('aulas: a marcada no celular fica, a que já estava fica');
  else falha('aulas juntadas: ' + JSON.stringify(j.marks));
  if (j.goals.weekly === 720) ok('o que só o computador mudou fica');
  else falha('meta: ' + j.goals.weekly);
  if (j.pomoLog.length === 3) ok('lista sem id: a da conta, mais o que entrou só aqui');
  else falha('pomoLog: ' + JSON.stringify(j.pomoLog));
  if (j.theme === 'light') ok('tema é do aparelho e não viaja');
  else falha('tema: ' + j.theme);

  /* o mesmo campo mexido dos dois lados: vale a conta */
  const l2 = { ...base, profile: { name: 'José' } }, n2 = { ...base, profile: { name: 'Zezinho' } };
  if (mesclarDados(base, l2, n2).profile.name === 'Zezinho') ok('mesmo campo mudado nos dois: vale a conta (o daqui vai para as versões)');
  else falha('conflito de campo');

  /* apagado aqui, sem mexer lá: sai; apagado aqui mas mexido lá: fica */
  const l3 = { ...base, flash: [base.flash[1]] };
  const n3 = JSON.parse(JSON.stringify(base));
  if (mesclarDados(base, l3, n3).flash.length === 1) ok('cartão apagado neste aparelho sai da conta');
  else falha('apagar cartão');
  const n4 = JSON.parse(JSON.stringify(base)); n4.flash[0].frente = 'editado lá';
  if (mesclarDados(base, l3, n4).flash.some((c) => c.frente === 'editado lá')) ok('mas se o outro aparelho editou o mesmo cartão, ele fica');
  else falha('apagar x editar');

  if (!mudouDesdeBase(base, { ...base, theme: 'light', layout: 'x' })) ok('trocar só o tema não conta como mudança a subir');
  else falha('tema contou como mudança');
  if (mudouDesdeBase(base, celular)) ok('mudança de verdade conta');
  else falha('mudança não detectada');
}

console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
