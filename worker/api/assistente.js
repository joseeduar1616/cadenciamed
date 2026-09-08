/* Assistente do painel · Cloudflare Pages Functions
 *
 * A chave da IA NUNCA vai para o navegador: fica em variável de ambiente do
 * Cloudflare, e só este código, que roda no servidor, a enxerga.
 *
 * Funciona com dois provedores; quem manda é a variável que existir:
 *   GEMINI_API_KEY     → Gemini, do Google (tem camada gratuita)
 *   ANTHROPIC_API_KEY  → Claude, da Anthropic (pré-pago)
 * Com as duas, o Gemini ganha. IA_PROVEDOR força um dos dois.
 * GEMINI_MODELO e ANTHROPIC_MODELO trocam o modelo sem mexer no código.
 */
import {
  json, quemPede, ehDono, corpoJson, contaDeServico, tokenDeAcesso, validoAte,
} from "./_comum.js";

/* Quem pode usar o assistente: o dono e quem tem plano em dia.
 *
 * A assinatura é lida com a conta de serviço, e não com o token de quem
 * está navegando: assinaturas/{uid} é somente leitura no cliente, mas quem
 * decide aqui não pode depender de nada que venha do navegador.
 *
 * Sem a conta de serviço cadastrada não há como conferir plano, e aí só o
 * dono passa. Liberar geral nesse caso deixaria qualquer pessoa gastando a
 * cota da conta que paga. */
async function podeUsar(pessoa, env) {
  if (ehDono(pessoa.email)) return { ok: true };
  const conta = contaDeServico(env);
  if (!conta) {
    return { ok: false, erro: "O assistente está indisponível: falta configurar o servidor." };
  }
  try {
    const token = await tokenDeAcesso(conta);
    if (await validoAte(token, pessoa.uid) > Date.now()) return { ok: true };
  } catch (e) {
    return { ok: false, erro: "Não consegui conferir sua assinatura. Tente de novo em instantes." };
  }
  return { ok: false, erro: "O assistente faz parte do plano completo." };
}

const LIMITE_ENTRADA = 24000;   // caracteres, para conter o custo por chamada
/* Teto de saída. Estava em 1400, e um plano de semana passa disso fácil: a
   resposta chegava cortada no meio da frase, sem nada dizendo por quê. Os
   modelos de hoje também gastam parte deste teto pensando antes de escrever,
   o que apertava ainda mais o que sobrava para o texto. */
const MAX_SAIDA = 4000;

/* Modelo padrão do Gemini.
 *
 * O Google aposenta modelo sem aviso: o gemini-2.5-flash parou de aceitar
 * conta nova e o assistente passou a devolver a recusa da própria API. Se
 * acontecer de novo, não precisa recompilar nem publicar: cadastre
 * GEMINI_MODELO nas variáveis do Worker com o nome que a mensagem de erro
 * indicar, e ela ganha deste padrão. */
const GEMINI_PADRAO = "gemini-3.6-flash";

/* Traduz o erro do provedor para uma frase que o estudante entenda, sem
   esconder o motivo real, que é o que costuma resolver mais rápido. */
function recado(status, real, provedor, modeloUsado) {
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

/* ── Gemini ────────────────────────────────────────────────────────────
   O Gemini chama de "model" o que a Anthropic chama de "assistant", e as
   instruções do sistema vão num campo separado, fora da conversa. */
async function chamarGemini(chave, modelo, { sistema, mensagens }) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": chave },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: sistema }] },
        contents: mensagens.map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        generationConfig: { maxOutputTokens: MAX_SAIDA },
      }),
    });

  if (!r.ok) {
    const detalhe = await r.text().catch(() => "");
    let real = "";
    try { real = (JSON.parse(detalhe).error || {}).message || ""; } catch (e) { /* texto puro */ }
    console.error("gemini", r.status, detalhe.slice(0, 500));
    return { erro: recado(r.status, real, "gemini", modelo) };
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
async function chamarAnthropic(chave, modelo, { sistema, mensagens }) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": chave,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: modelo, max_tokens: MAX_SAIDA, system: sistema, messages: mensagens }),
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

function escolherProvedor(env) {
  const pedido = String(env.IA_PROVEDOR || "").toLowerCase();
  const gem = env.GEMINI_API_KEY, ant = env.ANTHROPIC_API_KEY;
  if (pedido === "gemini") return gem ? { nome: "gemini", chave: gem } : null;
  if (pedido === "anthropic") return ant ? { nome: "anthropic", chave: ant } : null;
  /* sem preferência: o Gemini vem primeiro por ter camada gratuita */
  if (gem) return { nome: "gemini", chave: gem };
  if (ant) return { nome: "anthropic", chave: ant };
  return null;
}

export async function onRequest({ request, env }) {
  const provedor = escolherProvedor(env);
  const modelo = provedor && provedor.nome === "gemini"
    ? (env.GEMINI_MODELO || GEMINI_PADRAO)
    : (env.ANTHROPIC_MODELO || "claude-sonnet-5");

  /* Abrir o endereço no navegador mostra qual IA está ligada. Serve para
     conferir, depois de publicar, se a chave chegou até aqui. Nenhuma chave
     é mostrada, só o nome do provedor e do modelo. */
  if (request.method === "GET") {
    return json({
      provedor: provedor ? provedor.nome : "nenhum",
      modelo: provedor ? modelo : null,
      chaves: {
        GEMINI_API_KEY: !!env.GEMINI_API_KEY,
        ANTHROPIC_API_KEY: !!env.ANTHROPIC_API_KEY,
        FIREBASE_API_KEY: !!env.FIREBASE_API_KEY,
        IA_PROVEDOR: env.IA_PROVEDOR || null,
      },
    });
  }

  if (request.method !== "POST") return json({ erro: "Método não permitido." }, 405);

  if (!provedor) {
    return json({
      erro: "A chave da IA não está configurada. Cadastre GEMINI_API_KEY (ou ANTHROPIC_API_KEY) nas variáveis do site e publique de novo.",
    }, 500);
  }

  const corpo = await corpoJson(request);
  if (!corpo) return json({ erro: "Pedido inválido." }, 400);

  /* Sem FIREBASE_API_KEY não há como saber quem está pedindo, e aí o certo é
     recusar: o endereço desta função é público, e liberar geral deixaria
     qualquer pessoa gastar a cota da conta que paga. */
  if (!env.FIREBASE_API_KEY) {
    return json({
      erro: "Falta FIREBASE_API_KEY nas variáveis do site. Sem ela não dá para confirmar quem está pedindo, e o assistente fica desligado.",
    }, 500);
  }

  /* O navegador esconde a aba de quem não assina, mas quem protege de
     verdade é esta checagem. */
  if (!corpo.token) return json({ erro: "Entre na sua conta para usar o assistente." }, 403);
  const pessoa = await quemPede(corpo.token, env.FIREBASE_API_KEY);
  if (!pessoa) return json({ erro: "Sua sessão expirou. Entre de novo." }, 403);
  const permissao = await podeUsar(pessoa, env);
  if (!permissao.ok) return json({ erro: permissao.erro }, 403);

  const mensagens = Array.isArray(corpo.mensagens) ? corpo.mensagens.slice(-14) : [];
  if (mensagens.length === 0) return json({ erro: "Nenhuma mensagem enviada." }, 400);

  const sistema = `${String(corpo.instrucoes || "").slice(0, 6000)}
\n=== DADOS ATUAIS DO PAINEL ===\n${String(corpo.contexto || "").slice(0, LIMITE_ENTRADA)}`;

  const limpas = mensagens
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, 6000) }));

  /* A conversa precisa começar por uma fala do estudante: os dois provedores
     recusam um histórico que abre com a resposta da IA. */
  while (limpas.length && limpas[0].role === "assistant") limpas.shift();
  if (limpas.length === 0) return json({ erro: "Nenhuma mensagem enviada." }, 400);

  try {
    const r = provedor.nome === "gemini"
      ? await chamarGemini(provedor.chave, modelo, { sistema, mensagens: limpas })
      : await chamarAnthropic(provedor.chave, modelo, { sistema, mensagens: limpas });
    if (r.erro) return json({ erro: r.erro }, 502);
    return json({ texto: r.texto, cortado: !!r.cortado });
  } catch (e) {
    console.error("falha", provedor.nome, e && e.message);
    return json({ erro: "Não consegui alcançar o serviço da IA." }, 502);
  }
}
