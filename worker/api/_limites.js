/* Teto de uso da IA, por pessoa e por dia · compartilhado pelas rotas de IA
 *
 * O problema que isto resolve não é abuso: é aritmética. Uma assinatura
 * mensal é um valor fixo, e o custo de cada chamada à IA é variável. Uma
 * pessoa que mande trinta PDFs de sessenta páginas num sábado consome, num
 * dia, mais do que paga num ano — e não há nada de errado no que ela fez:
 * o site oferece o botão. Sem teto, a conta de um assinante consegue
 * inverter o sinal do lucro de todos os outros.
 *
 * O desenho tem três decisões que valem explicar:
 *
 *   1. O teto é em PONTOS, e não em número de chamadas. Comentar uma prova
 *      de trezentas questões custa quarenta vezes mais que responder uma
 *      dúvida no assistente. Contar as duas como "uma chamada" é dizer que
 *      elas custam igual, e elas não custam.
 *   2. O dia é o do FUSO DE BRASÍLIA, e não UTC. Um teto que vira à meia-
 *      noite de Londres zera às 21h para quem estuda no Brasil, que é
 *      exatamente quando a pessoa está estudando — e ela ganharia dois
 *      orçamentos numa noite.
 *   3. Estourar o teto NÃO é erro nem bloqueio da conta: a mensagem diz
 *      quanto falta para virar o dia. Tratar como falha faria a pessoa
 *      achar que o site quebrou, e o suporte receber um chamado por isso.
 */

/* Quanto custa cada rota, em pontos. Os números são a razão aproximada
   entre os tamanhos de entrada e saída de cada uma, arredondada para
   grosso: o que importa é a proporção, não a precisão. */
export const CUSTO = {
  assistente: 1,
  mentor: 1,
  "cronograma-ia": 3,
  "ler-foto": 2,
  "buscar-imagem": 1,
  "flashcards-ia": 4,
  "questoes-ia": 4,
  "treino-ia": 2,
  /* A prova é comentada em lotes, e cada lote é uma chamada de verdade ao
     modelo. É a rota mais cara do site, com folga. */
  "provas-ia": 12,
  /* A aula gravada: cada trecho de dez minutos é uma chamada com áudio, e a
     organização final é uma chamada longa de texto. Uma aula de duas horas
     dá doze trechos — 36 pontos mais 6, bem dentro do dia. */
  "aula-transcrever": 3,
  "aula-organizar": 6,
};

export const CUSTO_PADRAO = 2;

/* O orçamento de um dia.
 *
 * 120 pontos é o que dá, por exemplo, para comentar dez provas, ou montar
 * trinta baralhos de flashcards, ou cento e vinte perguntas ao assistente —
 * num único dia. Quem estuda de verdade não chega perto; quem chega está
 * processando um acervo, que é outra coisa. */
export const ORCAMENTO_DIA = 120;

/* O dono não tem teto: é ele quem paga a conta, e é ele quem precisa
   processar acervo para publicar prova comentada por código. */
export const ORCAMENTO_DONO = Infinity;

/* Brasília, três horas atrás de UTC. Sem horário de verão desde 2019. */
const FUSO_BRASIL = -3;

export function diaDeCobranca(agora) {
  const t = Number(agora);
  if (!Number.isFinite(t)) return "";
  return new Date(t + FUSO_BRASIL * 3600000).toISOString().slice(0, 10);
}

export const custoDaRota = (rota) => {
  const c = CUSTO[String(rota || "").replace(/^\/api\//, "")];
  return Number.isFinite(c) ? c : CUSTO_PADRAO;
};

/* O gasto de hoje, a partir do que está gravado.
 *
 * O registro guarda o dia junto do total. Se o dia gravado não é o de hoje,
 * o total vale zero — assim o contador se zera sozinho, sem ninguém
 * precisar varrer o banco à meia-noite. */
export function gastoDeHoje(registro, agora) {
  const r = registro || {};
  if (String(r.dia || "") !== diaDeCobranca(agora)) return 0;
  const g = Number(r.pontos);
  return Number.isFinite(g) && g > 0 ? g : 0;
}

/* Quantas horas faltam para o orçamento virar. Dizer "amanhã" às 23h50 é
   tecnicamente certo e praticamente inútil. */
export function faltaParaVirar(agora) {
  const t = Number(agora);
  if (!Number.isFinite(t)) return "";
  const local = new Date(t + FUSO_BRASIL * 3600000);
  const minutos = 24 * 60 - (local.getUTCHours() * 60 + local.getUTCMinutes());
  if (minutos <= 60) return `em ${Math.max(1, minutos)} min`;
  return `em ${Math.round(minutos / 60)}h`;
}

/* A decisão. Separada do banco para poder ser testada sem rede. */
export function podePelaCota({ registro, rota, dono, agora }) {
  const orcamento = dono ? ORCAMENTO_DONO : ORCAMENTO_DIA;
  const custo = custoDaRota(rota);
  const gasto = gastoDeHoje(registro, agora);

  if (gasto + custo <= orcamento) {
    return { ok: true, gasto, custo, restante: orcamento - gasto - custo };
  }
  return {
    ok: false,
    gasto,
    custo,
    restante: 0,
    erro: `Você usou a IA bastante hoje e chegou ao limite diário. Ele volta ao cheio ${faltaParaVirar(agora)}. Tudo o que já foi gerado continua salvo.`,
  };
}

/* O registro novo depois de uma chamada. Puro: quem grava é a rota. */
export function registroApos(registro, rota, agora) {
  return {
    dia: diaDeCobranca(agora),
    pontos: gastoDeHoje(registro, agora) + custoDaRota(rota),
    em: Number(agora) || 0,
  };
}
