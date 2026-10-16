/* Fala com os provedores de IA · compartilhado entre o assistente do
 * cronograma e o montador de flashcards.
 *
 * Funciona com dois provedores; quem manda é a variável que existir:
 *   GEMINI_API_KEY     → Gemini, do Google (tem camada gratuita)
 *   ANTHROPIC_API_KEY  → Claude, da Anthropic (pré-pago)
 * Com as duas, o Gemini ganha. IA_PROVEDOR força um dos dois.
 * GEMINI_MODELO e ANTHROPIC_MODELO trocam o modelo sem mexer no código.
 */
import { contaDeServico, tokenDeAcesso, validoAte, ehDono, BASE_FIRESTORE } from "./_comum.js";
import { podePelaCota, registroApos } from "./_limites.js";

/* Modelo padrão do Gemini.
 *
 * O Flash é o corte rápido e barato da família, que é o que estas rotas
 * pedem: responder uma dúvida de estudo, separar um cronograma em aulas,
 * transcrever a foto de um calendário. Nenhuma delas precisa do modelo
 * grande, e o grande custa algumas vezes mais por pedido.
 *
 * O Google aposenta modelo sem aviso, e já aconteceu duas vezes aqui: o
 * gemini-2.5-flash parou de aceitar conta nova, e depois o gemini-1.5-flash
 * deixou de ser reconhecido para chave de projeto novo. Por isso o padrão
 * anda junto com o que está no ar: quando o Google aposentar este também,
 * não precisa recompilar nem publicar na hora — cadastre GEMINI_MODELO nas
 * variáveis do Worker com o nome que a mensagem de erro indicar, e ela ganha
 * deste padrão. Depois vale trazer o nome novo para cá, senão o código e o
 * site passam a discordar em silêncio. */
export const GEMINI_PADRAO = "gemini-3.6-flash";

/* Quem pode usar a IA: o dono e quem tem plano em dia.
 *
 * A assinatura é lida com a conta de serviço, e não com o token de quem
 * está navegando: assinaturas/{uid} é somente leitura no cliente, mas quem
 * decide aqui não pode depender de nada que venha do navegador.
 *
 * Sem a conta de serviço cadastrada não há como conferir plano, e aí só o
 * dono passa. Liberar geral nesse caso deixaria qualquer pessoa gastando a
 * cota da conta que paga. */
export async function podeUsar(pessoa, env, rota) {
  if (ehDono(pessoa.email)) return { ok: true };
  const conta = contaDeServico(env);
  if (!conta) {
    return { ok: false, erro: "O assistente está indisponível: falta configurar o servidor." };
  }
  let token;
  try {
    token = await tokenDeAcesso(conta);
    if (await validoAte(token, pessoa.uid) <= Date.now()) {
      return { ok: false, erro: "Esta função faz parte do plano completo." };
    }
  } catch (e) {
    return { ok: false, erro: "Não consegui conferir sua assinatura. Tente de novo em instantes." };
  }

  if (!rota) return { ok: true };
  return cobrar(token, pessoa.uid, rota);
}

/* ── o teto diário ────────────────────────────────────────────────────
 *
 * A assinatura é um valor fixo por mês; o custo de cada chamada à IA é
 * variável. Sem teto, uma conta que processe um acervo inteiro num sábado
 * gasta mais num dia do que paga num ano — e sem ter feito nada de errado,
 * porque o site é que oferece o botão.
 *
 * A conta é marcada ANTES da chamada ao provedor, e não depois. Assim uma
 * resposta que falhe no meio ainda conta um ponto, o que é injusto de vez
 * em quando; contar depois seria não contar nada quando o Worker fosse
 * interrompido, que é como um teto deixa de existir sem ninguém notar.
 *
 * Se o banco não responder, a chamada PASSA. O teto existe para conter o
 * caso extremo, não para ser mais uma peça capaz de derrubar o site: uma
 * falha de leitura do Firestore não pode virar "a IA parou para todo
 * mundo".
 */
const ORCAMENTO = (uid) => `${BASE_FIRESTORE}/uso/${encodeURIComponent(uid)}`;

async function cobrar(token, uid, rota) {
  const agora = Date.now();
  let registro = null;
  try {
    const r = await fetch(ORCAMENTO(uid), { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) {
      const f = ((await r.json().catch(() => null)) || {}).fields || {};
      registro = {
        dia: (f.dia && f.dia.stringValue) || "",
        pontos: Number((f.pontos && (f.pontos.integerValue || f.pontos.doubleValue)) || 0),
      };
    }
  } catch (e) {
    return { ok: true };   /* banco fora do ar não derruba a IA */
  }

  const veredito = podePelaCota({ registro, rota, dono: false, agora });
  if (!veredito.ok) return { ok: false, erro: veredito.erro };

  const novo = registroApos(registro, rota, agora);
  try {
    await fetch(ORCAMENTO(uid), {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          dia: { stringValue: novo.dia },
          pontos: { integerValue: String(novo.pontos) },
          em: { doubleValue: novo.em },
        },
      }),
    });
  } catch (e) { /* não gravou: no pior caso esta chamada saiu de graça */ }
  return { ok: true, restante: veredito.restante };
}

/* Traduz o erro do provedor para uma frase que o estudante entenda, sem
   esconder o motivo real, que é o que costuma resolver mais rápido. */
export function recado(status, real, provedor, modeloUsado) {
  const ondePagar = provedor === "gemini"
    ? "Confira a cota da chave em aistudio.google.com."
    : "Confira o saldo em console.anthropic.com, em Plans & Billing.";
  if (status === 401 || status === 403) {
    return provedor === "gemini"
      ? "A chave do Gemini foi recusada. Confira GEMINI_API_KEY nas variáveis do site."
      : "A chave da API foi recusada. Confira ANTHROPIC_API_KEY nas variáveis do site.";
  }
  if (status === 429) return `Cota esgotada ou pedidos demais seguidos. Espere um pouco. ${ondePagar}`;
  if (status === 503 || status === 529) return "O serviço está sobrecarregado. Tente de novo em instantes.";

  /* Modelo aposentado. Acontece sem aviso e a mensagem crua não diz o que
     fazer, embora costume trazer o nome do substituto. O conserto não exige
     publicar de novo: é cadastrar a variável. */
  if (/is no longer available|not found|is not supported|has been (?:deprecated|retired)/i.test(real || "")) {
    /* A recusa costuma citar o substituto, em "models/nome". Fica o primeiro
       que não for o que acabou de ser recusado. */
    const citados = [...String(real).matchAll(/models\/([\w.-]+)/g)].map((m) => m[1]);
    const sugerido = citados.filter((m) => m !== modeloUsado)[0];
    const variavel = provedor === "gemini" ? "GEMINI_MODELO" : "ANTHROPIC_MODELO";
    return `O modelo ${modeloUsado} saiu do ar. Cadastre ${variavel}`
      + (sugerido ? ` com "${sugerido}"` : " com um modelo atual")
      + ` nas variáveis do Worker. O provedor disse: ${real}`;
  }

  if (real) return `A IA recusou o pedido: ${real}`;
  return `O serviço respondeu com erro ${status}.`;
}

/* ── mensagem com imagem ───────────────────────────────────────────────
 *
 * O content de uma mensagem pode ser texto puro, como sempre foi, ou uma
 * lista de pedaços: { texto } e { imagem: { tipo, dados } }, com os dados
 * em base64 sem o prefixo "data:". É o que a leitura de foto usa.
 *
 * Os dois provedores aceitam imagem, cada um com o seu formato, e é só isso
 * que estas duas funções fazem: traduzir a mesma lista para cada um. */
const pedacos = (conteudo) => (
  typeof conteudo === "string" ? [{ texto: conteudo }] : (conteudo || [])
);

function partesGemini(conteudo) {
  return pedacos(conteudo).map((p) => {
    const midia = p.imagem || p.audio;
    return midia
      ? { inline_data: { mime_type: midia.tipo, data: midia.dados } }
      : { text: p.texto || "" };
  });
}

function partesAnthropic(conteudo) {
  if (typeof conteudo === "string") return conteudo;
  /* A API da Anthropic não recebe áudio. Quem precisa de áudio (a gravação
     de aula) confere o provedor antes de chamar; isto aqui só impede que um
     pedaço de áudio vire uma requisição malformada se algum dia escapar. */
  return pedacos(conteudo).map((p) => (p.imagem
    ? { type: "image", source: { type: "base64", media_type: p.imagem.tipo, data: p.imagem.dados } }
    : p.audio
      ? { type: "text", text: "[trecho de áudio: este provedor não recebe áudio]" }
      : { type: "text", text: p.texto || "" }));
}

/* ── Gemini ────────────────────────────────────────────────────────────
   O Gemini chama de "model" o que a Anthropic chama de "assistant", e as
   instruções do sistema vão num campo separado, fora da conversa. */
export async function chamarGemini(chave, modelo, { sistema, mensagens, maxSaida }) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: sistema }] },
        contents: mensagens.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: partesGemini(m.content),
        })),
        generationConfig: { maxOutputTokens: maxSaida },
      }),
    });

  if (!r.ok) {
    const detalhe = await r.text().catch(() => "");
    let real = "";
    try { real = (JSON.parse(detalhe).error || {}).message || ""; } catch (e) { /* texto puro */ }
    console.error("gemini", r.status, detalhe.slice(0, 500));
    return { erro: recado(r.status, real, "gemini", modelo), status: r.status, real };
  }

  const j = await r.json();
  const c = (j.candidates || [])[0];

  /* O Gemini responde 200 mesmo quando corta por filtro de conteúdo ou por
     falta de espaço, e aí não vem texto nenhum. Sem tratar isso, o estudante
     veria só "resposta vazia" e não saberia o que fazer. */
  if (!c) {
    const bloqueio = ((j.promptFeedback || {}).blockReason) || "";
    return { erro: bloqueio ? `O Gemini bloqueou o pedido (${bloqueio}).` : "A IA não respondeu nada." };
  }
  const texto = ((c.content || {}).parts || []).map((p) => p.text || "").join("").trim();
  if (!texto) {
    if (c.finishReason === "MAX_TOKENS") return { erro: "A resposta ficou longa demais e foi cortada antes de começar. Pergunte de novo, mais específico." };
    if (c.finishReason === "SAFETY") return { erro: "O Gemini bloqueou a resposta por política de conteúdo." };
    return { erro: "A IA devolveu uma resposta vazia." };
  }
  /* Veio texto, mas o modelo parou no teto: a resposta acaba no meio da
     frase. Antes ela chegava assim, calada, e parecia travamento. */
  return { texto, cortado: c.finishReason === "MAX_TOKENS" };
}

/* ── Anthropic ─────────────────────────────────────────────────────── */
export async function chamarAnthropic(chave, modelo, { sistema, mensagens, maxSaida }) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": chave,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: modelo, max_tokens: maxSaida, system: sistema,
      messages: mensagens.map((m) => ({ role: m.role, content: partesAnthropic(m.content) })),
    }),
  });

  if (!r.ok) {
    const detalhe = await r.text().catch(() => "");
    let real = "";
    try { real = (JSON.parse(detalhe).error || {}).message || ""; } catch (e) { /* texto puro */ }
    console.error("anthropic", r.status, detalhe.slice(0, 500));
    return { erro: recado(r.status, real, "anthropic", modelo) };
  }

  const j = await r.json();
  const texto = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
  if (!texto) return { erro: "A IA devolveu uma resposta vazia." };
  return { texto, cortado: j.stop_reason === "max_tokens" };
}

export function escolherProvedor(env) {
  const pedido = String(env.IA_PROVEDOR || "").toLowerCase();
  const gem = env.GEMINI_API_KEY, ant = env.ANTHROPIC_API_KEY;
  if (pedido === "gemini") return gem ? { nome: "gemini", chave: gem } : null;
  if (pedido === "anthropic") return ant ? { nome: "anthropic", chave: ant } : null;
  /* sem preferência: o Gemini vem primeiro por ter camada gratuita */
  if (gem) return { nome: "gemini", chave: gem };
  if (ant) return { nome: "anthropic", chave: ant };
  return null;
}

/* Quem entende áudio. Só o Gemini recebe áudio, então a gravação de aula
   usa ele mesmo quando IA_PROVEDOR aponta para a Anthropic — desde que a
   chave dele exista. */
export function provedorDeAudio(env) {
  return env.GEMINI_API_KEY ? { nome: "gemini", chave: env.GEMINI_API_KEY } : null;
}

export function modeloAtual(provedor, env) {
  return provedor && provedor.nome === "gemini"
    ? (env.GEMINI_MODELO || GEMINI_PADRAO)
    : (env.ANTHROPIC_MODELO || "claude-sonnet-5");
}

/* Chama o provedor escolhido e devolve { texto, cortado } ou { erro }. */
export async function chamarIA(provedor, modelo, { sistema, mensagens, maxSaida }) {
  return provedor.nome === "gemini"
    ? chamarGemini(provedor.chave, modelo, { sistema, mensagens, maxSaida })
    : chamarAnthropic(provedor.chave, modelo, { sistema, mensagens, maxSaida });
}
