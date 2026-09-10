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
import { json, quemPede, corpoJson } from "./_comum.js";
import { podeUsar, escolherProvedor, modeloAtual, chamarIA } from "./_ia.js";

const LIMITE_ENTRADA = 24000;   // caracteres, para conter o custo por chamada
/* Teto de saída. Estava em 1400, e um plano de semana passa disso fácil: a
   resposta chegava cortada no meio da frase, sem nada dizendo por quê. Os
   modelos de hoje também gastam parte deste teto pensando antes de escrever,
   o que apertava ainda mais o que sobrava para o texto. */
const MAX_SAIDA = 4000;

/* Os modelos que a chave do Gemini alcança, do jeito que o Google os
   descreve. Só os que geram texto entram: a lista crua traz também os de
   embedding e os de imagem, que não servem para nada daqui. */
async function listarModelos(env) {
  if (!env.GEMINI_API_KEY) {
    return json({ erro: "Sem GEMINI_API_KEY não dá para perguntar ao Google quais modelos existem." }, 400);
  }
  let r;
  try {
    r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
      headers: { "x-goog-api-key": env.GEMINI_API_KEY },
    });
  } catch (e) {
    return json({ erro: "Não consegui alcançar o Google para listar os modelos." }, 502);
  }
  const j = await r.json().catch(() => null);
  if (!r.ok) {
    const real = (j && j.error && j.error.message) || `resposta ${r.status}`;
    return json({ erro: `O Google recusou a lista de modelos: ${real}` }, 502);
  }
  const modelos = ((j && j.models) || [])
    .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map((m) => ({
      nome: String(m.name || "").replace(/^models\//, ""),
      rotulo: m.displayName || "",
      entrada: m.inputTokenLimit || 0,
      saida: m.outputTokenLimit || 0,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
  return json({ emUso: modeloAtual(escolherProvedor(env), env), quantos: modelos.length, modelos });
}

export async function onRequest({ request, env }) {
  const provedor = escolherProvedor(env);
  const modelo = modeloAtual(provedor, env);

  /* Abrir o endereço no navegador mostra qual IA está ligada. Serve para
     conferir, depois de publicar, se a chave chegou até aqui. Nenhuma chave
     é mostrada, só o nome do provedor e do modelo. */
  if (request.method === "GET") {
    /* ...e com ?modelos=1, quais modelos ESTA chave aceita hoje.
     *
     * O Google aposenta e lança modelo sem aviso, e o nome que servia mês
     * passado pode não existir mais. Chutar pela memória é como o
     * gemini-1.5-flash foi parar no código depois de já ter saído de
     * circulação para chave nova. Aqui quem responde é o próprio provedor.
     * Nome de modelo não é segredo, e a chave continua sem sair daqui. */
    if (new URL(request.url).searchParams.get("modelos")) {
      return listarModelos(env);
    }
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
    const r = await chamarIA(provedor, modelo, { sistema, mensagens: limpas, maxSaida: MAX_SAIDA });
    if (r.erro) return json({ erro: r.erro }, 502);
    return json({ texto: r.texto, cortado: !!r.cortado });
  } catch (e) {
    console.error("falha", provedor.nome, e && e.message);
    return json({ erro: "Não consegui alcançar o serviço da IA." }, 502);
  }
}
