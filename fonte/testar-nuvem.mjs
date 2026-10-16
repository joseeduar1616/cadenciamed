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

const { decidirNuvem } = await import('./_nuvem.mjs');

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

/* ── aparelho cheio achando a conta pobre ─────────────────────────── */
caso('aparelho com mais conteúdo que a conta: o aparelho ganha e sobe',
  { existe: true, daCache: false, primeira: true, mesmoAparelho: false,
    atualizadoEm: 1000, stampLocal: 0, riquezaLocal: 900, riquezaNuvem: 3 }, 'manter-local');

/* Empate não conta como vitória do aparelho: na dúvida vale a conta, que é
   o que os outros aparelhos também vão ver. */
caso('empate de conteúdo: vale a conta',
  { existe: true, daCache: false, primeira: true, mesmoAparelho: false,
    atualizadoEm: 1000, stampLocal: 0, riquezaLocal: 50, riquezaNuvem: 50 }, 'baixar');

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

console.log(passos.join('\n'));
console.log('\n' + (erros.length ? `${erros.length} PROBLEMA(S):\n` + erros.join('\n') : 'nenhum erro'));
if (erros.length) process.exitCode = 1;
